const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// ─── Chave de API ───────────────────────────────────────────────────────────
// A chave pode vir da variável de ambiente OU ser salva pelo próprio app.
// Quando o SO oferece criptografia (safeStorage), a chave é gravada cifrada
// com o cofre de credenciais do sistema; senão, cai no formato antigo em texto.
function keyFilePath() {
  return path.join(app.getPath('userData'), 'api-key.json');
}

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const raw = fs.readFileSync(keyFilePath(), 'utf-8');
    const data = JSON.parse(raw);
    // Formato novo (cifrado): { enc: "<base64>" }.
    if (data.enc && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(data.enc, 'base64'));
    }
    // Formato antigo (texto puro) — mantido para compatibilidade.
    return data.apiKey || '';
  } catch {
    return '';
  }
}

function setApiKey(key) {
  try {
    const value = String(key || '');
    let payload;
    if (value && safeStorage.isEncryptionAvailable()) {
      payload = { enc: safeStorage.encryptString(value).toString('base64') };
    } else {
      payload = { apiKey: value };
    }
    fs.writeFileSync(keyFilePath(), JSON.stringify(payload), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Dybass Estudioso',
    backgroundColor: '#0a0a0a',
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

// Salva conteúdo em arquivo usando o diálogo nativo do sistema.
ipcMain.handle('export-file', async (event, { defaultName, content, filters }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar',
      defaultPath: defaultName,
      filters: filters || [{ name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Informa ao renderer se há chave de API configurada (para sugerir modo offline).
ipcMain.handle('has-api-key', async () => {
  return !!getApiKey();
});

// Salva a chave de API digitada pelo usuário no app.
ipcMain.handle('set-api-key', async (event, key) => {
  return setApiKey(key);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IA (Modo Online) ─────────────────────────────────────────────────────────
const MODEL = 'claude-haiku-4-5-20251001';
// Teto de conteúdo enviado à API (~ segurança de custo/contexto). ~48k chars ≈ 12k tokens.
const MAX_CONTENT_CHARS = 48000;

function guardContent(content) {
  const text = String(content || '');
  if (text.trim().length < 20) {
    return { error: 'Conteúdo muito curto. Cole ou importe mais texto para estudar.' };
  }
  if (text.length > MAX_CONTENT_CHARS) {
    return {
      error: `Conteúdo muito longo (${text.length.toLocaleString('pt-BR')} caracteres). ` +
        `Reduza para até ${MAX_CONTENT_CHARS.toLocaleString('pt-BR')} caracteres ou divida em partes.`,
    };
  }
  return { text };
}

function client() {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: getApiKey() });
}

// O conteúdo vai no system como bloco CACHEÁVEL: como resumo, flashcards e quiz
// usam o mesmo conteúdo, as chamadas seguintes reaproveitam o cache (mais barato
// e mais rápido). A tarefa específica vai na mensagem do usuário.
function systemWithContent(text) {
  return [
    {
      type: 'text',
      text: 'Você é um assistente educacional que responde sempre em português brasileiro. ' +
        'Use exclusivamente o conteúdo de referência abaixo.\n\n=== CONTEÚDO DE REFERÊNCIA ===\n' + text,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

ipcMain.handle('generate-summary', async (event, content, type) => {
  try {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };

    const fmt = `Organize o resumo por CAPÍTULOS/TÓPICOS do conteúdo. Comece com uma linha "# Resumo Completo" (ou "# Resumo Simples"). Para cada capítulo/tópico, use uma linha começando com "## " seguida do título. Use "• " no início de cada tópico e, ao final de cada capítulo, uma linha começando com "★ Conceitos-chave: " listando os termos importantes. Não use blocos de código.`;
    const task = type === 'completo'
      ? `Crie um resumo DETALHADO e COMPLETO do conteúdo de referência, cobrindo todos os pontos importantes, conceitos-chave e exemplos.\n\n${fmt}`
      : `Crie um resumo SIMPLES e BREVE do conteúdo de referência, com bullet points curtos e diretos (apenas o essencial).\n\n${fmt}`;

    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemWithContent(g.text),
      messages: [{ role: 'user', content: task }],
    });

    const textOut = message.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!textOut) throw new Error('A IA não retornou texto.');
    return { success: true, data: textOut };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Ferramenta que força a IA a devolver os flashcards como JSON válido
// (sem depender de regex frágil no texto).
const FLASHCARDS_TOOL = {
  name: 'registrar_flashcards',
  description: 'Registra os flashcards de estudo gerados.',
  input_schema: {
    type: 'object',
    properties: {
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string', description: 'A pergunta/frente do card.' },
            back: { type: 'string', description: 'A resposta/verso do card.' },
            chapter: { type: 'string', description: 'Capítulo/tópico do conteúdo.' },
          },
          required: ['front', 'back', 'chapter'],
        },
      },
    },
    required: ['flashcards'],
  },
};

const QUIZ_TOOL = {
  name: 'registrar_quiz',
  description: 'Registra as questões de múltipla escolha geradas.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'O enunciado da questão.' },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Exatamente 4 alternativas.',
            },
            correct: { type: 'integer', description: 'Índice (0-3) da alternativa correta.' },
            chapter: { type: 'string', description: 'Capítulo/tópico do conteúdo.' },
          },
          required: ['question', 'options', 'correct', 'chapter'],
        },
      },
    },
    required: ['questions'],
  },
};

// Extrai o input do tool_use forçado na resposta.
function toolResult(message, toolName) {
  const block = message.content.find(b => b.type === 'tool_use' && b.name === toolName);
  if (!block || !block.input) throw new Error('A IA não retornou os dados esperados.');
  return block.input;
}

ipcMain.handle('generate-flashcards', async (event, content) => {
  try {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };

    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemWithContent(g.text),
      tools: [FLASHCARDS_TOOL],
      tool_choice: { type: 'tool', name: 'registrar_flashcards' },
      messages: [{
        role: 'user',
        content: 'Crie de 10 a 14 flashcards de estudo, distribuídos entre os diferentes ' +
          'capítulos/tópicos do conteúdo, cobrindo os conceitos mais importantes de cada seção.',
      }],
    });

    const cards = toolResult(message, 'registrar_flashcards').flashcards || [];
    if (!cards.length) throw new Error('Nenhum flashcard foi gerado.');
    return { success: true, data: cards };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-quiz', async (event, content) => {
  try {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };

    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemWithContent(g.text),
      tools: [QUIZ_TOOL],
      tool_choice: { type: 'tool', name: 'registrar_quiz' },
      messages: [{
        role: 'user',
        content: 'Crie de 8 a 12 questões de múltipla escolha (4 alternativas cada), ' +
          'distribuídas entre os diferentes capítulos/tópicos, testando a compreensão ' +
          'dos conceitos principais de cada seção. O campo "correct" é o índice (0-3) da correta.',
      }],
    });

    const questions = (toolResult(message, 'registrar_quiz').questions || [])
      // Descarta questões malformadas antes de entregar ao app.
      .filter(q => Array.isArray(q.options) && q.options.length >= 2 &&
        Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length);
    if (!questions.length) throw new Error('Nenhuma questão válida foi gerada.');
    return { success: true, data: questions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
