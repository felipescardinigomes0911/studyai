# Dybass Estudioso — Notas de Sessão (Handoff)

> Documento para continuar o trabalho em outra sessão do Claude Code.
> Basta abrir este repositório no branch `claude/dybass-estudioso-app-cpyyp6`
> e ler este arquivo.

## O que é o projeto

App de estudos **desktop (Electron)** chamado **Dybass Estudioso**. A partir de
um conteúdo colado/importado, gera **resumos**, **flashcards** e **quiz**.
Visual **preto e vermelho escuro** (`#0a0a0a` / `#8b0000`). Nome/autor: "Dybass".

- **Repositório:** `felipescardinigomes0911/studyai`
- **Branch de trabalho:** `claude/dybass-estudioso-app-cpyyp6`
- **Release publicada:** v1.0.0 (instalador antigo — ANTES das melhorias abaixo)
  - https://github.com/felipescardinigomes0911/studyai/releases/tag/v1.0.0

## Arquitetura (arquivos principais)

- `main.js` — processo principal Electron. IPC: `generate-summary`,
  `generate-flashcards`, `generate-quiz` (chamam a API Anthropic com o modelo
  `claude-haiku-4-5-20251001`), `export-file`, `has-api-key`, `set-api-key`.
  A chave de API vem de `ANTHROPIC_API_KEY` **ou** de um arquivo salvo em
  `userData/api-key.json` (função `getApiKey()`).
- `preload.js` — expõe `electronAPI` via contextBridge (inclui `setApiKey`).
- `offline.js` — **motor offline** (sem internet/sem IA generativa). Faz
  processamento de texto: detecção de capítulos, pontuação de sentenças,
  extração e cloze deletion. Expõe `window.offlineAI` com `detectChapters`,
  `generateSummary`, `generateFlashcards`, `generateQuiz`.
- `app.jsx` — **código-fonte da UI (React/JSX)**. É onde se edita a interface.
- `app.js` — **gerado** por `npm run build:jsx` a partir de `app.jsx` (NÃO editar
  à mão). O JSX é transpilado no BUILD, não no navegador — o Babel não é mais
  carregado em runtime (inicialização mais rápida). `prestart`/`prebuild*` já
  rodam o `build:jsx` automaticamente.
- `scripts/build-jsx.js` — compila `app.jsx` → `app.js` com o Babel vendorizado.
- `index.html` — só a casca: `<head>`, estilos e `<script src="app.js">`.
  React/PDF.js **locais** em `vendor/`, NÃO CDN (CDN causava tela preta com
  antivírus). Seções: Conteúdo, Resumo, Flashcards, Quiz, Estatísticas.
- `package.json` — electron-builder (NSIS + portable Windows, AppImage Linux).
  Tem `"author": "Dybass"` e `"publish": null` (necessários para build offline).
- `.github/workflows/build.yml` — CI/CD: compila .exe e AppImage a cada push;
  cria Release via `workflow_dispatch` com input `release_tag` OU push de tag `v*`.
- `assets/generate_icon.py` — gera `assets/icon.png` 256x256 só com stdlib.

## Modos de IA

- **Online ☁️** — usa a IA Claude (requer chave da Anthropic + internet). A
  chave pode ser colada na barra lateral do app (salva no PC).
- **Offline 🔌** — 100% local, sem internet/chave. NÃO é IA generativa; é
  processamento de texto (extrativo). Ativado por padrão se não houver chave.

Decisão do usuário (2026-07): **manter só o Modo Online com a própria chave**
(não embutir chave nem LLM local). Opções discutidas e descartadas:
LLM local embutido (instalador de GBs) e chave de API embutida (risco de custo).

## Estado atual — JÁ FEITO nesta sessão (commitado e enviado)

1. **Resumos melhorados** (`offline.js`): pontuação de sentenças com peso por
   posição (aberturas), nomes próprios e números; penaliza frases muito longas;
   conceitos-chave por seção; saída limpa (sem rótulo "modo offline").
2. **Divisão por capítulos/tópicos**: `detectChapters()` reconhece títulos
   markdown, "Capítulo/Unidade/Seção X", numeração `1.`/`1.2`, e linhas curtas
   em MAIÚSCULAS. Se não achar títulos, divide em "Parte 1..N".
   - Resumo sai estruturado por capítulo (`# Título`, `## Capítulo`, `•`, `★`).
   - Flashcards e quiz distribuídos e rotulados com `chapter`.
3. **UI** (`index.html`): `renderSummary()` desenha o resumo com títulos e
   destaques; `ChapterChips` = filtro por capítulo em Flashcards e Quiz;
   `chapter-tag` mostra o capítulo em cada card/questão.
4. **Chave de API pelo app**: handler `set-api-key`, `getApiKey()`, componente
   `ApiKeyConfig` na barra lateral (aparece só no Modo Online).
5. **Prompts do Modo Online** atualizados para pedir saída por capítulos e
   campo `chapter` nos flashcards/quiz.

Commits relevantes no branch:
- `feat: resumos melhores e organizacao por capitulos`
- `feat: configurar chave de API pelo app e prompts online por capitulo`

## PENDENTE / próximos passos

- [ ] **Publicar novo instalador (v1.1.0)** com as melhorias acima. Processo:
  disparar o workflow `build.yml` via `workflow_dispatch` com
  `{"release_tag": "v1.1.0"}` (push direto de tag `v*` é bloqueado pelo proxy
  com HTTP 403 nesta infra — por isso usa-se o input). Monitorar até publicar
  os 3 assets (.exe Setup, .exe portable, .AppImage).
- [ ] O usuário precisa **desinstalar a versão antiga manualmente** (a sessão
  remota não acessa o Windows dele).

## Armadilhas conhecidas

- **Não usar CDN** no `index.html` — antivírus bloqueia e a tela fica preta.
  Tudo em `vendor/` local.
- **Ícone deve ser 256x256** (electron-builder exige no Windows).
- **Push de tag `v*` dá HTTP 403** nesta infra — use `workflow_dispatch` com
  input `release_tag` para criar Release.
- Editou a UI? Edite `app.jsx` e rode `npm run build:jsx` (regenera `app.js`).
  NÃO edite `app.js` à mão — é gerado. O `build-jsx.js` já valida a sintaxe.
- Validar `offline.js`/`main.js` com `node -c`.
- `vendor/babel.min.js` agora é só de BUILD (não vai no app empacotado —
  ver `!vendor/babel.min.js` em `build.files`).
