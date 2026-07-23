// ─── Backend do Dybass Estudioso ──────────────────────────────────────────────
// O que este servidor faz, em uma frase:
//   ele guarda a chave da Anthropic e fala com a API por você, para que a chave
//   NUNCA precise ficar no computador do usuário.
//
// Fluxo: app Electron  ──POST /api/chat──▶  este servidor  ──▶  API da Anthropic
//                                          (tem a chave)      (/v1/messages)
//
// Tudo que é segredo vem de variáveis de ambiente (.env). Nada fica no código.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ─── Configuração (vem toda do ambiente) ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;          // sua chave secreta
const ACCESS_CODE = process.env.ACCESS_CODE || '';                // código que o app envia
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';         // quem pode chamar (navegador)
// URL da Anthropic. É configurável só para permitir testes com um servidor falso.
const ANTHROPIC_URL = process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Sem a chave o servidor não tem o que fazer — avisa e para.
if (!ANTHROPIC_API_KEY) {
  console.error('ERRO: defina ANTHROPIC_API_KEY no arquivo .env (veja .env.example).');
  process.exit(1);
}

// Lê o corpo JSON das requisições (com um teto de tamanho, por segurança).
app.use(express.json({ limit: '1mb' }));

// CORS: controla quais páginas de navegador podem chamar este servidor.
// (O app Electron chama pelo processo principal, que não sofre CORS; isto é uma
//  camada extra de defesa para clientes de navegador.)
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Rate limiting: no máximo 60 requisições por IP a cada 15 minutos.
// Serve para conter abuso e proteger seu custo com a API.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições em pouco tempo. Espere alguns minutos e tente de novo.' },
});
app.use('/api/', limiter);

// Rota de "saúde": o Render usa para checar se o servidor está no ar.
app.get('/health', (req, res) => res.json({ ok: true }));

// Confere o código de acesso compartilhado enviado pelo app.
function checkAccess(req, res, next) {
  if (!ACCESS_CODE) return next(); // sem código configurado = liberado (útil só em dev)
  if (req.get('x-access-code') !== ACCESS_CODE) {
    return res.status(401).json({ error: 'Código de acesso inválido ou ausente.' });
  }
  next();
}

// ─── O endpoint principal ─────────────────────────────────────────────────────
// Recebe { model, max_tokens, system, messages, tools, tool_choice } do app,
// repassa para a Anthropic com a chave secreta, e devolve a resposta.
app.post('/api/chat', checkAccess, async (req, res) => {
  try {
    const { model, max_tokens, system, messages, tools, tool_choice } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'O campo "messages" é obrigatório.' });
    }

    // Monta só o que a Anthropic espera (ignora qualquer campo extra do cliente).
    const payload = {
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 2048,
      messages,
    };
    if (system) payload.system = system;
    if (tools) payload.tools = tools;
    if (tool_choice) payload.tool_choice = tool_choice;

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    // Se a Anthropic recusou, repassa o motivo de forma legível.
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'Erro na API da Anthropic.';
      return res.status(r.status).json({ error: msg });
    }

    res.json(data);
  } catch (e) {
    // Ex.: sem internet, DNS, timeout.
    res.status(502).json({ error: 'Não foi possível falar com a API da Anthropic: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend do Dybass rodando na porta ${PORT}`);
  console.log(`Código de acesso: ${ACCESS_CODE ? 'ATIVADO' : 'DESATIVADO (defina ACCESS_CODE)'}`);
});
