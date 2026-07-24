// ─── Adaptador WEB do Dybass Estudioso ────────────────────────────────────────
// Faz o app (a MESMA tela do desktop) funcionar no navegador: fornece
// window.electronAPI chamando este servidor (/api/chat) direto do navegador.
// A lógica de prompts/ferramentas espelha o main.js do app desktop.
//
// O código de acesso é pedido ao usuário UMA vez (lazy, só ao gerar) e guardado
// no navegador — nunca fica embutido na página.
(function () {
  const MODEL = 'claude-haiku-4-5-20251001';
  const MAX_CONTENT_CHARS = 48000;

  function getCode() {
    let code = localStorage.getItem('dybass_web_code') || '';
    if (!code) {
      code = (window.prompt('Digite o código de acesso do Dybass (peça a quem compartilhou o link):') || '').trim();
      if (code) localStorage.setItem('dybass_web_code', code);
    }
    return code;
  }

  function guardContent(content) {
    const text = String(content || '');
    if (text.trim().length < 20) {
      return { error: 'Conteúdo muito curto. Cole ou importe mais texto para estudar.' };
    }
    if (text.length > MAX_CONTENT_CHARS) {
      return {
        error: 'Conteúdo muito longo (' + text.length.toLocaleString('pt-BR') + ' caracteres). ' +
          'Reduza para até ' + MAX_CONTENT_CHARS.toLocaleString('pt-BR') + ' caracteres ou divida em partes.',
      };
    }
    return { text };
  }

  function systemWithContent(text) {
    return [{
      type: 'text',
      text: 'Você é um assistente educacional que responde sempre em português brasileiro. ' +
        'Use exclusivamente o conteúdo de referência abaixo.\n\n=== CONTEÚDO DE REFERÊNCIA ===\n' + text,
      cache_control: { type: 'ephemeral' },
    }];
  }

  async function callBackend(payload) {
    const code = getCode();
    if (!code) throw new Error('É necessário o código de acesso para usar o Modo Online.');
    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-code': code },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('dybass_web_code'); // limpa código errado para repedir
      throw new Error('Código de acesso inválido. Tente gerar de novo e digite o código correto.');
    }
    if (!res.ok) throw new Error(data.error || ('Erro do servidor (HTTP ' + res.status + ').'));
    return data;
  }

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
              options: { type: 'array', items: { type: 'string' }, description: 'Exatamente 4 alternativas.' },
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

  function toolResult(message, toolName) {
    const block = (message.content || []).find(b => b.type === 'tool_use' && b.name === toolName);
    if (!block || !block.input) throw new Error('A IA não retornou os dados esperados.');
    return block.input;
  }

  async function generateSummary(content, type) {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };
    try {
      const fmt = 'Organize o resumo por CAPÍTULOS/TÓPICOS do conteúdo. Comece com uma linha "# Resumo Completo" (ou "# Resumo Simples"). Para cada capítulo/tópico, use uma linha começando com "## " seguida do título. Use "• " no início de cada tópico e, ao final de cada capítulo, uma linha começando com "★ Conceitos-chave: " listando os termos importantes. Não use blocos de código.';
      const task = type === 'completo'
        ? 'Crie um resumo DETALHADO e COMPLETO do conteúdo de referência, cobrindo todos os pontos importantes, conceitos-chave e exemplos.\n\n' + fmt
        : 'Crie um resumo SIMPLES e BREVE do conteúdo de referência, com bullet points curtos e diretos (apenas o essencial).\n\n' + fmt;
      const message = await callBackend({
        model: MODEL, max_tokens: 8192, system: systemWithContent(g.text),
        messages: [{ role: 'user', content: task }],
      });
      const textOut = (message.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (!textOut) throw new Error('A IA não retornou texto.');
      return { success: true, data: textOut };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function generateFlashcards(content) {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };
    try {
      const message = await callBackend({
        model: MODEL, max_tokens: 8192, system: systemWithContent(g.text),
        tools: [FLASHCARDS_TOOL], tool_choice: { type: 'tool', name: 'registrar_flashcards' },
        messages: [{ role: 'user', content: 'Crie de 10 a 14 flashcards de estudo, distribuídos entre os diferentes capítulos/tópicos do conteúdo, cobrindo os conceitos mais importantes de cada seção.' }],
      });
      const cards = toolResult(message, 'registrar_flashcards').flashcards || [];
      if (!cards.length) throw new Error('Nenhum flashcard foi gerado.');
      return { success: true, data: cards };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function generateQuiz(content) {
    const g = guardContent(content);
    if (g.error) return { success: false, error: g.error };
    try {
      const message = await callBackend({
        model: MODEL, max_tokens: 8192, system: systemWithContent(g.text),
        tools: [QUIZ_TOOL], tool_choice: { type: 'tool', name: 'registrar_quiz' },
        messages: [{ role: 'user', content: 'Crie de 8 a 12 questões de múltipla escolha (4 alternativas cada), distribuídas entre os diferentes capítulos/tópicos, testando a compreensão dos conceitos principais de cada seção. O campo "correct" é o índice (0-3) da correta.' }],
      });
      const questions = (toolResult(message, 'registrar_quiz').questions || []).filter(q =>
        Array.isArray(q.options) && q.options.length >= 2 &&
        Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length);
      if (!questions.length) throw new Error('Nenhuma questão válida foi gerada.');
      return { success: true, data: questions };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Fornece a MESMA interface que o app espera do Electron (menos exportFile,
  // para o app cair no download via navegador automaticamente).
  window.electronAPI = { generateSummary, generateFlashcards, generateQuiz };
})();
