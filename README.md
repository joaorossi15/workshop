# Agente em produção? — site da oficina

Site interativo para conduzir, em tempo real, uma oficina baseada no **Guia de Agentes de IA para Serviços Públicos Digitais**.

## O que está incluído

- `index.html` — página dos participantes.
- `facilitator.html` — painel projetado pelo facilitador; controla rodadas e mostra resultados.
- `styles.css` — identidade visual responsiva, sem frameworks externos.
- `app.js` — lógica da experiência dos participantes.
- `facilitator.js` — controle e dashboard ao vivo.
- `config.js` — onde você cola a URL do Apps Script.
- `Code.gs` — backend para Google Sheets/Google Apps Script.

## Estrutura pedagógica

As 19 perguntas do roteiro foram mantidas como lógica da atividade, mas agrupadas em 5 rodadas:

1. **Adequação e benefício** — perguntas 1–4.
2. **Autonomia e dados** — perguntas 5–7 e pontos relacionados a limites/revisão.
3. **Riscos e impactos** — perguntas 8–11.
4. **Controles e governança** — perguntas 12–16.
5. **Piloto, monitoramento e decisão final** — perguntas 17–19.

Todos analisam o **mesmo caso**. O facilitador abre uma rodada, todos respondem, os resultados aparecem no painel e a turma discute antes de avançar.

## 1. Criar o Google Sheets

1. Crie uma planilha vazia no Google Sheets.
2. Vá em **Extensões → Apps Script**.
3. Apague o conteúdo inicial e cole o conteúdo de `Code.gs`.
4. Troque a linha:

```js
const ADMIN_KEY = 'TROQUE-ESTA-CHAVE';
```

por uma chave que somente você conheça.

Não é necessário criar as abas manualmente; elas são criadas automaticamente no primeiro acesso.

## 2. Publicar o Apps Script

No editor do Apps Script:

1. Clique em **Implantar → Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. Executar como: **Você**.
4. Quem tem acesso: **Qualquer pessoa**.
5. Autorize o script.
6. Copie a URL final, que normalmente termina em `/exec`.

## 3. Conectar o site

Abra `config.js` e cole a URL:

```js
window.WORKSHOP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/SEU_ID/exec",
  WORKSHOP_TITLE: "Agente em produção?",
  ORGANIZATION: "Oficina — Guia de Agentes de IA para Serviços Públicos Digitais"
};
```

## 4. Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Em **Settings → Pages**, escolha **Deploy from a branch**.
4. Selecione `main` e `/ (root)`.
5. O GitHub exibirá a URL pública.

Participantes usam:

`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`

Facilitador usa:

`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/facilitator.html`

## Como conduzir a oficina

1. Abra `facilitator.html` no computador que será projetado.
2. Digite sua chave do facilitador.
3. Clique em **Nova sessão** antes de começar.
4. Mostre o QR/link de `index.html` aos participantes.
5. Abra a **Rodada 1**.
6. Aguarde respostas; o dashboard atualiza automaticamente.
7. Discuta os resultados.
8. Abra a rodada seguinte.
9. Ao final, selecione **Encerrado**.

### Sugestão de tempo

- Rodada 1: 6–8 min
- Rodada 2: 8–10 min
- Rodada 3: 10 min
- Rodada 4: 10 min
- Rodada 5: 6–8 min

A maior parte desse tempo deve ser usada na discussão dos resultados, não no preenchimento.

## Modo de demonstração

Se `APPS_SCRIPT_URL` estiver vazio, o site entra em **modo demonstração** e armazena dados apenas no `localStorage` do navegador. Isso permite testar a interface antes de configurar o Google Sheets, mas não sincroniza dispositivos diferentes.

## Estrutura da planilha

O script cria duas abas:

### Responses

Uma linha por resposta:

`timestamp | session_id | participant_id | round | question_id | question_label | answer | metadata_json`

### Config

Estado da oficina:

`current_round | session_id | status`

Os dados de sessões antigas permanecem na planilha para análise posterior.

## Privacidade

O site gera um identificador aleatório no navegador e **não solicita nome, e-mail ou outro identificador pessoal**. Para a oficina, evite pedir que os participantes incluam dados pessoais nas respostas abertas.
