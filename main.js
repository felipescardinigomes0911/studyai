const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// ─── Chave de API ───────────────────────────────────────────────────────────
// A chave pode vir da variável de ambiente OU ser salva pelo próprio app,
// num arquivo dentro da pasta de dados do usuário (userData).
function keyFilePath() {
  return path.join(app.getPath('userData'), 'api-key.json');
}

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const raw = fs.readFileSync(keyFilePath(), 'utf-8');
    const data = JSON.parse(raw);
    return data.apiKey || '';
  } catch {
    return '';
  }
}

function setApiKey(key) {
  try {
    fs.writeFileSync(keyFilePath(), JSON.stringify({ apiKey: String(key || '') }), 'utf-8');
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

// IPC Handlers

ipcMain.handle('generate-summary', async (event, content, type) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: getApiKey() });

    const fmt = `IMPORTANTE - organize o resumo por CAPÍTULOS/TÓPICOS do conteúdo. Comece com uma linha "# Resumo Completo" (ou "# Resumo Simples"). Para cada capítulo/tópico, use uma linha começando com "## " seguida do título do capítulo. Use "• " no início de cada tópico e, ao final de cada capítulo, uma linha começando com "★ Conceitos-chave: " listando os termos importantes daquele capítulo. Não use blocos de código.`;
    const prompt = type === 'completo'
      ? `Você é um assistente educacional. Crie um resumo DETALHADO e COMPLETO do seguinte conteúdo em português brasileiro, cobrindo todos os pontos importantes, conceitos-chave e exemplos.\n\n${fmt}\n\nConteúdo:\n${content}`
      : `Você é um assistente educacional. Crie um resumo SIMPLES e BREVE do seguinte conteúdo em português brasileiro, com bullet points curtos e diretos (apenas o essencial).\n\n${fmt}\n\nConteúdo:\n${content}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    return { success: true, data: message.content[0].text };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-flashcards', async (event, content) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: getApiKey() });

    const prompt = `Você é um assistente educacional. Com base no conteúdo abaixo, crie de 10 a 14 flashcards de estudo em português brasileiro, distribuídos entre os diferentes capítulos/tópicos do conteúdo.

Retorne APENAS um array JSON válido, sem texto adicional, sem markdown, sem blocos de código. Apenas o array JSON puro.

Formato: [{"front": "pergunta aqui", "back": "resposta aqui", "chapter": "nome do capítulo/tópico"}, ...]

O campo "chapter" deve identificar de qual capítulo/tópico o flashcard trata. Cubra os conceitos mais importantes de cada seção.

Conteúdo:
${content}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text.trim();
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Resposta inválida da IA');
    const flashcards = JSON.parse(jsonMatch[0]);
    return { success: true, data: flashcards };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-quiz', async (event, content) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: getApiKey() });

    const prompt = `Você é um assistente educacional. Com base no conteúdo abaixo, crie de 8 a 12 questões de múltipla escolha em português brasileiro, distribuídas entre os diferentes capítulos/tópicos do conteúdo.

Retorne APENAS um array JSON válido, sem texto adicional, sem markdown, sem blocos de código. Apenas o array JSON puro.

Formato: [{"question": "pergunta aqui", "options": ["opção A", "opção B", "opção C", "opção D"], "correct": 0, "chapter": "nome do capítulo/tópico"}, ...]

O campo "correct" deve ser o índice (0-3) da opção correta no array "options".
O campo "chapter" deve identificar de qual capítulo/tópico a questão trata.
As perguntas devem testar a compreensão dos conceitos principais de cada seção.

Conteúdo:
${content}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Resposta inválida da IA');
    const quiz = JSON.parse(jsonMatch[0]);
    return { success: true, data: quiz };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
