# Dybass Estudioso

App de estudos desktop (Electron) que gera **resumos**, **flashcards** e **quiz**
a partir do conteúdo que você inserir. Visual preto e vermelho escuro.

## Funcionalidades

- **Conteúdo** — cole ou digite seu material de estudo (salvo automaticamente).
- **Resumo** — modo *Completo* (detalhado) e *Simples* (tópicos).
- **Flashcards** — cartões pergunta/resposta com animação de virar e navegação.
- **Quiz** — questões de múltipla escolha com placar; "Novo Quiz" renova as questões.
- **Modo Online ☁️** — usa a IA Claude (requer chave de API e internet).
- **Modo Offline 🔌** — gera tudo localmente, **sem internet e sem chave de API**,
  usando processamento de texto (frequência de termos, extração de sentenças e
  cloze deletion). Alterne no botão da barra lateral.
- **Exportar flashcards** — para **Anki** (`.txt`), **CSV** ou **JSON**.

## Como rodar (desenvolvimento)

```bash
npm install
# Modo online (opcional): configure a chave da API Anthropic
export ANTHROPIC_API_KEY="sua-chave-aqui"     # Linux/Mac
# set ANTHROPIC_API_KEY=sua-chave-aqui        # Windows (cmd)
npm start
```

> Sem chave de API, o app ativa o **Modo Offline** automaticamente.

## Gerar o instalável (ícone na área de trabalho)

```bash
# Windows — gera instalador .exe (NSIS) + versão portátil
npm run build:win

# Linux — gera AppImage
npm run build:linux

# Ambos
npm run build:all
```

Os arquivos são gerados na pasta `dist/`. No Windows, o instalador `.exe`
cria atalhos na **área de trabalho** e no menu Iniciar automaticamente.

> Para compilar o `.exe` do Windows a partir do Linux pode ser necessário ter o
> `wine` instalado; o ideal é rodar `npm run build:win` no próprio Windows.

## Exportar para o Anki

1. Gere os flashcards.
2. Clique em **Exportar → Anki** e salve o `.txt`.
3. No Anki: *Arquivo → Importar*, selecione o arquivo. Os campos são separados
   por TAB (Pergunta → Frente, Resposta → Verso).
