// ─── Dybass Estudioso — Motor Offline ──────────────────────────────────────
// Gera resumos, flashcards e quiz localmente, sem internet e sem chave de API.
// Usa técnicas de processamento de texto (frequência de termos, extração de
// sentenças e cloze deletion) para funcionar 100% offline.

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
    'qualquer cada outro outra outros outras mesmo mesma tão quão'
  ).split(/\s+/));

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

  function scoreSentences(sentences, freq) {
    return sentences.map((s, idx) => {
      const words = tokenize(s);
      const score = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / (words.length + 1);
      return { sentence: s, score, idx };
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Seleciona as N sentenças de maior pontuação, com um toque de variação para
  // que gerações repetidas tragam material diferente ("renovado").
  function topSentences(scored, n, jitter = 0.25) {
    const pool = scored
      .map(s => ({ ...s, jitterScore: s.score * (1 - jitter + Math.random() * jitter * 2) }))
      .sort((a, b) => b.jitterScore - a.jitterScore)
      .slice(0, n);
    return pool;
  }

  function keywordsOf(sentence, freq) {
    return tokenize(sentence)
      .map(w => ({ w, f: freq[w] || 0 }))
      .sort((a, b) => b.f - a.f)
      .map(x => x.w);
  }

  // ─── Resumo ───────────────────────────────────────────────────────────────
  function generateSummary(content, type) {
    const sentences = splitSentences(content);
    if (sentences.length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar um resumo offline.' };
    }
    const freq = wordFrequencies(content);
    const scored = scoreSentences(sentences, freq);

    if (type === 'simples') {
      const count = Math.min(8, Math.max(3, Math.ceil(sentences.length * 0.2)));
      const picked = topSentences(scored, count)
        .sort((a, b) => a.idx - b.idx)
        .map(s => '• ' + s.sentence);
      return { success: true, data: 'Resumo simples (modo offline):\n\n' + picked.join('\n') };
    }

    // Completo: ~40% das sentenças, na ordem original, agrupadas em parágrafos.
    const count = Math.min(sentences.length, Math.max(5, Math.ceil(sentences.length * 0.4)));
    const picked = topSentences(scored, count, 0.15)
      .sort((a, b) => a.idx - b.idx)
      .map(s => s.sentence);

    const topTerms = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(x => x[0]);

    let out = 'Resumo completo (modo offline):\n\n';
    out += picked.join(' ') + '\n\n';
    out += 'Conceitos-chave: ' + topTerms.join(', ') + '.';
    return { success: true, data: out };
  }

  // ─── Flashcards ───────────────────────────────────────────────────────────
  function generateFlashcards(content) {
    const sentences = splitSentences(content);
    if (sentences.length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar flashcards offline.' };
    }
    const freq = wordFrequencies(content);
    const scored = scoreSentences(sentences, freq);
    const picked = shuffle(topSentences(scored, Math.min(14, sentences.length))).slice(0, 10);

    const cards = picked.map(({ sentence }) => {
      const kws = keywordsOf(sentence, freq);
      const key = kws[0];
      if (!key) {
        return { front: 'Complete a ideia:', back: sentence };
      }
      const re = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const front = sentence.replace(re, '________');
      return {
        front: 'Complete: ' + front,
        back: key + '\n\n(Frase completa: ' + sentence + ')',
      };
    });

    return { success: true, data: cards };
  }

  // ─── Quiz ─────────────────────────────────────────────────────────────────
  function generateQuiz(content) {
    const sentences = splitSentences(content);
    if (sentences.length === 0) {
      return { success: false, error: 'Conteúdo muito curto para gerar um quiz offline.' };
    }
    const freq = wordFrequencies(content);
    const scored = scoreSentences(sentences, freq);
    const allKeywords = Object.keys(freq).filter(w => freq[w] >= 1);
    const picked = shuffle(topSentences(scored, Math.min(12, sentences.length))).slice(0, 8);

    const questions = picked.map(({ sentence }) => {
      const kws = keywordsOf(sentence, freq);
      const key = kws[0] || allKeywords[0];
      const re = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const blanked = sentence.replace(re, '________');

      // Distratores: palavras-chave diferentes da correta.
      const distractors = shuffle(allKeywords.filter(w => w !== key)).slice(0, 3);
      while (distractors.length < 3) distractors.push('—');

      const options = shuffle([key, ...distractors]);
      const correct = options.indexOf(key);

      return {
        question: 'Qual palavra completa: "' + blanked + '"?',
        options,
        correct,
      };
    });

    return { success: true, data: questions };
  }

  window.offlineAI = {
    generateSummary,
    generateFlashcards,
    generateQuiz,
  };
})();
