# Dybass Estudioso — Resumo do Projeto

> Documento de continuidade. Serve para o dono do projeto lembrar como tudo
> funciona e para qualquer futura sessão de IA (ou pessoa) continuar o trabalho
> de onde parou. Tudo que importa está no GitHub — nada depende de nenhuma
> conversa de chat.

- **Repositório:** `felipescardinigomes0911/studyai` (privado)
- **Branch de trabalho:** `claude/dybass-estudioso-app-cpyyp6`
- **Versão atual do app:** 1.7.0 · **Backend:** 1.1.3
- **Releases:** https://github.com/felipescardinigomes0911/studyai/releases

Para continuar num chat novo, basta dizer: *"continue o app Dybass no
repositório studyai, branch claude/dybass-estudioso-app-cpyyp6"*.

---

## O que é o app

App de estudos com IA. A partir de um conteúdo (texto colado ou PDF/TXT), gera
**resumos**, **flashcards** e **quiz**. Tem repetição espaçada nos flashcards,
estatísticas, tema claro/escuro e organização por **cadernos** (cada caderno é
um material separado, com seu próprio conteúdo/resumos/flashcards/quiz).

Existe em **três formas**, todas com a mesma tela:

1. **App desktop (Electron)** — Windows/Mac/Linux, instalado pelo usuário.
2. **Versão web** — a mesma tela rodando no navegador, servida pelo backend.
   URL: `https://dybass-studyai.onrender.com`
3. **Backend (Node/Express)** — guarda a chave da Anthropic e repassa as chamadas.

---

## Arquitetura

```
                 (Modo Online)
Desktop (Electron) ──IPC──► main.js ──POST /api/chat──►┐
                                                       │
Navegador (web) ──► web-api.js ──POST /api/chat──►─────┼─► BACKEND (Render) ──► API Anthropic
                                                       │   (tem a chave)        (/v1/messages)
                 (Modo Offline = 100% local, sem servidor, via offline.js)
```

- A **chave da Anthropic** fica SÓ no backend (variável de ambiente no Render).
  O cliente nunca a vê.
- O backend exige um **código de acesso** (`x-access-code`). No desktop ele é
  injetado no build a partir do segredo do GitHub `DYBASS_ACCESS_CODE`; na web,
  o usuário digita o código uma vez (guardado no navegador).
- **Modo Offline** gera tudo localmente (processamento de texto), sem internet,
  sem servidor e sem custo.

---

## Arquivos principais

### App (raiz do repositório)
- `app.jsx` — **código-fonte da UI** (React/JSX). É onde se edita a interface.
- `app.js` — **gerado** por `npm run build:jsx` a partir de `app.jsx`. NÃO editar
  à mão (o Babel transpila no build; não roda no navegador do usuário).
- `scripts/build-jsx.js` — compila `app.jsx` → `app.js` (Babel vendorizado).
- `index.html` — a casca (head, estilos, `<script src="app.js">`). React/PDF.js
  locais em `vendor/` (NÃO CDN — antivírus bloqueava).
- `offline.js` — motor offline (resumo/flashcards/quiz por processamento de texto).
- `main.js` — processo principal do Electron: cria a janela, chama o backend
  (`callBackend`), auto-update, e pré-aquece o backend (`warmUpBackend`).
- `preload.js` — expõe `window.electronAPI` (generateSummary/Flashcards/Quiz, exportFile).
- `package.json` — electron-builder (NSIS+portable Win, AppImage Linux, dmg/zip Mac),
  `publish` github, injeta `runtime-config.json` no build.
- `.github/workflows/build.yml` — CI: compila os 3 SOs e publica Release
  (via `workflow_dispatch` com input `release_tag`, ou push de tag `v*`).

### Backend (`server/`)
- `server.js` — Express. Rotas: `/health`, `/api/chat` (proxy p/ Anthropic,
  exige código de acesso, rate limit) e serve a **versão web** (injeta `web-api.js`
  antes do `app.js`, servindo `../index.html`, `../app.js`, `../offline.js`, `../vendor`).
- `web-api.js` — adaptador que faz o app funcionar no navegador (fornece
  `window.electronAPI` chamando `/api/chat`; pede o código de acesso uma vez).
- `.env.example` — modelo dos segredos (o `.env` real nunca vai pro git).
- `README.md` — como rodar/deployar o backend.

---

## Como mexer e publicar

### Editar a interface
1. Edite `app.jsx` (e `index.html` para estilos).
2. Rode `npm run build:jsx` (regenera `app.js`). O `build-jsx.js` já valida a sintaxe.
3. Suba a versão em `package.json` e commite.

### Publicar nova versão do app desktop
Dispare o workflow **Build Dybass Estudioso** com o input `release_tag` (ex.:
`v1.8.0`). Em ~8-15 min publica os instaladores na página de Releases. O usuário
**baixa e roda o `Setup X.Y.Z.exe`** (instala por cima).

### Atualizar a versão web
A web é servida pelo backend a partir dos arquivos da raiz. O Render só
**republica automaticamente quando algo em `server/` muda**. Por isso, ao mudar
o app, também suba a versão de `server/package.json` (isso dispara o redeploy e
o Render puxa o `app.js`/`index.html` novos). Depois, recarregue a página (F5).

### Backend (Render)
- Root Directory: `server` · Build: `npm install` · Start: `npm start`
- Variáveis: `ANTHROPIC_API_KEY` (a chave) e `ACCESS_CODE` (o código).
- Health check: `/health`.
- Plano free "dorme" após ~15 min; a 1ª chamada demora ~50s (por isso o app
  pré-aquece com um ping ao abrir).

---

## Segurança e custo (importante)

- A chave da Anthropic fica só no servidor. ✔
- O **código de acesso** é uma trava leve (barra estranhos), mas quem tiver o
  app + código consome os **créditos da Anthropic do dono**. Por isso:
  **configure um limite de gasto mensal** no painel da Anthropic (Billing → Limits).
- Rate limit: 60 req / 15 min por IP.
- Para custo zero, usar o **Modo Offline**.
- Distribuição atual é para **poucos/confiáveis**. Para distribuição ampla, o
  próximo passo seria **login por usuário** (contas), não feito ainda.

---

## Armadilhas conhecidas

- **Auto-update não funciona com repositório privado** (electron-updater precisa
  de token para ler releases privados). Por isso a atualização hoje é **manual**:
  baixar e rodar o `Setup`. Fechar/reabrir o app NÃO atualiza. Para ativar o
  auto-update de verdade: tornar o repo público OU migrar o app para um repo
  público próprio.
- **Como saber a versão pela tela:** o subtítulo da seção *Resumo* muda a cada
  grande mudança. Na v1.7.0 é *"Uma aba por resumo deste caderno..."*.
- **Electron não suporta `window.prompt()`** — usar o componente `NamePrompt`
  (modal) para pedir texto. No navegador, `prompt()` funciona.
- **Mac sem assinatura:** o Gatekeeper bloqueia. Solução do usuário:
  `xattr -cr "/Applications/Dybass Estudioso.app"` uma vez. (A versão web evita
  isso completamente.) Build Mac é só **arm64** (Apple Silicon).
- **Push de tag `v*` pode dar 403** nesta infra — usar `workflow_dispatch` com
  input `release_tag`.
- **Não editar `app.js` à mão** — é gerado de `app.jsx`.
- **NÃO usar CDN** no `index.html` — tudo em `vendor/` local.

---

## Histórico de versões (resumo)

- **v1.0.0** — versão inicial (o usuário colava a própria chave de API no app).
- **v1.1.x** — correção de truncamento (max_tokens + tool use), prompt caching,
  repetição espaçada (SM-2), aviso de PDF digitalizado, auto-update/target Mac,
  JSX pré-compilado, ícone macOS.
- **v1.2.0** — **Cadernos** (biblioteca de conteúdos separados).
- **v1.3.0** — **Migração de segurança**: chave sai do cliente; app passa a usar
  o backend proxy; remove o campo de "colar chave".
- **v1.4.0** — resumos acumulam (histórico por caderno); flashcards somam sem
  duplicar; pré-aquece o backend.
- **v1.5.0** — filtro de capítulos vira dropdown compacto quando há muitos.
- **v1.6.0** — renomear cada resumo do histórico.
- **v1.7.0** — seção Resumo em **abas**: editar conteúdo e salvar cada uma.
- **(web)** — o backend passou a servir o app como versão web (URL), resolvendo
  a distribuição no Mac sem instalar.

> O histórico completo e detalhado está nos commits do branch.
