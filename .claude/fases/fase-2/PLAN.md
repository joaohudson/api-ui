# Plano de Execução — Fase 2

Esta fase não amplia o escopo funcional descrito em `CLAUDE.md` (verbos HTTP, coleções, ambientes, persistência etc.), que permanece concluído pela fase 1. O objetivo aqui é exclusivamente **melhorar a UI existente**, adicionando a capacidade de redimensionar, com o mouse, as seções da tela que hoje têm tamanho fixo ou dividido automaticamente.

Diferente da fase 1, o escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

## Problema atual

Em `src/index.html` / `src/styles.css`, o layout tem três divisões que hoje não são ajustáveis pelo usuário:

1. **Sidebar vs. área principal** (`#sidebar` × `#main-area`, dentro de `#app-body`, `display:flex` em linha). `#sidebar` tem `width: 280px` fixo.
2. **Dentro da sidebar**, `#sidebar-collections-section` × `#sidebar-requests-section` (dentro de `#sidebar`, `display:flex` em coluna). Nenhum dos dois tem `flex-grow`; ambos crescem com o conteúdo, sem altura própria — por isso `.collections-list`/`.requests-list` (que já têm `overflow-y:auto`) nunca chegam a rolar de fato.
3. **Editor de requisição vs. painel de resposta** (`#request-editor` × `#response-panel`, dentro de `#main-area`, `display:flex` em coluna). Ambos têm `.panel { flex: 1; }`, ou seja, dividem o espaço 50/50 sempre. É o caso citado como exemplo: o painel de resposta ocupa uma área considerável e não pode ser redimensionado.

## Objetivo

Adicionar um divisor arrastável (resizer) em cada uma dessas três junções, permitindo redimensionar as seções com o mouse, com o tamanho ajustado persistido entre sessões (a aplicação é desktop/offline, sem sincronização — a persistência é local, via `localStorage` do webview, já que é preferência de UI e não dado de domínio; não usa os comandos Tauri de persistência da fase 1).

## Fora de escopo

- Redimensionamento por toque/touch dedicado (o mecanismo com Pointer Events funciona em touch incidentalmente, mas não há nenhum ajuste de UX específico para isso).
- Colapsar/ocultar painéis por completo (ex.: esconder a sidebar com um clique). Apenas redimensionar dentro de limites mínimo/máximo.
- Redimensionamento dentro do formulário do editor de requisição (ex.: subseções de headers/body) — essas já usam `textarea { resize: vertical }` nativo onde fazia sentido (`.body-raw-textarea`) e não fazem parte do pedido.
- Temas, novas cores ou qualquer mudança visual não relacionada a redimensionamento.
- Suporte a teclado nos divisores (nice-to-have natural para `role="separator"`, mas não é o que foi pedido; pode ficar para uma fase futura).

## Detalhes de implementação

### 1. Novo módulo `src/resizable-panels.js`

Módulo único e genérico, sem dependências externas, exportando uma função `initResizablePanels()` chamada a partir de `main.js`.

Função central `createResizer(options)`:

```js
createResizer({
  handle,        // elemento do divisor (recebe os eventos de pointer)
  target,        // elemento cujo tamanho é controlado (o "antes" do par)
  container,     // ancestral que define o espaço total disponível
  axis,          // "horizontal" (arrasta X, define width) | "vertical" (arrasta Y, define height)
  min,           // tamanho mínimo do target, em px
  siblingMin,    // tamanho mínimo a preservar para o irmão (flex:1), em px
  defaultSize,   // tamanho inicial se não houver nada salvo
  storageKey,    // chave usada em localStorage (prefixo "apiui.layout.")
})
```

Comportamento:

- Ao inicializar, lê `localStorage.getItem("apiui.layout." + storageKey)`. Se existir e for um número válido, aplica; senão aplica `defaultSize`. Aplicar = `target.style.flex = "0 0 " + px + "px"`.
- O elemento irmão do `target` dentro do `container` **não é tocado**: ele já tem (ou passa a ter, ver seção 3) `flex: 1; min-height: 0` (ou `min-width: 0` no eixo horizontal), então absorve automaticamente o espaço restante quando `target` muda de tamanho. Isso evita ter que calcular/aplicar o tamanho dos dois lados.
- `pointerdown` no `handle`: inicia o arrasto (`handle.setPointerCapture(e.pointerId)`), guarda a posição inicial do ponteiro e o tamanho atual do `target` (via `getBoundingClientRect()`), adiciona `document.body.classList.add("resizing", axis === "horizontal" ? "resizing-col" : "resizing-row")` (usado pelo CSS para forçar o cursor certo e desabilitar seleção de texto durante o arrasto, já que o ponteiro pode passar por cima de outros elementos).
- `pointermove`: só age se o arrasto estiver ativo. Calcula `delta = posiçãoAtual - posiçãoInicial` no eixo certo (`clientX` para `horizontal`, `clientY` para `vertical`), soma ao tamanho inicial, aplica `clamp` e escreve em `target.style.flex` imediatamente (feedback visual a cada frame de movimento). **Não** grava em `localStorage` a cada `pointermove` — só o suficiente para não gerar I/O excessivo.
- Função de clamp: `min(max(size, min), containerSize - handleThickness - siblingMin)`, onde `containerSize` vem de `container.getBoundingClientRect()` (width ou height conforme o eixo) e `handleThickness` é a espessura do divisor (6px, ver CSS). Isso garante que nenhum dos dois lados do par suma por completo, mesmo em janelas pequenas.
- `pointerup`/`pointercancel`: encerra o arrasto, remove as classes de `document.body`, e só então grava o tamanho final em `localStorage.setItem("apiui.layout." + storageKey, String(px))`.
- Sem *throttle*/`requestAnimationFrame` — o volume de trabalho por `pointermove` é uma escrita de estilo, é aceitável fazer direto.

`initResizablePanels()` cria três resizers:

| Resizer | handle (id) | target | container | axis | min | siblingMin | defaultSize | storageKey |
|---|---|---|---|---|---|---|---|---|
| Sidebar × área principal | `sidebar-resizer` | `#sidebar` | `#app-body` | horizontal | 200 | 320 | 280 | `sidebarWidth` |
| Coleções × requisições (sidebar) | `sidebar-sections-resizer` | `#sidebar-collections-section` | `#sidebar` | vertical | 80 | 80 | 200 | `sidebarCollectionsHeight` |
| Editor × resposta | `main-resizer` | `#request-editor` | `#main-area` | vertical | 120 | 120 | valor atual renderizado (ver nota) | `requestEditorHeight` |

Nota sobre o `defaultSize` do editor × resposta: como hoje os dois painéis dividem 50/50 via `flex:1` em ambos, o "tamanho atual" na primeira execução (sem valor salvo) deve ser calculado a partir da altura real de `#main-area` no momento do `initResizablePanels()` (`container.getBoundingClientRect().height / 2`), para que a primeira renderização com o novo código não dê um salto visual em relação ao comportamento anterior. Os outros dois resizers podem usar uma constante fixa como `defaultSize`, pois hoje não têm divisão dinâmica equivalente (sidebar já é fixa em 280px; a divisão das seções da sidebar não existe hoje, então 200px é um valor razoável de partida).

### 2. Marcação HTML (`src/index.html`)

Adicionar três `<div>` de divisor, com `role="separator"` e `aria-orientation` (mesmo sem suporte a teclado, o `role` comunica corretamente a função a leitores de tela):

- Entre `</aside>` (fim de `#sidebar`) e `<main id="main-area">`:
  ```html
  <div id="sidebar-resizer" class="resizer resizer--col" role="separator" aria-orientation="vertical"></div>
  ```
- Entre o fim de `#sidebar-collections-section` e o início de `#sidebar-requests-section`:
  ```html
  <div id="sidebar-sections-resizer" class="resizer resizer--row" role="separator" aria-orientation="horizontal"></div>
  ```
- Entre `</section>` de `#request-editor` e `<section id="response-panel">`:
  ```html
  <div id="main-resizer" class="resizer resizer--row" role="separator" aria-orientation="horizontal"></div>
  ```

Convenção de nome: `resizer--col` = divisor vertical (linha fina na vertical) que se arrasta na horizontal e controla largura; `resizer--row` = divisor horizontal que se arrasta na vertical e controla altura. É a mesma convenção usada nos `axis` do módulo JS (`horizontal`/`vertical` referem-se ao eixo do movimento do mouse, não à orientação visual da linha do divisor — importante manter isso consistente entre HTML, CSS e JS para não inverter cursores).

### 3. Estilos (`src/styles.css`)

**Divisores:**

```css
.resizer {
  flex-shrink: 0;
  position: relative;
  background-color: transparent;
  z-index: 2;
}

.resizer::after {
  content: "";
  position: absolute;
  background-color: var(--color-border);
}

.resizer--col {
  width: 6px;
  cursor: col-resize;
}
.resizer--col::after {
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
}

.resizer--row {
  height: 6px;
  cursor: row-resize;
}
.resizer--row::after {
  left: 0;
  right: 0;
  top: 2px;
  height: 1px;
}

.resizer:hover::after,
body.resizing .resizer::after {
  background-color: var(--color-accent);
}

body.resizing-col,
body.resizing-col * {
  cursor: col-resize !important;
  user-select: none !important;
}
body.resizing-row,
body.resizing-row * {
  cursor: row-resize !important;
  user-select: none !important;
}
```

A linha visível (`::after`, 1px) fica centralizada dentro de uma faixa de 6px que é a área real de clique/arrasto — alvo maior que a linha, mais fácil de acertar com o mouse, seguindo o padrão comum desse tipo de controle.

**Ajustes nos painéis existentes**, para que o irmão de cada `target` realmente preencha o espaço restante e role internamente quando o `target` for redimensionado:

- `#sidebar`: trocar `width: 280px;` por `flex: 0 0 280px;` (o valor inicial só importa antes do JS rodar; depois disso `resizable-panels.js` sobrescreve via `style.flex` inline). Manter `flex-shrink: 0` redundante não tem problema, mas passa a ser parte do shorthand `flex`.
- `.sidebar-section`: adicionar `min-height: 0;` e `overflow: hidden;` (cada seção passa a ter altura definida — pela primeira, via `flex` inline aplicado pelo JS; pela segunda, via `flex: 1`).
- `#sidebar-collections-section` (a primeira, controlada pelo resizer): sem `flex-grow` adicional — o tamanho vem do `style.flex` inline aplicado pelo JS.
- `#sidebar-requests-section` (a segunda, que absorve o espaço restante): adicionar `flex: 1;`.
- `.collections-list`, `.requests-list`: adicionar `flex: 1; min-height: 0;` para que a rolagem interna (já existente via `overflow-y: auto`) realmente entre em ação quando a seção tiver altura limitada.
- `#request-editor`: sem `flex: 1` fixo — mantém a classe `.panel`, mas o `style.flex` inline aplicado pelo JS passa a mandar (inline sempre tem prioridade sobre a regra de classe, então não é preciso remover `flex:1` de `.panel`).
- `#response-panel`: adicionar `flex: 1;` explícito no seletor `#response-panel` (hoje já herda de `.panel`, então na prática não muda nada — é só deixar explícito que este é o lado que "sobra", para reforçar a leitura do CSS).

### 4. Integração (`src/main.js`)

```js
import { initResizablePanels } from "./resizable-panels.js";
```

Chamar `initResizablePanels();` dentro do listener de `DOMContentLoaded`, junto das chamadas já existentes (`render()`, `renderRequestEditor()`, `renderInitialResponsePanel()`, `setRequestStateListener(...)`). Ordem sugerida: depois de `render()` e antes/depois das demais não importa, já que os elementos-alvo (`#sidebar`, `#request-editor`, `#response-panel`) existem desde o HTML estático — não dependem de dados carregados dinamicamente.

## Critérios de aceite

- Arrastando o divisor entre sidebar e área principal, a largura da sidebar muda em tempo real e o restante do layout (área principal) se ajusta sem quebrar.
- Arrastando o divisor entre "Coleções" e "Requisições" na sidebar, a altura de cada lista muda; quando uma lista tem mais itens do que cabe no espaço, ela rola internamente (scroll) em vez de estourar o layout.
- Arrastando o divisor entre o editor de requisição e o painel de resposta, a altura de cada um muda — em particular, dá para aumentar a área do painel de resposta além da divisão 50/50 padrão, resolvendo o caso citado como motivador desta fase.
- Nenhum dos pares de seção pode ser reduzido a ponto de um lado sumir completamente (respeita `min`/`siblingMin` mesmo em janelas pequenas ou redimensionadas).
- Fechar e reabrir a aplicação preserva os três tamanhos ajustados (via `localStorage`).
- Sem nenhum ajuste manual do usuário, o layout se comporta como hoje (sidebar 280px, editor/resposta ~50/50), sem saltos visuais perceptíveis na primeira renderização.
- Nenhuma dependência nova adicionada a `package.json`/`Cargo.toml` — a funcionalidade é só JS/CSS/HTML vanilla, sem tocar no lado Rust.

## Entregáveis

- `src/resizable-panels.js` (novo).
- `src/index.html`, `src/styles.css`, `src/main.js` atualizados conforme acima.
- As três junções de layout (sidebar × área principal, coleções × requisições, editor × resposta) redimensionáveis com o mouse e persistentes entre sessões.
