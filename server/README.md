# Backend do Dybass Estudioso

Servidor simples que **guarda a chave da Anthropic** e fala com a API por você.
Assim a chave nunca fica no computador do usuário.

```
App Electron  ──POST /api/chat──▶  este servidor  ──▶  API da Anthropic
                                   (tem a chave)       (/v1/messages)
```

## O que cada arquivo faz
- `server.js` — o servidor (Express). Recebe o pedido do app, valida o código de
  acesso, aplica limite de requisições e repassa para a Anthropic.
- `package.json` — lista as bibliotecas usadas.
- `.env.example` — modelo das variáveis de ambiente (os segredos). Você copia
  para `.env` e preenche. O `.env` real nunca vai para o Git.

## Rodar no seu PC (para testar)
1. Instale as dependências:
   ```
   cd server
   npm install
   ```
2. Crie o arquivo de segredos:
   ```
   cp .env.example .env
   ```
   Abra o `.env` e preencha:
   - `ANTHROPIC_API_KEY` — sua chave (console.anthropic.com → API Keys).
   - `ACCESS_CODE` — invente um código (o app vai enviar o mesmo).
3. Suba o servidor:
   ```
   npm start
   ```
   Deve aparecer "Backend do Dybass rodando na porta 3000".
4. Teste que está no ar (em outro terminal):
   ```
   curl http://localhost:3000/health
   ```
   Resposta esperada: `{"ok":true}`

## Publicar no Render (grátis)
1. Suba este repositório para o GitHub (já está).
2. Em https://render.com → **New** → **Web Service** → conecte o repositório.
3. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Em **Environment**, adicione as variáveis (as mesmas do `.env`, sem subir o arquivo):
   - `ANTHROPIC_API_KEY` = sua chave
   - `ACCESS_CODE` = seu código
5. Clique em **Create Web Service**. Ao terminar, o Render te dá uma URL, algo como
   `https://dybass-backend.onrender.com`.
6. Teste: abra `https://SUA-URL.onrender.com/health` no navegador → deve mostrar `{"ok":true}`.

> **Dica de custo:** no painel da Anthropic, configure um **limite de gasto mensal**
> (Billing → Limits). É a sua rede de segurança caso alguém descubra a URL.

> **Plano grátis do Render:** o servidor "dorme" após ~15 min sem uso. A primeira
> requisição depois disso demora ~30-50s para acordar; as seguintes são normais.

## Rotas
- `GET /health` → `{ ok: true }` (checagem de saúde).
- `POST /api/chat` → recebe `{ model, max_tokens, system, messages, tools, tool_choice }`,
  exige o cabeçalho `x-access-code`, e devolve a resposta da Anthropic.
