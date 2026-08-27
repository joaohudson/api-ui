# Plano de Execução — Fase 7

Esta fase não amplia o escopo funcional descrito em `CLAUDE.md` (verbos HTTP, coleções, ambientes, persistência, importação etc.), que permanece como está. O objetivo aqui é exclusivamente **polir a UI existente do toolbar do editor de requisição**, em dois pontos:

1. Trocar o botão "Salvar" (hoje texto puro) por um botão **só com ícone**.
2. Adicionar uma **animação de carregamento** (spinner) durante o envio da requisição — hoje o feedback é apenas a troca de texto para "Enviando...".

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

## Situação atual

Toda a toolbar é montada em JS por `buildToolbar()` em `src/request-editor.js` (~linha 652). Ela contém, nesta ordem: `select` de método, `input` de URL, botão `.save-btn` e botão `.send-btn`.

### Botão Salvar (`.save-btn`)

- `src/request-editor.js` (~linha 685): `saveBtn.textContent` alterna entre três estados vindos do `Map` `savingState` (`src/request-editor.js:87`): `undefined` → `"Salvar"`, `"saving"` → `"Salvando..."`, `"saved"` → `"Salvo!"`.
- `saveBtn.disabled` = está salvando **ou** não há `currentMeta.requestId`.
- `saveBtn.title` já traz o texto descritivo (habilitado x desabilitado).
- Estilo em `src/styles.css:279` (`.save-btn`), com `padding: 0.45rem 1.1rem` pensado para rótulo de texto.
- O ciclo de vida dos estados (`saving` → `saved` → volta a ocioso após 1200ms) fica em `handleSaveRequest()` (`src/request-editor.js:508`) e não muda nesta fase.

### Envio da requisição (`.send-btn` + painel de resposta)

- `src/request-editor.js:699`: `sendBtn.textContent` alterna entre `"Enviar"` e `"Enviando..."` conforme `runningRequests` (`src/request-editor.js:86`); `sendBtn.disabled = isRunning`.
- `src/request-editor.js:451` `handleSendRequest()` emite `notifyStateChange({ running: true, ... })` antes da chamada e `{ running: false, ... }` no fim.
- `src/response-panel.js:51` `renderLoadingState()` mostra um `<p class="empty-state response-loading">` com texto "Enviando requisição..." (acionado por `handleRequestStateChange` quando `payload.running`, `src/response-panel.js:212`).
- Estilo do botão em `src/styles.css:300` (`.send-btn`); estilo do loading do painel em `src/styles.css:563` (`.response-loading`).

## Objetivo

- **Salvar**: botão `.save-btn` passa a exibir apenas um ícone (SVG inline `currentColor`, mesmo padrão já usado em `buildImportMenu`, `src/request-editor.js:582`), sem rótulo de texto. Os três estados passam a ser comunicados por ícone: ocioso → ícone de disquete/salvar; salvando → spinner; salvo → ícone de "check". Acessibilidade preservada via `aria-label` + `title` (o `title` já existe; adicionar `aria-label` com o mesmo texto e atualizá-lo conforme o estado).
- **Envio**: adicionar um spinner animado por CSS, visível em dois lugares enquanto a requisição está em voo:
  - dentro do `.send-btn` (spinner antes do texto "Enviando...");
  - no painel de resposta, junto ao texto "Enviando requisição..." em `renderLoadingState()`.
- O spinner é um único componente reutilizável: uma classe CSS `.spinner` + `@keyframes` de rotação, sem imagem, sem dependência nova. Deve respeitar `prefers-reduced-motion` (parar/atenuar a animação).

## Fora de escopo

- Trocar o botão "Enviar" por versão só-ícone — o pedido é só o "Salvar". O "Enviar" continua com texto (ganha apenas o spinner ao lado).
- Qualquer mudança no ciclo de estados de salvamento/envio, nos tempos (1200ms), ou na lógica de `savingState`/`runningRequests`.
- Barra de progresso real / percentual de upload/download — é um indicador indeterminado (spinner girando), não medição de progresso.
- Novos ícones para outros botões da UI (sidebar, tabs, etc.).
- Temas, novas cores ou variáveis de cor além das já existentes em `:root`.
- Skeleton loading / placeholder animado do corpo da resposta — o loading do painel continua sendo uma linha de texto, só com o spinner ao lado.
- Tocar em qualquer código Rust (`src-tauri/`).

## Detalhes de implementação

### 1. Spinner reutilizável (`src/styles.css`)

Adicionar, em uma seção nova "Spinner / loading" (perto de `.response-loading`, `src/styles.css:561`):

```css
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  vertical-align: -0.15em;
  animation: spinner-rotate 0.6s linear infinite;
}

@keyframes spinner-rotate {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2s; }
}
```

- `width/height` em `em` para o spinner acompanhar o `font-size` de onde for usado (botão e painel).
- `currentColor` para herdar a cor do contexto (texto branco no `.send-btn`, `--color-text` no `.save-btn`, `--color-text-muted` no painel).
- Quando usado dentro do `.send-btn` junto ao texto, dar um `margin-right: 0.45rem` via classe modificadora ou seletor de contexto (`.send-btn .spinner { margin-right: 0.45rem; }`).

### 2. Botão Salvar só-ícone (`src/request-editor.js`)

No trecho de `buildToolbar()` que monta o `saveBtn` (`src/request-editor.js:685-694`):

- Remover o `saveBtn.textContent = ...`.
- Adicionar `saveBtn.classList.add("save-btn--icon")` (nova classe para o CSS diferenciar do padding de texto) — ou simplesmente ajustar `.save-btn` no CSS já que ele só é usado aqui; preferir a classe modificadora para deixar a intenção explícita.
- Definir o conteúdo conforme o estado:
  - `saveState === "saving"` → `saveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>'`.
  - `saveState === "saved"` → SVG inline de "check" (ex.: path de check simples, `viewBox="0 0 16 16"`, `fill="currentColor"`, `width/height="15"`, `aria-hidden="true"`).
  - caso ocioso → SVG inline de disquete/salvar (mesmo formato).
- Acessibilidade: `saveBtn.setAttribute("aria-label", label)` onde `label` reflete o estado (`"Salvar alterações nesta requisição"` / `"Salvando..."` / `"Salvo"` / o texto de desabilitado já existente). Manter o `saveBtn.title` como está (ou alinhá-lo ao `aria-label`).
- `disabled` e o `addEventListener("click", handleSaveRequest)` permanecem exatamente como estão.
- Extrair os dois SVGs (disquete e check) para constantes de módulo no topo do arquivo (perto das outras constantes, ex.: `HTTP_METHODS`), no estilo do SVG já embutido em `buildImportMenu`, para não poluir `buildToolbar()`.

### 3. Spinner no botão Enviar (`src/request-editor.js`)

No trecho do `sendBtn` (`src/request-editor.js:696-702`):

- Quando `isRunning`: `sendBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Enviando...'`.
- Quando ocioso: `sendBtn.textContent = "Enviar"` (como hoje).
- `disabled` e o listener permanecem.

### 4. Spinner no painel de resposta (`src/response-panel.js`)

Em `renderLoadingState()` (`src/response-panel.js:51`):

- Trocar o `<p>` único por um container (`<div class="empty-state response-loading">`) contendo `<span class="spinner" aria-hidden="true"></span>` seguido de um `<span>` com o texto "Enviando requisição...".
- Ajustar `.response-loading` em `src/styles.css:563` para `display: flex; align-items: center; gap: 0.5rem;` (mantendo `color: var(--color-text-muted)`).

### 5. Ajuste de estilo do `.save-btn` só-ícone (`src/styles.css`)

Adicionar regra para `.save-btn--icon` (ou ajustar `.save-btn`):

```css
.save-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem;      /* quadrado, sem o padding lateral de texto */
  width: 2.1rem;         /* alinhar com a altura dos outros controles do toolbar */
}

.save-btn--icon svg {
  display: block;
}
```

Conferir visualmente que a altura do botão continua igual à do `.method-select` / `.url-input` / `.send-btn` (todos com `padding: 0.45rem ...` e `font-size: 0.9rem`); ajustar se necessário.

## Critérios de aceite

- O botão "Salvar" no toolbar do editor aparece **apenas com ícone**, sem texto, e mantém a mesma altura dos demais controles da linha (método, URL, Enviar).
- Passar o mouse sobre o botão "Salvar" mostra um tooltip descritivo; leitores de tela anunciam um rótulo (`aria-label`) coerente com o estado.
- Ao clicar em "Salvar": o ícone vira um spinner girando enquanto salva, depois um "check" por ~1,2s, depois volta ao ícone de salvar — acompanhando os estados que já existiam.
- Ao clicar em "Enviar" com uma requisição válida: o botão fica desabilitado, mostra um spinner girando antes do texto "Enviando...", e o painel de resposta mostra um spinner ao lado de "Enviando requisição...".
- Quando a resposta chega (sucesso ou erro), os spinners somem e o comportamento é idêntico ao atual.
- Com `prefers-reduced-motion: reduce` ativo no SO, a animação do spinner fica bem mais lenta/discreta (não pisca nem gira rápido).
- Nenhuma dependência nova em `package.json`/`Cargo.toml`; nenhuma alteração em `src-tauri/`. Só `src/request-editor.js`, `src/response-panel.js` e `src/styles.css` são tocados.
- `npm run tauri dev` sobe sem erros de console relacionados à mudança.

## Entregáveis

- `src/styles.css`: classe `.spinner` + `@keyframes` + regra `prefers-reduced-motion`; ajuste de `.response-loading`; regra `.save-btn--icon`.
- `src/request-editor.js`: constantes de SVG (salvar/check); `buildToolbar()` com `.save-btn` só-ícone e spinner no `.send-btn`.
- `src/response-panel.js`: `renderLoadingState()` com spinner.
- Botão "Salvar" só-ícone e feedback de carregamento animado no envio da requisição, funcionando de ponta a ponta.
