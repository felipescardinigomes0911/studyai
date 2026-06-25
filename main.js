const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = type === 'completo'
      ? `Você é um assistente educacional. Crie um resumo DETALHADO e COMPLETO do seguinte conteúdo em português brasileiro. O resumo deve cobrir todos os pontos importantes, conceitos-chave, exemplos e detalhes relevantes. Use formatação com títulos, subtítulos e bullet points quando apropriado.\n\nConteúdo:\n${content}`
      : `Você é um assistente educacional. Crie um resumo SIMPLES e BREVE do seguinte conteúdo em português brasileiro. Use bullet points curtos e diretos, destacando apenas os pontos mais essenciais. Máximo 10 bullet points.\n\nConteúdo:\n${content}`;

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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Você é um assistente educacional. Com base no conteúdo abaixo, crie EXATAMENTE 10 flashcards de estudo em português brasileiro.

Retorne APENAS um array JSON válido, sem texto adicional, sem markdown, sem blocos de código. Apenas o array JSON puro.

Formato: [{"front": "pergunta aqui", "back": "resposta aqui"}, ...]

Os flashcards devem cobrir os conceitos mais importantes do conteúdo.

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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Você é um assistente educacional. Com base no conteúdo abaixo, crie EXATAMENTE 8 questões de múltipla escolha em português brasileiro.

Retorne APENAS um array JSON válido, sem texto adicional, sem markdown, sem blocos de código. Apenas o array JSON puro.

Formato: [{"question": "pergunta aqui", "options": ["opção A", "opção B", "opção C", "opção D"], "correct": 0}, ...]

O campo "correct" deve ser o índice (0-3) da opção correta no array "options".
As perguntas devem testar a compreensão dos conceitos principais.

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
