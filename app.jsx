// Dybass Estudioso — código-fonte da UI (JSX).
// NÃO edite app.js diretamente: rode "npm run build:jsx" após editar este arquivo.

    const { useState, useEffect, useCallback } = React;

    // ─── Icons ───────────────────────────────────────────────────────────────
    const icons = {
      content:    '📝',
      summary:    '📋',
      flashcards: '🃏',
      quiz:       '🎯',
      check:      '✓',
      cross:      '✕',
      left:       '←',
      right:      '→',
      refresh:    '↺',
      save:       '💾',
      brain:      '🧠',
      star:       '⭐',
      trophy:     '🏆',
      sad:        '😞',
      ok:         '👍',
      sparkle:    '✨',
      stats:      '📊',
      sun:        '☀️',
      moon:       '🌙',
      upload:     '📁',
      trash:      '🗑️',
      book:       '📚',
      plus:       '＋',
      edit:       '✎',
    };

    // ─── Motor de IA (online via API ou offline local) ───────────────────────
    async function runAI(offline, method, ...args) {
      const engine = offline ? window.offlineAI : window.electronAPI;
      if (!engine || typeof engine[method] !== 'function') {
        return { success: false, error: offline
          ? 'Motor offline indisponível.'
          : 'API indisponível. Ative o Modo Offline na barra lateral.' };
      }
      return await Promise.resolve(engine[method](...args));
    }

    // ─── Exportação de arquivos ──────────────────────────────────────────────
    async function exportData(defaultName, content, mime) {
      // Em Electron usa o diálogo nativo; senão faz download via blob.
      if (window.electronAPI && window.electronAPI.exportFile) {
        const ext = defaultName.split('.').pop();
        const result = await window.electronAPI.exportFile({
          defaultName,
          content,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        });
        return result;
      }
      try {
        const blob = new Blob([content], { type: mime || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    function flashcardsToAnki(cards) {
      // Formato TSV compatível com importação do Anki: pergunta<TAB>resposta.
      return cards
        .map(c => {
          const front = String(c.front).replace(/\t/g, ' ').replace(/\n/g, '<br>');
          const back = String(c.back).replace(/\t/g, ' ').replace(/\n/g, '<br>');
          return front + '\t' + back;
        })
        .join('\n');
    }

    function flashcardsToCSV(cards) {
      const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
      return 'Pergunta,Resposta\n' +
        cards.map(c => esc(c.front) + ',' + esc(c.back)).join('\n');
    }

    // ─── Renderização do resumo organizado ───────────────────────────────────
    function renderSummary(text) {
      const lines = String(text).split('\n');
      const out = [];
      lines.forEach((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return;
        if (line.startsWith('# ')) {
          out.push(<div className="sum-title" key={i}>{line.slice(2)}</div>);
        } else if (line.startsWith('## ')) {
          out.push(<div className="sum-chapter" key={i}>{icons.summary} {line.slice(3)}</div>);
        } else if (line.startsWith('★')) {
          out.push(<div className="sum-terms" key={i}>{line}</div>);
        } else if (line.startsWith('•')) {
          out.push(<div className="sum-bullet" key={i}>{line}</div>);
        } else {
          out.push(<div className="sum-para" key={i}>{line}</div>);
        }
      });
      return out;
    }

    // ─── Seletor de capítulos (chips) ────────────────────────────────────────
    function ChapterChips({ chapters, value, onChange }) {
      if (!chapters || chapters.length <= 1) return null;
      return (
        <div className="chapter-bar">
          <span className="chapter-bar-label">Capítulo:</span>
          <button className={`chip ${value === null ? 'active' : ''}`} onClick={() => onChange(null)}>
            Todos
          </button>
          {chapters.map((c, i) => (
            <button key={i} className={`chip ${value === c ? 'active' : ''}`} onClick={() => onChange(c)}>
              {c}
            </button>
          ))}
        </div>
      );
    }

    // Detecta capítulos do conteúdo (mesmo motor, funciona online e offline).
    function detectChaptersOf(content) {
      try {
        if (window.offlineAI && window.offlineAI.detectChapters) {
          return window.offlineAI.detectChapters(content).map(c => c.title);
        }
      } catch { /* ignora */ }
      return [];
    }

    // Grava no localStorage com proteção: se estourar a cota (~5-10 MB, comum
    // com PDFs grandes), devolve uma mensagem em vez de derrubar o app.
    function safeSetItem(key, value) {
      try {
        localStorage.setItem(key, value);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Conteúdo grande demais para salvar no app. ' +
          'Reduza o texto ou divida em partes.' };
      }
    }

    // ─── Cadernos (biblioteca de conteúdos separados) ─────────────────────────
    // Cada "caderno" guarda seu próprio conteúdo, resumo, flashcards, quiz e
    // agendamento de revisão — tudo namespaceado por um id. Assim dá para ter
    // vários materiais salvos ao mesmo tempo, sem um apagar o outro.
    function setKey(id, name) { return 'set:' + id + ':' + name; }

    const SET_PARTS = ['content', 'summary', 'summary_type', 'flashcards', 'quiz', 'srs'];

    function newSetId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function loadSetsRaw() {
      try { return JSON.parse(localStorage.getItem('dybass_sets') || 'null'); } catch { return null; }
    }

    function saveSets(sets) { safeSetItem('dybass_sets', JSON.stringify(sets)); }

    function saveActiveId(id) { localStorage.setItem('dybass_active', id); }

    function loadContentFor(id) { return localStorage.getItem(setKey(id, 'content')) || ''; }

    // ─── Histórico de resumos por caderno ─────────────────────────────────────
    // Cada geração vira um item na lista (não sobrescreve os anteriores).
    function summaryTitle(type, ts) {
      const d = new Date(ts);
      const p = n => String(n).padStart(2, '0');
      return (type === 'completo' ? 'Completo' : 'Simples') +
        ' · ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function loadSummaries(setId) {
      try {
        const arr = JSON.parse(localStorage.getItem(setKey(setId, 'summaries')) || 'null');
        if (Array.isArray(arr)) return arr;
      } catch { /* ignora */ }
      // Migração do formato antigo (um único resumo) para a lista.
      const old = localStorage.getItem(setKey(setId, 'summary'));
      if (old) {
        const type = localStorage.getItem(setKey(setId, 'summary_type')) || 'completo';
        return [{ id: 'mig', title: summaryTitle(type, Date.now()), type, text: old, at: Date.now() }];
      }
      return [];
    }

    function saveSummaries(setId, list) { safeSetItem(setKey(setId, 'summaries'), JSON.stringify(list)); }

    // Apaga todo o material de um caderno.
    function purgeSet(id) {
      SET_PARTS.forEach(n => localStorage.removeItem(setKey(id, n)));
    }

    // Garante ao menos um caderno. Na primeira vez (upgrade de versão antiga),
    // migra as chaves globais antigas (dybass_content, _summary, etc.) para o
    // primeiro caderno, para nada se perder.
    function ensureSets() {
      let sets = loadSetsRaw();
      if (sets && sets.length) return sets;
      const id = newSetId();
      sets = [{ id, name: 'Meu conteúdo', createdAt: Date.now() }];
      const legacy = [
        ['dybass_content', 'content'],
        ['dybass_summary', 'summary'],
        ['dybass_summary_type', 'summary_type'],
        ['dybass_flashcards', 'flashcards'],
        ['dybass_quiz', 'quiz'],
        ['dybass_srs', 'srs'],
      ];
      for (const [oldK, part] of legacy) {
        const v = localStorage.getItem(oldK);
        if (v !== null) {
          localStorage.setItem(setKey(id, part), v);
          localStorage.removeItem(oldK);
        }
      }
      localStorage.setItem('dybass_sets', JSON.stringify(sets));
      localStorage.setItem('dybass_active', id);
      return sets;
    }

    function loadActiveId(sets) {
      const id = localStorage.getItem('dybass_active');
      if (id && sets.some(s => s.id === id)) return id;
      return sets[0].id;
    }

    // ─── Repetição espaçada (SM-2 simplificado, persistido) ───────────────────
    // Cada cartão ganha um agendamento salvo no PC: quando você acerta, ele volta
    // mais tarde (1d → 3d → 3d×facilidade…); quando erra, volta em minutos. Assim
    // o app foca nos cartões que você ainda não fixou, mesmo entre sessões.
    const SRS_DAY = 86400000;

    function srsKey(card) {
      const s = (card.front || '') + '|' + (card.back || '');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return 'c' + (h >>> 0).toString(36);
    }

    function loadSRS(setId) {
      try { return JSON.parse(localStorage.getItem(setKey(setId, 'srs')) || '{}'); } catch { return {}; }
    }

    function saveSRS(setId, map) { safeSetItem(setKey(setId, 'srs'), JSON.stringify(map)); }

    function isDue(sched) { return !sched || (sched.due || 0) <= Date.now(); }

    function nextSchedule(sched, good) {
      const now = Date.now();
      let ease = (sched && sched.ease) || 2.5;
      let interval = (sched && sched.interval) || 0;
      let reps = (sched && sched.reps) || 0;
      if (good) {
        reps += 1;
        if (reps === 1) interval = 1;
        else if (reps === 2) interval = 3;
        else interval = Math.max(1, Math.round(interval * ease));
        ease = Math.min(2.8, ease + 0.02);
        return { ease, interval, reps, due: now + interval * SRS_DAY, updated: now };
      }
      // Errou: volta ao aprendizado (revê em ~10 min) e fica um pouco mais difícil.
      ease = Math.max(1.3, ease - 0.2);
      return { ease, interval: 0, reps: 0, due: now + 10 * 60 * 1000, updated: now };
    }

    // ─── Estatísticas de estudo ──────────────────────────────────────────────
    function loadStats() {
      try {
        return JSON.parse(localStorage.getItem('dybass_stats')) || {};
      } catch { return {}; }
    }

    function defaultStats() {
      return { quizzes: [], flashcardsGenerated: 0, summariesGenerated: 0 };
    }

    function getStats() {
      return Object.assign(defaultStats(), loadStats());
    }

    function saveStats(stats) {
      localStorage.setItem('dybass_stats', JSON.stringify(stats));
    }

    function recordQuiz(score, total) {
      const s = getStats();
      s.quizzes.push({ date: Date.now(), score, total, pct: Math.round((score / total) * 100) });
      if (s.quizzes.length > 100) s.quizzes = s.quizzes.slice(-100);
      saveStats(s);
    }

    function recordEvent(key) {
      const s = getStats();
      s[key] = (s[key] || 0) + 1;
      saveStats(s);
    }

    // ─── Importação de arquivos (TXT / PDF) ──────────────────────────────────
    async function extractTextFromFile(file) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf')) {
        if (!window.pdfjsLib) throw new Error('Leitor de PDF não carregou. Verifique a conexão.');
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          text += tc.items.map(it => it.str).join(' ') + '\n\n';
        }
        const out = text.trim();
        // PDF sem texto extraível costuma ser digitalizado (imagem/foto).
        if (!out) {
          throw new Error('Este PDF parece ser digitalizado (imagem), sem texto selecionável. ' +
            'Use um PDF com texto ou cole o conteúdo manualmente.');
        }
        return out;
      }
      // TXT, MD e similares
      return await file.text();
    }

    // ─── Content Section ─────────────────────────────────────────────────────
    function ContentSection({ content, onContentChange }) {
      const [saved, setSaved] = useState(false);
      const [importing, setImporting] = useState(false);
      const [importError, setImportError] = useState('');
      const [search, setSearch] = useState('');
      const [matchIdx, setMatchIdx] = useState(0);
      const fileInputRef = React.useRef(null);
      const textareaRef = React.useRef(null);

      // Posições de todas as ocorrências da busca (case-insensitive).
      const matches = React.useMemo(() => {
        if (!search.trim()) return [];
        const out = [];
        const hay = content.toLowerCase();
        const needle = search.toLowerCase();
        let i = hay.indexOf(needle);
        while (i !== -1) {
          out.push(i);
          i = hay.indexOf(needle, i + needle.length);
        }
        return out;
      }, [search, content]);

      const jumpToMatch = (idx) => {
        if (matches.length === 0 || !textareaRef.current) return;
        const safe = ((idx % matches.length) + matches.length) % matches.length;
        setMatchIdx(safe);
        const start = matches[safe];
        const ta = textareaRef.current;
        ta.focus();
        ta.setSelectionRange(start, start + search.length);
        // Aproxima a seleção do topo visível da textarea.
        const before = content.slice(0, start).split('\n').length;
        const lineHeight = 26;
        ta.scrollTop = Math.max(0, (before - 3) * lineHeight);
      };

      // O conteúdo é salvo automaticamente no caderno ativo (App persiste em
      // onContentChange). O botão só reforça e mostra o aviso "Salvo".
      const handleSave = () => {
        onContentChange(content);
        setImportError('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      };

      const handleImport = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        setImporting(true);
        setImportError('');
        try {
          const text = await extractTextFromFile(file);
          if (!text.trim()) throw new Error('Nenhum texto extraído do arquivo.');
          // Acrescenta ao conteúdo existente (ou substitui se vazio).
          const merged = content.trim() ? content + '\n\n' + text : text;
          onContentChange(merged);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch (err) {
          setImportError('Erro ao importar: ' + err.message);
        }
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };

      return (
        <div>
          <div className="page-header">
            <h2>Conteúdo de Estudo</h2>
            <p>Cole ou digite o material que deseja estudar</p>
          </div>
          <div className="page-content">
            {content.trim() && (
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Buscar no conteúdo..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setMatchIdx(0); }}
                  onKeyDown={e => { if (e.key === 'Enter') jumpToMatch(matchIdx + (e.shiftKey ? -1 : 1)); }}
                />
                {search.trim() && (
                  <React.Fragment>
                    <span className="search-count">
                      {matches.length ? `${matches.length} resultado(s)` : 'nada encontrado'}
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={() => jumpToMatch(matchIdx - 1)} disabled={!matches.length}>
                      {icons.left}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => jumpToMatch(matchIdx + 1)} disabled={!matches.length}>
                      {icons.right}
                    </button>
                  </React.Fragment>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="content-textarea"
              value={content}
              onChange={e => onContentChange(e.target.value)}
              placeholder="Cole aqui seu conteúdo de estudo — textos, anotações, resumos de livros, artigos, etc.

O conteúdo será usado para gerar resumos, flashcards e questões automaticamente com inteligência artificial.

Quanto mais detalhado o conteúdo, melhores serão os materiais gerados."
            />
            <div className="content-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={!content.trim()}>
                {icons.save} Salvar Conteúdo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.text,.pdf"
                style={{display:'none'}}
                onChange={handleImport}
              />
              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={importing}
              >
                {importing ? <span className="loading-spinner" /> : icons.upload} Importar PDF/TXT
              </button>
              {saved && (
                <span className="saved-badge">
                  {icons.check} Salvo com sucesso
                </span>
              )}
              {content && (
                <span className="char-count">
                  {content.length.toLocaleString()} caracteres · {content.split(/\s+/).filter(Boolean).length.toLocaleString()} palavras
                </span>
              )}
            </div>

            {importError && (
              <div className="error-banner" style={{marginTop: 16}}>
                {icons.cross} {importError}
              </div>
            )}

            {!content.trim() && (
              <div className="empty-state" style={{marginTop: 32}}>
                <div className="empty-icon">{icons.brain}</div>
                <div className="empty-title">Nenhum conteúdo inserido</div>
                <div className="empty-desc">
                  Comece colando ou digitando o material de estudo acima. Use a barra lateral para navegar entre as seções após salvar.
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ─── Summary Section ──────────────────────────────────────────────────────
    function SummarySection({ content, offline, setId }) {
      const [summaries, setSummaries] = useState(() => loadSummaries(setId));
      const [activeSumId, setActiveSumId] = useState(() => (loadSummaries(setId)[0] || {}).id || null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');

      const active = summaries.find(s => s.id === activeSumId) || summaries[0] || null;

      const generate = async (type) => {
        if (!content.trim()) {
          setError('Adicione conteúdo de estudo na seção "Conteúdo" primeiro.');
          return;
        }
        setLoading(true);
        setError('');
        try {
          const result = await runAI(offline, 'generateSummary', content, type);
          if (result.success) {
            // Novo resumo entra no TOPO da lista, sem apagar os anteriores.
            const item = {
              id: 's' + Date.now().toString(36),
              title: summaryTitle(type, Date.now()),
              type, text: result.data, at: Date.now(),
            };
            const next = [item, ...summaries];
            setSummaries(next);
            saveSummaries(setId, next);
            setActiveSumId(item.id);
            recordEvent('summariesGenerated');
          } else {
            setError('Erro ao gerar resumo: ' + result.error);
          }
        } catch (e) {
          setError('Erro de conexão. Verifique sua internet e tente novamente.');
        }
        setLoading(false);
      };

      const removeSummary = (id) => {
        const next = summaries.filter(s => s.id !== id);
        setSummaries(next);
        saveSummaries(setId, next);
        if (activeSumId === id) setActiveSumId((next[0] || {}).id || null);
      };

      return (
        <div>
          <div className="page-header">
            <h2>Resumo</h2>
            <p>Cada geração vira um resumo salvo — eles se acumulam neste caderno.</p>
          </div>
          <div className="page-content">
            <div className="summary-actions">
              <button className="btn btn-primary" onClick={() => generate('completo')} disabled={loading}>
                {loading ? <span className="loading-spinner" /> : icons.sparkle}
                {summaries.length ? 'Novo Resumo Completo' : 'Resumo Completo'}
              </button>
              <button className="btn btn-outline" onClick={() => generate('simples')} disabled={loading}>
                {loading ? <span className="loading-spinner" /> : '•'}
                {summaries.length ? 'Novo Resumo Simples' : 'Resumo Simples'}
              </button>
              {summaries.length > 0 && (
                <span className="badge badge-red" style={{marginLeft: 'auto'}}>
                  {summaries.length} salvo{summaries.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Lista dos resumos salvos (histórico do caderno) */}
            {!loading && summaries.length > 0 && (
              <div className="saved-list">
                {summaries.map(s => (
                  <div key={s.id} className={`saved-chip ${s.id === active.id ? 'active' : ''}`}>
                    <button className="saved-chip-open" onClick={() => setActiveSumId(s.id)} title="Abrir este resumo">
                      {s.title}
                    </button>
                    <button className="saved-chip-del" onClick={() => removeSummary(s.id)} title="Excluir este resumo">
                      {icons.cross}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="error-banner">
                {icons.cross} {error}
              </div>
            )}

            {loading && (
              <div className="empty-state">
                <span className="loading-spinner" style={{width:36, height:36, borderWidth:3, marginBottom:16}} />
                <div className="empty-title">Gerando resumo...</div>
                <div className="empty-desc">A IA está processando seu conteúdo</div>
              </div>
            )}

            {!loading && active && (
              <div className="summary-result">{renderSummary(active.text)}</div>
            )}

            {!loading && !active && !error && (
              <div className="empty-state">
                <div className="empty-icon">{icons.summary}</div>
                <div className="empty-title">Nenhum resumo gerado</div>
                <div className="empty-desc">
                  Clique em "Resumo Completo" para um resumo detalhado ou "Resumo Simples" para bullet points rápidos.
                  Cada resumo fica salvo aqui.
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ─── Flashcards Section ───────────────────────────────────────────────────
    function FlashcardsSection({ content, offline, setId }) {
      const [exportMsg, setExportMsg] = useState('');
      const [cards, setCards] = useState(() => {
        try { return JSON.parse(localStorage.getItem(setKey(setId, 'flashcards')) || '[]'); } catch { return []; }
      });
      const [current, setCurrent] = useState(0);
      const [flipped, setFlipped] = useState(false);
      const [visited, setVisited] = useState(new Set());
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      // Revisão espaçada persistida: fila de cartões a revisar + agendamento salvo.
      const [reviewMode, setReviewMode] = useState(false);
      const [queue, setQueue] = useState([]);
      const [reviewStats, setReviewStats] = useState({ good: 0, again: 0 });
      const [chapterFilter, setChapterFilter] = useState(null);
      const [srs, setSrs] = useState(() => loadSRS(setId));

      const chapters = React.useMemo(() => {
        const list = [];
        cards.forEach(c => { if (c.chapter && !list.includes(c.chapter)) list.push(c.chapter); });
        return list;
      }, [cards]);

      const visibleCards = React.useMemo(() =>
        chapterFilter ? cards.filter(c => c.chapter === chapterFilter) : cards,
        [cards, chapterFilter]);

      // Índices dos cartões "vencidos" (novos ou cuja hora de revisar já chegou).
      const dueIndexes = React.useMemo(() =>
        visibleCards.map((c, i) => (isDue(srs[srsKey(c)]) ? i : -1)).filter(i => i >= 0),
        [visibleCards, srs]);

      // Ao trocar de capítulo, reinicia a navegação e sai da revisão.
      useEffect(() => {
        setCurrent(0);
        setFlipped(false);
        setReviewMode(false);
        setQueue([]);
      }, [chapterFilter]);

      const startReview = () => {
        // Prioriza os vencidos; se nenhum estiver vencido, revê todos (estudo livre).
        const seed = dueIndexes.length ? dueIndexes : visibleCards.map((_, i) => i);
        setQueue(seed);
        setReviewStats({ good: 0, again: 0 });
        setReviewMode(true);
        setFlipped(false);
      };

      const exitReview = () => {
        setReviewMode(false);
        setQueue([]);
        setFlipped(false);
      };

      // Acertei: remove o cartão da fila. Errei: manda para o fim (revisa depois).
      // Nos dois casos, grava o novo agendamento no PC (persiste entre sessões).
      const rateCard = (good) => {
        const idx = queue[0];
        const c = visibleCards[idx];
        if (c) {
          const key = srsKey(c);
          setSrs(prev => {
            const updated = { ...prev, [key]: nextSchedule(prev[key], good) };
            saveSRS(setId, updated);
            return updated;
          });
        }
        setReviewStats(s => good ? { ...s, good: s.good + 1 } : { ...s, again: s.again + 1 });
        setQueue(q => {
          const [head, ...rest] = q;
          return good ? rest : [...rest, head];
        });
        setFlipped(false);
      };

      const generate = async () => {
        if (!content.trim()) {
          setError('Adicione conteúdo de estudo na seção "Conteúdo" primeiro.');
          return;
        }
        setLoading(true);
        setError('');
        try {
          const result = await runAI(offline, 'generateFlashcards', content);
          if (result.success) {
            // SOMA ao baralho existente, ignorando cartões repetidos (mesma frente+verso).
            const oldLen = cards.length;
            const seen = new Set(cards.map(srsKey));
            const novos = result.data.filter(c => {
              const k = srsKey(c);
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
            const merged = cards.concat(novos);
            setCards(merged);
            setChapterFilter(null);
            setFlipped(false);
            setVisited(new Set());
            setReviewMode(false);
            setQueue([]);
            // Vai direto para o 1º cartão novo (se houver).
            setCurrent(novos.length ? oldLen : 0);
            safeSetItem(setKey(setId, 'flashcards'), JSON.stringify(merged));
            recordEvent('flashcardsGenerated');
            if (novos.length === 0) {
              setError('Nenhum cartão novo — todos já estavam no baralho deste caderno.');
            }
          } else {
            setError('Erro ao gerar flashcards: ' + result.error);
          }
        } catch (e) {
          setError('Erro de conexão. Verifique sua internet e tente novamente.');
        }
        setLoading(false);
      };

      // Apaga o baralho inteiro do caderno (com confirmação).
      const clearAll = () => {
        if (!cards.length) return;
        if (!confirm('Apagar TODOS os flashcards deste caderno? Isso não pode ser desfeito.')) return;
        setCards([]);
        safeSetItem(setKey(setId, 'flashcards'), JSON.stringify([]));
        setCurrent(0); setFlipped(false); setReviewMode(false); setQueue([]); setChapterFilter(null);
      };

      // Remove um único cartão (o que está sendo visto no modo navegação).
      const removeCard = (card) => {
        if (!card) return;
        const k = srsKey(card);
        const merged = cards.filter(c => srsKey(c) !== k);
        setCards(merged);
        safeSetItem(setKey(setId, 'flashcards'), JSON.stringify(merged));
        setCurrent(c => Math.max(0, Math.min(c, merged.length - 1)));
        setFlipped(false);
      };

      const goTo = (idx) => {
        setVisited(v => new Set([...v, current]));
        setCurrent(idx);
        setFlipped(false);
      };

      const prev = () => { if (current > 0) goTo(current - 1); };
      const next = () => { if (current < visibleCards.length - 1) goTo(current + 1); };

      // Atalhos de teclado: ←/→ navegar, Espaço/Enter virar, 1=Errei 2=Acertei.
      useEffect(() => {
        if (loading || visibleCards.length === 0) return;
        const onKey = (e) => {
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
          if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            setFlipped(f => !f);
          } else if (reviewMode && queue.length > 0) {
            if (e.key === '1') rateCard(false);
            else if (e.key === '2') rateCard(true);
          } else if (!reviewMode) {
            if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'ArrowRight') next();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [loading, visibleCards.length, reviewMode, queue, current]);

      const doExport = async (format) => {
        if (!cards.length) return;
        let name, data, mime;
        if (format === 'anki') {
          name = 'flashcards-dybass-anki.txt';
          data = flashcardsToAnki(cards);
          mime = 'text/plain';
        } else if (format === 'csv') {
          name = 'flashcards-dybass.csv';
          data = flashcardsToCSV(cards);
          mime = 'text/csv';
        } else {
          name = 'flashcards-dybass.json';
          data = JSON.stringify(cards, null, 2);
          mime = 'application/json';
        }
        const res = await exportData(name, data, mime);
        if (res.success) {
          setExportMsg('Exportado!');
          setTimeout(() => setExportMsg(''), 2500);
        } else if (!res.canceled) {
          setExportMsg('Falha ao exportar');
          setTimeout(() => setExportMsg(''), 2500);
        }
      };

      const reviewIdx = reviewMode && queue.length > 0 ? queue[0] : null;
      const card = reviewMode ? visibleCards[reviewIdx] : visibleCards[current];

      return (
        <div>
          <div className="page-header">
            <h2>Flashcards</h2>
            <p>Estude com cartões — clique para virar · ← → navega · Espaço vira</p>
          </div>
          <div className="page-content">
            <div className="export-bar" style={{marginBottom:24}}>
              <button className="btn btn-primary" onClick={generate} disabled={loading} title={cards.length ? 'Cria novos cartões e SOMA ao baralho (sem apagar os antigos)' : ''}>
                {loading ? <span className="loading-spinner" /> : icons.sparkle}
                {cards.length ? `Gerar mais (${cards.length} no baralho)` : 'Gerar Flashcards'}
              </button>
              {cards.length > 0 && !loading && !reviewMode && (
                <button className="btn btn-outline" onClick={startReview} title="Repetição espaçada: prioriza os cartões que você ainda não fixou">
                  {icons.brain} Modo Revisão{dueIndexes.length ? ` (${dueIndexes.length} para hoje)` : ''}
                </button>
              )}
              {cards.length > 0 && !loading && reviewMode && (
                <button className="btn btn-secondary" onClick={exitReview}>
                  {icons.left} Sair da Revisão
                </button>
              )}
              {cards.length > 0 && !loading && !reviewMode && (
                <React.Fragment>
                  <div style={{width:1, height:24, background:'#222', margin:'0 4px'}} />
                  <span style={{fontSize:12, color:'#555'}}>Exportar:</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => doExport('anki')} title="Arquivo de texto para importar no Anki">
                    {icons.save} Anki
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => doExport('csv')} title="Planilha CSV">
                    {icons.save} CSV
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => doExport('json')} title="Arquivo JSON">
                    {icons.save} JSON
                  </button>
                  {exportMsg && <span className="export-toast">{icons.check} {exportMsg}</span>}
                  <button className="btn btn-danger btn-sm" onClick={clearAll} title="Apagar todos os flashcards deste caderno" style={{marginLeft:'auto'}}>
                    {icons.trash} Limpar todos
                  </button>
                </React.Fragment>
              )}
            </div>

            {!loading && cards.length > 0 && !reviewMode && (
              <ChapterChips chapters={chapters} value={chapterFilter} onChange={setChapterFilter} />
            )}

            {error && (
              <div className="error-banner">
                {icons.cross} {error}
              </div>
            )}

            {loading && (
              <div className="empty-state">
                <span className="loading-spinner" style={{width:36, height:36, borderWidth:3, marginBottom:16}} />
                <div className="empty-title">Gerando flashcards...</div>
                <div className="empty-desc">Criando cartões organizados por capítulo</div>
              </div>
            )}

            {!loading && cards.length > 0 && reviewMode && queue.length === 0 && (
              <div className="quiz-results">
                <div className="results-emoji">{icons.trophy}</div>
                <div className="results-title">Revisão concluída!</div>
                <div className="results-detail" style={{marginTop:12}}>
                  Você revisou todos os {visibleCards.length} cartões.
                  {reviewStats.again > 0 && ` Repetiu ${reviewStats.again}x os difíceis.`}
                </div>
                <div style={{display:'flex', gap:12, justifyContent:'center', marginTop:24}}>
                  <button className="btn btn-primary" onClick={startReview}>
                    {icons.refresh} Revisar de Novo
                  </button>
                  <button className="btn btn-secondary" onClick={exitReview}>
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {!loading && cards.length > 0 && !(reviewMode && queue.length === 0) && (
              <div className="flashcard-container">
                <div className="flashcard-progress">
                  {reviewMode
                    ? `Revisão · faltam ${queue.length} · ✓ ${reviewStats.good} · ↺ ${reviewStats.again}`
                    : `${current + 1} / ${visibleCards.length}`}
                  {!reviewMode && card && (
                    <button
                      className="card-del-btn"
                      onClick={() => removeCard(card)}
                      title="Excluir este cartão"
                    >
                      {icons.trash}
                    </button>
                  )}
                </div>

                {card && card.chapter && (
                  <div className="chapter-tag">{card.chapter}</div>
                )}

                <div
                  className="flashcard-scene"
                  onClick={() => setFlipped(f => !f)}
                >
                  <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
                    <div className="flashcard-face flashcard-front">
                      <div className="flashcard-label">Pergunta</div>
                      <div className="flashcard-text">{card.front}</div>
                      <div className="flashcard-hint">Clique para ver a resposta</div>
                    </div>
                    <div className="flashcard-face flashcard-back">
                      <div className="flashcard-label">Resposta</div>
                      <div className="flashcard-text">{card.back}</div>
                    </div>
                  </div>
                </div>

                {reviewMode ? (
                  <div className="flashcard-nav" style={{justifyContent:'center', gap:12}}>
                    <button className="btn btn-outline" onClick={() => rateCard(false)} title="Tecla 1">
                      {icons.refresh} Errei (revisar)
                    </button>
                    <button className="btn btn-success" onClick={() => rateCard(true)} title="Tecla 2">
                      {icons.check} Acertei
                    </button>
                  </div>
                ) : (
                  <div className="flashcard-nav">
                    <button className="btn btn-secondary" onClick={prev} disabled={current === 0}>
                      {icons.left} Anterior
                    </button>
                    <div className="flashcard-dots">
                      {visibleCards.map((_, i) => (
                        <div
                          key={i}
                          className={`dot ${i === current ? 'active' : visited.has(i) ? 'visited' : ''}`}
                          onClick={() => goTo(i)}
                          style={{cursor:'pointer'}}
                          title={`Card ${i+1}`}
                        />
                      ))}
                    </div>
                    <button className="btn btn-secondary" onClick={next} disabled={current === visibleCards.length - 1}>
                      Próximo {icons.right}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!loading && cards.length === 0 && !error && (
              <div className="empty-state">
                <div className="empty-icon">{icons.flashcards}</div>
                <div className="empty-title">Nenhum flashcard gerado</div>
                <div className="empty-desc">
                  Clique em "Gerar Flashcards" para criar 10 cartões de pergunta e resposta a partir do seu conteúdo.
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ─── Quiz Section ─────────────────────────────────────────────────────────
    function QuizSection({ content, offline, setId }) {
      const [questions, setQuestions] = useState(() => {
        try { return JSON.parse(localStorage.getItem(setKey(setId, 'quiz')) || '[]'); } catch { return []; }
      });
      const [current, setCurrent] = useState(0);
      const [selected, setSelected] = useState(null);
      const [answered, setAnswered] = useState(false);
      const [score, setScore] = useState(0);
      const [finished, setFinished] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [chapterFilter, setChapterFilter] = useState(null);

      const chapters = React.useMemo(() => {
        const list = [];
        questions.forEach(q => { if (q.chapter && !list.includes(q.chapter)) list.push(q.chapter); });
        return list;
      }, [questions]);

      const visibleQuestions = React.useMemo(() =>
        chapterFilter ? questions.filter(q => q.chapter === chapterFilter) : questions,
        [questions, chapterFilter]);

      const generate = async () => {
        if (!content.trim()) {
          setError('Adicione conteúdo de estudo na seção "Conteúdo" primeiro.');
          return;
        }
        setLoading(true);
        setError('');
        try {
          const result = await runAI(offline, 'generateQuiz', content);
          if (result.success) {
            setQuestions(result.data);
            setChapterFilter(null);
            safeSetItem(setKey(setId, 'quiz'), JSON.stringify(result.data));
            resetQuiz();
          } else {
            setError('Erro ao gerar quiz: ' + result.error);
          }
        } catch (e) {
          setError('Erro de conexão. Verifique sua internet e tente novamente.');
        }
        setLoading(false);
      };

      const resetQuiz = () => {
        setCurrent(0);
        setSelected(null);
        setAnswered(false);
        setScore(0);
        setFinished(false);
      };

      // Reinicia o quiz ao trocar de capítulo.
      useEffect(() => { resetQuiz(); }, [chapterFilter]);

      const handleSelect = (idx) => {
        if (answered) return;
        setSelected(idx);
        setAnswered(true);
        if (idx === visibleQuestions[current].correct) {
          setScore(s => s + 1);
        }
      };

      const handleNext = () => {
        if (current < visibleQuestions.length - 1) {
          setCurrent(c => c + 1);
          setSelected(null);
          setAnswered(false);
        } else {
          recordQuiz(score, visibleQuestions.length);
          setFinished(true);
        }
      };

      const q = visibleQuestions[current];
      const optLetters = ['A', 'B', 'C', 'D'];

      // Atalhos: 1-4 (ou A-D) escolhem a opção, Enter avança.
      useEffect(() => {
        if (loading || finished || visibleQuestions.length === 0) return;
        const onKey = (e) => {
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
          const cur = visibleQuestions[current];
          if (!cur) return;
          if (!answered) {
            const map = { '1':0, '2':1, '3':2, '4':3, 'a':0, 'b':1, 'c':2, 'd':3 };
            const idx = map[e.key.toLowerCase()];
            if (idx !== undefined && idx < cur.options.length) handleSelect(idx);
          } else if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            handleNext();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [loading, finished, answered, current, visibleQuestions]);

      const getPercentage = () => Math.round((score / visibleQuestions.length) * 100);
      const getResultEmoji = () => {
        const p = getPercentage();
        if (p >= 90) return icons.trophy;
        if (p >= 70) return icons.star;
        if (p >= 50) return icons.ok;
        return icons.sad;
      };

      return (
        <div>
          <div className="page-header">
            <h2>Quiz</h2>
            <p>Teste seus conhecimentos com questões de múltipla escolha</p>
          </div>
          <div className="page-content">
            {error && (
              <div className="error-banner">
                {icons.cross} {error}
              </div>
            )}

            {!loading && !finished && questions.length > 0 && (
              <div className="quiz-header">
                <div className="quiz-score">
                  Acertos: <strong>{score}</strong>/{visibleQuestions.length}
                </div>
                <button className="btn btn-secondary" onClick={generate} disabled={loading}>
                  {icons.refresh} Novo Quiz
                </button>
              </div>
            )}

            {!loading && !finished && questions.length > 0 && (
              <ChapterChips chapters={chapters} value={chapterFilter} onChange={setChapterFilter} />
            )}

            {loading && (
              <div className="empty-state">
                <span className="loading-spinner" style={{width:36, height:36, borderWidth:3, marginBottom:16}} />
                <div className="empty-title">Gerando quiz...</div>
                <div className="empty-desc">Criando questões organizadas por capítulo</div>
              </div>
            )}

            {!loading && questions.length === 0 && !error && (
              <div className="empty-state">
                <div className="empty-icon">{icons.quiz}</div>
                <div className="empty-title">Nenhum quiz gerado</div>
                <div className="empty-desc">
                  Clique em "Gerar Quiz" para criar 8 questões de múltipla escolha sobre o seu conteúdo.
                </div>
                <button className="btn btn-primary" style={{marginTop:20}} onClick={generate}>
                  {icons.sparkle} Gerar Quiz
                </button>
              </div>
            )}

            {!loading && questions.length > 0 && !finished && q && (
              <div>
                <div className="quiz-progress-bar">
                  <div
                    className="quiz-progress-fill"
                    style={{width: `${((current) / visibleQuestions.length) * 100}%`}}
                  />
                </div>

                <div className="quiz-question-card">
                  {q.chapter && <div className="chapter-tag">{q.chapter}</div>}
                  <div className="quiz-question-num">Questão {current + 1} de {visibleQuestions.length}</div>
                  <div className="quiz-question-text">{q.question}</div>
                </div>

                <div className="quiz-options">
                  {q.options.map((opt, i) => {
                    let cls = 'quiz-option';
                    if (answered) {
                      cls += ' answered';
                      if (i === q.correct) cls += ' correct';
                      else if (i === selected && i !== q.correct) cls += ' wrong';
                    } else if (i === selected) {
                      cls += ' selected';
                    }
                    return (
                      <button
                        key={i}
                        className={cls}
                        onClick={() => handleSelect(i)}
                        disabled={answered}
                      >
                        <span className="option-letter">{optLetters[i]}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div className={`quiz-feedback ${selected === q.correct ? 'correct' : 'wrong'}`}>
                    {selected === q.correct
                      ? `${icons.check} Correto! Muito bem!`
                      : `${icons.cross} Incorreto. A resposta correta era: ${optLetters[q.correct]}`
                    }
                  </div>
                )}

                <div className="quiz-nav">
                  <span style={{fontSize:13, color:'#444'}}>
                    {answered ? (selected === q.correct ? '✓ Acertou' : '✕ Errou') : 'Selecione uma opção'}
                  </span>
                  <button
                    className="btn btn-primary"
                    onClick={handleNext}
                    disabled={!answered}
                  >
                    {current < visibleQuestions.length - 1 ? 'Próxima' : 'Ver Resultado'} {icons.right}
                  </button>
                </div>
              </div>
            )}

            {!loading && finished && (
              <div className="quiz-results">
                <div className="results-emoji">{getResultEmoji()}</div>
                <div className="results-title">
                  {getPercentage() >= 70 ? 'Parabéns!' : 'Continue estudando!'}
                </div>
                <div className="results-score">{getPercentage()}%</div>
                <div className="results-detail">
                  Você acertou {score} de {visibleQuestions.length} questões
                </div>
                <div style={{display:'flex', gap:12, justifyContent:'center'}}>
                  <button className="btn btn-secondary" onClick={resetQuiz}>
                    {icons.refresh} Refazer Quiz
                  </button>
                  <button className="btn btn-primary" onClick={generate}>
                    {icons.sparkle} Novo Quiz
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ─── Statistics Section ───────────────────────────────────────────────────
    function StatsSection() {
      const [stats, setStats] = useState(() => getStats());

      const quizzes = stats.quizzes || [];
      const totalQuizzes = quizzes.length;
      const avgPct = totalQuizzes
        ? Math.round(quizzes.reduce((s, q) => s + q.pct, 0) / totalQuizzes)
        : 0;
      const bestPct = totalQuizzes ? Math.max(...quizzes.map(q => q.pct)) : 0;
      const recent = quizzes.slice(-12);

      const reset = () => {
        if (confirm('Apagar todo o histórico de estatísticas?')) {
          saveStats(defaultStats());
          setStats(getStats());
        }
      };

      const fmtDate = (ts) => {
        const d = new Date(ts);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      };

      return (
        <div>
          <div className="page-header">
            <h2>Estatísticas</h2>
            <p>Acompanhe seu progresso de estudo</p>
          </div>
          <div className="page-content">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{totalQuizzes}</div>
                <div className="stat-label">Quizzes feitos</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{avgPct}%</div>
                <div className="stat-label">Acerto médio</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{bestPct}%</div>
                <div className="stat-label">Melhor resultado</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.flashcardsGenerated || 0}</div>
                <div className="stat-label">Flashcards gerados</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.summariesGenerated || 0}</div>
                <div className="stat-label">Resumos gerados</div>
              </div>
            </div>

            <div className="stats-section-title">Evolução nos últimos quizzes</div>
            {recent.length > 0 ? (
              <div className="history-chart">
                {recent.map((q, i) => (
                  <div className="history-bar-wrap" key={i} title={`${q.score}/${q.total}`}>
                    <span className="history-bar-val">{q.pct}%</span>
                    <div className="history-bar" style={{height: `${Math.max(q.pct, 3)}%`}} />
                    <span className="history-bar-date">{fmtDate(q.date)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">{icons.stats}</div>
                <div className="empty-title">Ainda sem dados</div>
                <div className="empty-desc">
                  Faça um quiz na seção "Quiz" para começar a registrar seu progresso.
                </div>
              </div>
            )}

            {totalQuizzes > 0 && (
              <button className="btn btn-danger btn-sm" onClick={reset}>
                {icons.trash} Limpar estatísticas
              </button>
            )}
          </div>
        </div>
      );
    }

    // ─── Onboarding / Tela de boas-vindas ────────────────────────────────────
    function Onboarding({ onClose }) {
      const steps = [
        {
          emoji: '🎓',
          title: 'Bem-vindo ao Dybass Estudioso!',
          text: 'Seu assistente de estudos. A partir de qualquer conteúdo, ele cria resumos, flashcards e quizzes para você aprender mais rápido. Vamos dar uma volta rápida?',
        },
        {
          emoji: '📚',
          title: '1. Organize em cadernos',
          text: 'Cada caderno guarda um material separado (conteúdo, resumo, flashcards e quiz). Crie quantos quiser na barra lateral — um para cada matéria — e troque entre eles sem perder nada.',
        },
        {
          emoji: '📝',
          title: '2. Insira seu conteúdo',
          text: 'Na seção Conteúdo, cole seu material ou importe um arquivo PDF/TXT. Use a busca para encontrar trechos. Tudo é salvo automaticamente no caderno ativo.',
        },
        {
          emoji: '✨',
          title: '2. Gere material de estudo',
          text: 'Crie Resumos (completo ou simples), Flashcards e Quizzes com um clique. O quiz pode ser renovado quantas vezes quiser para manter a variedade.',
        },
        {
          emoji: '🔌',
          title: '3. Online ou Offline',
          text: 'No Modo Online usamos a IA Claude pela nuvem — não precisa configurar nada. No Modo Offline tudo é gerado localmente, sem internet. Alterne na barra lateral.',
        },
        {
          emoji: '🔁',
          title: '4. Revise e acompanhe',
          text: 'Use o Modo Revisão dos flashcards para repetir os difíceis, e veja seu progresso na seção Estatísticas. Atalhos de teclado deixam tudo mais rápido!',
        },
      ];
      const [step, setStep] = useState(0);
      const last = step === steps.length - 1;

      const finish = () => {
        localStorage.setItem('dybass_onboarded', 'true');
        onClose();
      };

      const s = steps[step];
      return (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <div className="onboarding-emoji">{s.emoji}</div>
            <div className="onboarding-title">{s.title}</div>
            <div className="onboarding-text">{s.text}</div>
            <div className="onboarding-dots">
              {steps.map((_, i) => (
                <div key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
              ))}
            </div>
            <div className="onboarding-nav">
              <button className="onboarding-skip" onClick={finish}>Pular</button>
              <div style={{display:'flex', gap:10}}>
                {step > 0 && (
                  <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                    {icons.left} Voltar
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => last ? finish() : setStep(step + 1)}>
                  {last ? `${icons.sparkle} Começar` : `Próximo ${icons.right}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ─── Modal de digitação de nome ──────────────────────────────────────────
    // O Electron não suporta window.prompt(), então usamos este modal para
    // criar/renomear cadernos.
    function NamePrompt({ title, initial, confirmLabel, onSubmit, onCancel }) {
      const [value, setValue] = useState(initial || '');
      const inputRef = React.useRef(null);
      useEffect(() => {
        if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
      }, []);
      const submit = () => {
        const v = value.trim();
        if (v) onSubmit(v);
      };
      return (
        <div className="onboarding-overlay" onClick={onCancel}>
          <div className="name-prompt" onClick={e => e.stopPropagation()}>
            <div className="name-prompt-title">{title}</div>
            <input
              ref={inputRef}
              className="apikey-input"
              type="text"
              value={value}
              maxLength={60}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                else if (e.key === 'Escape') onCancel();
              }}
            />
            <div className="name-prompt-nav">
              <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
              <button className="btn btn-primary" onClick={submit} disabled={!value.trim()}>
                {confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ─── App Root ─────────────────────────────────────────────────────────────
    function App() {
      const [section, setSection] = useState('content');
      // Cadernos: cada um com seu próprio conteúdo/material. ensureSets migra o
      // material antigo (versões anteriores) para o primeiro caderno.
      const [sets, setSets] = useState(ensureSets);
      const [activeId, setActiveId] = useState(() => loadActiveId(loadSetsRaw() || sets));
      const [content, setContent] = useState(() => loadContentFor(activeId));
      const [offline, setOffline] = useState(() => localStorage.getItem('dybass_offline') === 'true');
      const [theme, setTheme] = useState(() => localStorage.getItem('dybass_theme') || 'dark');
      const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('dybass_onboarded') !== 'true');
      const [namePrompt, setNamePrompt] = useState(null);

      // Aplica o tema ao <body>.
      useEffect(() => {
        document.body.classList.toggle('light', theme === 'light');
        localStorage.setItem('dybass_theme', theme);
      }, [theme]);

      const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

      const toggleOffline = () => {
        setOffline(prev => {
          const next = !prev;
          localStorage.setItem('dybass_offline', String(next));
          return next;
        });
      };

      // Auto-salva o conteúdo no caderno ativo a cada mudança (nada se perde ao
      // trocar de caderno ou fechar o app).
      const handleContentChange = (val) => {
        setContent(val);
        safeSetItem(setKey(activeId, 'content'), val);
      };

      const activeSet = sets.find(s => s.id === activeId) || sets[0];

      const switchSet = (id) => {
        if (id === activeId) return;
        safeSetItem(setKey(activeId, 'content'), content); // garante o atual salvo
        setActiveId(id);
        saveActiveId(id);
        setContent(loadContentFor(id));
        setSection('content');
      };

      const doCreateSet = (name) => {
        safeSetItem(setKey(activeId, 'content'), content); // salva o atual antes
        const id = newSetId();
        const next = [...sets, { id, name, createdAt: Date.now() }];
        setSets(next); saveSets(next);
        setActiveId(id); saveActiveId(id);
        setContent('');
        setSection('content');
        setNamePrompt(null);
      };

      const doRenameSet = (name) => {
        const next = sets.map(s => (s.id === activeId ? { ...s, name } : s));
        setSets(next); saveSets(next);
        setNamePrompt(null);
      };

      const createSet = () => setNamePrompt({
        title: 'Novo caderno',
        initial: 'Caderno ' + (sets.length + 1),
        confirmLabel: 'Criar',
        onSubmit: doCreateSet,
      });

      const renameSet = () => setNamePrompt({
        title: 'Renomear caderno',
        initial: activeSet.name,
        confirmLabel: 'Salvar',
        onSubmit: doRenameSet,
      });

      const deleteSet = () => {
        if (sets.length <= 1) {
          alert('Você precisa de pelo menos um caderno. Crie outro antes de excluir este.');
          return;
        }
        if (!confirm(`Excluir o caderno "${activeSet.name}" e TODO o material dele (conteúdo, resumo, flashcards, quiz)? Isso não pode ser desfeito.`)) return;
        purgeSet(activeId);
        const next = sets.filter(s => s.id !== activeId);
        setSets(next); saveSets(next);
        const newActive = next[0].id;
        setActiveId(newActive); saveActiveId(newActive);
        setContent(loadContentFor(newActive));
        setSection('content');
      };

      const navItems = [
        { id: 'content',    label: 'Conteúdo',   icon: icons.content },
        { id: 'summary',    label: 'Resumo',      icon: icons.summary },
        { id: 'flashcards', label: 'Flashcards',  icon: icons.flashcards },
        { id: 'quiz',       label: 'Quiz',        icon: icons.quiz },
        { id: 'stats',      label: 'Estatísticas', icon: icons.stats },
      ];

      return (
        <div id="root" style={{display:'flex', height:'100vh', width:'100%'}}>
          {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
          {namePrompt && (
            <NamePrompt
              title={namePrompt.title}
              initial={namePrompt.initial}
              confirmLabel={namePrompt.confirmLabel}
              onSubmit={namePrompt.onSubmit}
              onCancel={() => setNamePrompt(null)}
            />
          )}
          {/* Sidebar */}
          <div className="sidebar">
            <div className="sidebar-logo">
              <h1>Dybass</h1>
              <span>Estudioso</span>
            </div>

            {/* Seletor de cadernos: troca entre materiais salvos separadamente. */}
            <div className="set-picker">
              <div className="set-picker-label">{icons.book} Caderno</div>
              <select
                className="set-select"
                value={activeId}
                onChange={e => switchSet(e.target.value)}
                title="Trocar de caderno"
              >
                {sets.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="set-actions">
                <button className="set-btn" onClick={createSet} title="Novo caderno">
                  {icons.plus} Novo
                </button>
                <button className="set-btn" onClick={renameSet} title="Renomear este caderno">
                  {icons.edit}
                </button>
                <button className="set-btn set-btn-danger" onClick={deleteSet} title="Excluir este caderno" disabled={sets.length <= 1}>
                  {icons.trash}
                </button>
              </div>
            </div>

            <nav className="sidebar-nav">
              {navItems.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="mode-toggle">
              <div className="mode-toggle-row">
                <span className="mode-label">
                  {theme === 'dark' ? '🌙 Tema Escuro' : '☀️ Tema Claro'}
                </span>
                <label className="switch">
                  <input type="checkbox" checked={theme === 'light'} onChange={toggleTheme} />
                  <span className="slider" />
                </label>
              </div>
              <div className="mode-toggle-row">
                <span className="mode-label">
                  {offline ? '🔌 Modo Offline' : '☁️ Modo Online'}
                </span>
                <label className="switch">
                  <input type="checkbox" checked={offline} onChange={toggleOffline} />
                  <span className="slider" />
                </label>
              </div>
              <div className="mode-hint">
                {offline
                  ? 'Gera tudo localmente, sem internet.'
                  : 'Usa a IA Claude pela nuvem (precisa de internet). Nada de configurar chave.'}
              </div>
            </div>
            <div className="sidebar-footer">
              <div>{offline ? 'Processamento local' : 'Powered by Claude AI'}</div>
              <button className="help-btn" style={{marginTop:6}} onClick={() => setShowOnboarding(true)}>
                Ver tutorial
              </button>
            </div>
          </div>

          {/* Main — key={activeId} remonta a seção ao trocar de caderno,
              recarregando o material correto de cada um. */}
          <div className="main">
            {section === 'content' && (
              <ContentSection key={activeId} content={content} onContentChange={handleContentChange} />
            )}
            {section === 'summary' && (
              <SummarySection key={activeId} content={content} offline={offline} setId={activeId} />
            )}
            {section === 'flashcards' && (
              <FlashcardsSection key={activeId} content={content} offline={offline} setId={activeId} />
            )}
            {section === 'quiz' && (
              <QuizSection key={activeId} content={content} offline={offline} setId={activeId} />
            )}
            {section === 'stats' && (
              <StatsSection />
            )}
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
