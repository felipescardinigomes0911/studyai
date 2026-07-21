// ─── Dybass Estudioso — Motor Offline ──────────────────────────────────────
// Gera resumos, flashcards e quiz localmente, sem internet e sem chave de API.
// Detecta capítulos/tópicos no conteúdo e organiza todo o material por seção,
// usando processamento de texto (frequência de termos com peso por posição,
// nomes próprios e números, extração de sentenças e cloze deletion).

(function () {
  // Stopwords em português — palavras comuns ignoradas na pontuação.
  const STOPWORDS = new Set((
    'a o e de da do das dos em no na nos nas um uma uns umas que se por para com sem ' +
    'como mais menos muito muita pouco pouca todo toda todos todas este esta isto esse ' +
    'essa isso aquele aquela aquilo seu sua seus suas meu minha nosso nossa eles elas ele ' +
    'ela nós vós você vocês eu tu lhe lhes me te nos vos ao aos à às pelo pela pelos pelas ' +
    'num numa entre sobre sob ante após até desde durante perante mediante segundo conforme ' +
    'mas porém contudo todavia entretanto porque pois portanto logo então assim já não sim ' +
    'também ou nem quando onde quem qual quais cujo cuja ser estar ter haver foi são era é ' +
    'será seria tem têm havia houve seja sejam está estão estava estavam dele dela deles delas ' +
    'qualquer cada outro outra outros outras mesmo mesma tão quão pode podem deve devem ' +
    'sua seu isso está aqui ali lá bem ainda apenas somente através dentro fora acima abaixo'
  ).split(/\s+/));

  // Palavras que costumam iniciar títulos de capítulo/seção.
  const HEADING_WORDS = /^(cap[íi]tulo|unidade|se[çc][ãa]o|parte|t[óo]pico|aula|m[óo]dulo|li[çc][ãa]o|tema)\b/i;

  function splitSentences(text) {
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.split(/\s+/).length >= 4);
  }

  function tokenize(text) {
    return (text.toLowerCase().match(/[a-zà-ÿ0-9]+/gi) || [])
      .filter(w => w.length > 3 && !STOPWORDS.has(w));
  }

  function wordFrequencies(text) {
    const freq = {};
    for (const w of tokenize(text)) freq[w] = (freq[w] || 0) + 1;
    return freq;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ─── Detecção de capítulos / tópicos ───────────────────────────────────────
  // Reconhece títulos por: markdown (#), "Capítulo X", numeração (1. / 1.2),
  // ou linhas curtas em MAIÚSCULAS. Se nada for encontrado, divide o conteúdo
  // em partes equilibradas para manter a organização.
  function isHeading(line) {
    const t = line.trim();
    if (!t || t.length > 90) return false;
    if (/^#{1,4}\s+\S/.test(t)) return true;
    if (HEADING_WORDS.test(t)) return true;
    if (/^\d+(\.\d+)*[.)\-–]?\s+\S.{2,70}$/.test(t) && t.split(/\s+/).length <= 12) return true;
    // Linha curta, sem pontuação final, majoritariamente em maiúsculas.
    const letters = t.replace(/[^a-zà-ÿA-ZÀ-Ý]/g, '');
    if (letters.length >= 4 && !/[.!?:;,]$/.test(t) && t.split(/\s+/).length <= 10) {
      const upper = (t.match(/[A-ZÀ-Ý]/g) || []).length;
      const lower = (t.match(/[a-zà-ÿ]/g) || []).length;
      if (upper >= lower && upper >= 3) return true;
    }
    return false;
  }

  function cleanTitle(line) {
    return line.trim().replace(/^#{1,4}\s+/, '').replace(/^\d+(\.\d+)*[.)\-–]?\s+/, '').trim();
  }

  function detectChapters(content) {
    const lines = content.split('\n');
    const chapters = [];
    let title = null;
    let buffer = [];

    const flush = () => {
      const text = buffer.join('\n').trim();
      if (text && splitSentences(text).length >= 1) {
        chapters.push({ title: title || 'Introdução', text });
      }
      buffer = [];
    };

    for (const line of lines) {
      if (isHeading(line)) {
        flush();
        title = cleanTitle(line);
      } else {
        buffer.push(line);
      }
    }
    flush();

    // Sem títulos reconhecidos: divide o conteúdo em partes equilibradas.
    if (chapters.length <= 1) {
      const paras = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const totalSent = splitSentences(content).length;
      if (paras.length >= 4 && totalSent >= 12) {
        const parts = Math.min(6, Math.max(2, Math.round(paras.length / 4)));
        const perPart = Math.ceil(paras.length / parts);
        const out = [];
        for (let i = 0; i < paras.length; i += perPart) {
          const text = paras.slice(i, i + perPart).join('\n\n');
          if (text.trim()) out.push({ title: 'Parte ' + (out.length + 1), text });
        }
        if (out.length >= 2) return out;
      }
      return [{ title: chapters[0] ? chapters[0].title : 'Conteúdo', text: content.trim() }];
    }
    return chapters;
  }

  // ─── Pontuação de sentenças (para o resumo) ────────────────────────────────
  function scoreSentences(sentences, freq) {
    const n = sentences.length;
    return sentences.map((s, idx) => {
      const words = tokenize(s);
      if (words.length === 0) return { sentence: s, score: 0, idx };
      let score = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(words.length + 1);
      // Bônus para as primeiras sentenças (introduzem o tópico).
      if (idx === 0) score *= 1.6;
      else if (idx <= 2) score *= 1.25;
      // Nomes próprios (maiúscula no meio da frase) indicam informação relevante.
      const proper = (s.slice(1).match(/[A-ZÀ-Ý][a-zà-ÿ]{2,}/g) || []).length;
      score *= (1 + Math.min(proper, 4) * 0.08);
      // Números, datas e percentuais costumam ser fatos importantes.
      if (/\d/.test(s)) score *= 1.12;
      // Penaliza sentenças muito longas (difíceis num resumo).
      if (words.length > 40) score *= 0.85;
      return { sentence: s, score, idx };
    });
  }

  function topSentences(scored, n, jitter = 0.12) {
    return scored
      .map(s => ({ ...s, j: s.score * (1 - jitter + Math.random() * jitter * 2) }))
      .sort((a, b) => b.j - a.j)
      .slice(0, n);
  }

  function keywordsOf(sentence, freq) {
    return tokenize(sentence)
      .map(w => ({ w, f: freq[w] || 0 }))
      .sort((a, b) => b.f - a.f)
      .filter((x, i, arr) => arr.findIndex(y => y.w === x.w) === i)
      .map(x => x.w);
  }

  function chapterKeyTerms(text, freq, max = 6) {
    const local = wordFrequencies(text);
    return Object.keys(local)
      .sort((a, b) => (freq[b] || 0) - (freq[a] || 0))
      .slice(0, max);
  }

  // ─── Resumo ───────────────────────────────────────────────────────────────
  function summarizeChapter(ch, freq, type) {
    const sentences = splitSentences(ch.text);
    if (sentences.length === 0) return '';
    const scored = scoreSentences(sentences, freq);

    if (type === 'simples') {
      const count = Math.min(5, Math.max(2, Math.ceil(sentences.length * 0.22)));
      const picked = topSentences(scored, count)
        .sort((a, b) => a.idx - b.idx)
        .map(s => '• ' + s.sentence);
      return picked.join('\n');
    }

    // Completo: parágrafo corrido + conceitos-chave do capítulo.
    const count = Math.min(sentences.length, Math.max(3, Math.ceil(sentences.length * 0.45)));
    const picked = topSentences(scored, count, 0.08)
      .sort((a, b) => a.idx - b.idx)
      .map(s => s.sentence);
    const terms = chapterKeyTerms(ch.text, freq, 6);
    let out = picked.join(' ');
    if (terms.length) out += '\n\n★ Conceitos-chave: ' + terms.join(', ') + '.';
    return out;
  }

  function generateSummary(content, type) {
    const chapters = detectChapters(content);
    if (chapters.length === 0 || splitSentences(content).length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar um resumo offline.' };
    }
    const freq = wordFrequencies(content);
    const parts = [];
    const title = type === 'simples' ? '# Resumo Simples' : '# Resumo Completo';
    parts.push(title);

    for (const ch of chapters) {
      const body = summarizeChapter(ch, freq, type);
      if (body) {
        parts.push('\n## ' + ch.title);
        parts.push(body);
      }
    }
    return { success: true, data: parts.join('\n') };
  }

  // ─── Flashcards ───────────────────────────────────────────────────────────
  function cardsFromChapter(ch, freq, limit) {
    const sentences = splitSentences(ch.text);
    if (sentences.length === 0) return [];
    const scored = scoreSentences(sentences, freq);
    const picked = topSentences(scored, Math.min(limit + 3, sentences.length)).slice(0, limit);

    return picked.map(({ sentence }) => {
      const kws = keywordsOf(sentence, freq);
      const key = kws[0];
      if (!key) return { front: 'Complete a ideia:', back: sentence, chapter: ch.title };
      const re = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const front = sentence.replace(re, '________');
      return {
        front: 'Complete: ' + front,
        back: key + '\n\n(Frase completa: ' + sentence + ')',
        chapter: ch.title,
      };
    });
  }

  function generateFlashcards(content) {
    const chapters = detectChapters(content);
    const freq = wordFrequencies(content);
    const total = 12;
    const per = Math.max(1, Math.ceil(total / chapters.length));
    let cards = [];
    for (const ch of chapters) {
      cards = cards.concat(cardsFromChapter(ch, freq, per));
    }
    if (cards.length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar flashcards offline.' };
    }
    // Mistura mantendo variedade, mas preserva a diversidade de capítulos.
    return { success: true, data: shuffle(cards).slice(0, Math.max(total, chapters.length)) };
  }

  // ─── Quiz ─────────────────────────────────────────────────────────────────
  // Escolhe distratores plausíveis: palavras de FREQUÊNCIA parecida com a
  // resposta (nem óbvias por serem raras, nem por serem as mais comuns) e que
  // não caibam na lacuna. Evita alternativas duplicadas ou sem sentido.
  function pickDistractors(key, sentence, freq, rankedKeywords, n) {
    const keyFreq = freq[key] || 1;
    const used = new Set([key.toLowerCase()]);
    // Palavras que aparecem na própria frase também completariam a lacuna → fora.
    for (const w of tokenize(sentence)) used.add(w);
    const candidates = rankedKeywords
      .filter(w => !used.has(w))
      .map(w => ({ w, dist: Math.abs((freq[w] || 0) - keyFreq) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, Math.max(n * 4, 8));
    const out = [];
    for (const c of shuffle(candidates)) {
      if (out.length >= n) break;
      if (!used.has(c.w)) { out.push(c.w); used.add(c.w); }
    }
    while (out.length < n) out.push('—');
    return out;
  }

  function questionsFromChapter(ch, freq, rankedKeywords, limit) {
    const sentences = splitSentences(ch.text);
    if (sentences.length === 0) return [];
    const scored = scoreSentences(sentences, freq);
    const picked = topSentences(scored, Math.min(limit + 2, sentences.length)).slice(0, limit);

    return picked.map(({ sentence }) => {
      const kws = keywordsOf(sentence, freq);
      const key = kws[0] || rankedKeywords[0];
      const re = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const blanked = sentence.replace(re, '________');
      const distractors = pickDistractors(key, sentence, freq, rankedKeywords, 3);
      const options = shuffle([key, ...distractors]);
      return {
        question: 'Qual palavra completa: "' + blanked + '"?',
        options,
        correct: options.indexOf(key),
        chapter: ch.title,
      };
    }).filter(q => q.correct >= 0); // descarta se a resposta colidiu com um distrator
  }

  function generateQuiz(content) {
    const chapters = detectChapters(content);
    const freq = wordFrequencies(content);
    // Palavras ordenadas por frequência (base para distratores parecidos).
    const rankedKeywords = Object.keys(freq)
      .filter(w => freq[w] >= 1)
      .sort((a, b) => freq[b] - freq[a]);
    const total = 10;
    const per = Math.max(1, Math.ceil(total / chapters.length));
    let questions = [];
    for (const ch of chapters) {
      questions = questions.concat(questionsFromChapter(ch, freq, rankedKeywords, per));
    }
    if (questions.length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar um quiz offline.' };
    }
    return { success: true, data: shuffle(questions).slice(0, Math.max(total, chapters.length)) };
  }

  window.offlineAI = {
    detectChapters,
    generateSummary,
    generateFlashcards,
    generateQuiz,
  };
})();
