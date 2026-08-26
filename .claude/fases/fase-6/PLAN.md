# Plano de Execução — Fase 6

Esta fase não amplia o escopo funcional geral descrito em `CLAUDE.md` (verbos HTTP, coleções, ambientes, persistência etc.), que permanece concluído pelas fases 1–5. O objetivo é exclusivamente **adicionar um novo tipo de body de requisição, `json`**, distinto do `raw` já existente, com editor formatado (auto-indentação, pretty-print sob demanda) e coloração de sintaxe — hoje o tipo `raw` é um `<textarea>` de texto plano sem nenhum desses recursos.

Como definido com o usuário antes deste plano:
- A coloração de sintaxe usa uma **biblioteca externa** (não uma implementação vanilla própria), mesmo o `CLAUDE.md` fixando o frontend como JS/HTML/CSS vanilla sem frameworks de UI — exceção pontual aceita para este componente.
- `json` passa a ser um **variant novo no enum Rust `RequestBody`** (não apenas um rótulo de UI serializado como `raw`), e o backend passa a **injetar automaticamente o header `Content-Type: application/json`** quando o body é desse tipo e o usuário não definiu manualmente um `Content-Type` próprio.

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

## Objetivo

- Novo item `JSON` no seletor de tipo de body do editor de requisição, ao lado de `none`/`raw`/`x-www-form-urlencoded`/`form-data`.
- Ao selecioná-lo, o body passa a ser editado em um componente com números de linha, coloração de sintaxe JSON (strings, números, booleanos/null, chaves de propriedade em cores distintas) e auto-indentação ao digitar (Enter mantém/aumenta indentação conforme chaves/colchetes abertos).
- Botão "Formatar JSON" que faz pretty-print do conteúdo atual (`JSON.stringify(JSON.parse(x), null, 2)`), mostrando uma mensagem de erro inline se o conteúdo não for um JSON válido (sem alterar o conteúdo nesse caso).
- Persistência: o body é salvo/carregado como `{ type: "json", content: "..." }`, sobrevivendo a salvar/recarregar a requisição.
- Envio: ao disparar a requisição, se nenhum header `Content-Type` foi definido manualmente pelo usuário, o backend Rust injeta `Content-Type: application/json` automaticamente.

## Fora de escopo

- Qualquer mudança no painel de resposta (`src/response-panel.js`) — ele já faz pretty-print de respostas JSON via `tryFormatJson`, mas não tem coloração de sintaxe; isso não faz parte deste pedido (o pedido é sobre o body da *requisição*).
- Detecção automática de JSON no tipo `raw` existente ou migração automática de requisições `raw` já salvas para `json` — os dois tipos continuam coexistindo, e o usuário escolhe explicitamente qual usar.
- Import de curl (`src/curl-import.js`): continua sempre gerando body `raw` a partir de `-d`, mesmo que o comando tenha `-H "Content-Type: application/json"`. Não passa a detectar e usar o novo tipo `json`.
- Validação/lint em tempo real enquanto o usuário digita (sublinhar erro token a token). A validação é só sob demanda, ao clicar em "Formatar JSON".
- Auto-format ao perder o foco (blur) ou a cada tecla — o pretty-print só acontece com o clique explícito no botão, para não atrapalhar edição em andamento.
- Coloração/tratamento especial de placeholders `{{variavel}}` dentro das strings do JSON (ficam coloridos como parte da string, sem destaque próprio). O indicador visual existente de "contém variável" (borda de destaque) é mantido, aplicado ao contêiner do editor.
- Tema claro/escuro — o app hoje só tem um tema (dark, fixo em `:root`); o editor JSON usa um tema próprio único, coerente com a paleta atual.
- Qualquer alteração em `form_urlencoded`/`form_data`/`none`.

## Detalhes de implementação

### 1. Vendorizar a biblioteca de highlighting — CodeMirror 5

Justificativa da escolha: o app não tem bundler (`frontendDist` em `tauri.conf.json` aponta direto para `../src`, servido sem build step) e precisa funcionar **totalmente offline** (sem CDN). CodeMirror 5 é distribuído com um build único que funciona via `<script>` simples (sem AMD/CommonJS/bundler), tem modo JSON pronto (MIME `application/json`) e cobre tanto coloração quanto os recursos de "formatação" pedidos (auto-indentação, bracket matching, auto-close de chaves/colchetes) — diferente de um highlighter puro como Prism, que não edita nem indenta.

1. `npm install codemirror@^5` (adiciona a dependência em `package.json`/`package-lock.json` — usada apenas como referência de versão/fonte dos arquivos, não é servida a partir de `node_modules`).
2. Copiar (não symlink) os seguintes arquivos de `node_modules/codemirror/` para `src/vendor/codemirror/`, preservando a subestrutura, e commitá-los normalmente (o `.gitignore` só ignora `node_modules/`, não `src/vendor/`):
   - `lib/codemirror.js`
   - `lib/codemirror.css`
   - `mode/javascript/javascript.js` (fornece o modo `application/json`)
   - `addon/edit/matchbrackets.js`
   - `addon/edit/closebrackets.js`
3. Em `src/index.html`, no `<head>`, adicionar `<link rel="stylesheet" href="vendor/codemirror/lib/codemirror.css" />` depois do link de `styles.css` (para que as regras de tema em `styles.css`, carregadas antes, ainda possam ser sobrescritas se necessário — na prática os seletores de tema usam uma classe própria, então a ordem não é crítica, mas mantenha `codemirror.css` por último).
4. No final do `<body>`, **antes** de `<script type="module" src="main.js"></script>`, adicionar scripts clássicos (não `type="module"`, pois esses arquivos se expõem via global `window.CodeMirror`) na ordem:
   ```html
   <script src="vendor/codemirror/lib/codemirror.js"></script>
   <script src="vendor/codemirror/mode/javascript/javascript.js"></script>
   <script src="vendor/codemirror/addon/edit/matchbrackets.js"></script>
   <script src="vendor/codemirror/addon/edit/closebrackets.js"></script>
   ```

### 2. Backend Rust — `src-tauri/src/http_engine.rs`

1. Adicionar variant ao enum (a herança `#[serde(tag = "type", rename_all = "snake_case")]` já existente faz `Json` serializar/desserializar como `"json"` automaticamente, sem precisar de `#[serde(rename = ...)]`):
   ```rust
   pub enum RequestBody {
       None,
       Raw { content: String },
       #[serde(rename = "form_urlencoded")]
       FormUrlEncoded { fields: Vec<(String, String)> },
       FormData { fields: Vec<FormDataField> },
       Json { content: String },
   }
   ```
2. Em `apply_body`, novo braço igual ao de `Raw` (o corpo em si é enviado como texto puro; o que muda é só o header, tratado no passo 3):
   ```rust
   RequestBody::Json { content } => Ok(builder.body(content.clone())),
   ```
3. Em `execute_request`, entre o loop que aplica `input.headers` (linhas ~199–201) e a chamada a `apply_body` (linha ~203), injetar o `Content-Type` automático apenas se o body for `Json` e o usuário não tiver definido `Content-Type` manualmente (comparação case-insensitive, mesmo critério já usado em `curl-import.js` no frontend para o mesmo header):
   ```rust
   if matches!(input.body, RequestBody::Json { .. })
       && !input.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
   {
       builder = builder.header("Content-Type", "application/json");
   }
   ```
4. Atualizar o comentário do módulo (linha ~7) que enumera os tipos de `RequestBody` suportados, incluindo `json`.

### 3. Novo módulo `src/json-body-editor.js`

Wrapper fino em torno do `window.CodeMirror` global, isolando a integração da lib do resto do editor:

```js
export function createJsonBodyEditor({ container, value, onChange }) {
  const cm = window.CodeMirror(container, {
    value,
    mode: "application/json",
    theme: "apiui",
    lineNumbers: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    lineWrapping: true,
  });
  cm.on("change", () => onChange(cm.getValue()));
  // CodeMirror mede largura/altura de linha no momento da criação; se o
  // container ainda não estiver inserido no documento nesse instante (é o
  // caso aqui — buildBodySection() monta a árvore antes de ser anexada pelo
  // chamador), o layout inicial pode ficar quebrado. Um refresh() após a
  // inserção no DOM corrige isso.
  requestAnimationFrame(() => cm.refresh());
  return {
    getValue: () => cm.getValue(),
    setValue: (v) => cm.setValue(v),
  };
}

export function formatJson(text) {
  // Lança se `text` não for JSON válido; quem chama decide como exibir o erro.
  return JSON.stringify(JSON.parse(text), null, 2);
}
```

Não é preciso destruir/desmontar a instância do CodeMirror explicitamente quando `buildBodySection()` é re-executado (ex.: usuário adiciona uma linha de query param, o que hoje já causa um `renderRequestEditor()` completo) — o CodeMirror 5 não registra listeners fora do próprio nó do editor, então descartar o nó (como o restante do formulário já faz) é suficiente; o valor sobrevive porque fica em `draft.bodyJson`, igual ao padrão já usado por `bodyRaw` com o `<textarea>`.

### 4. `src/request-editor.js`

1. Atualizar o comentário de cabeçalho (linhas 9–13) que documenta o formato de `RequestBody`, incluindo `{ type: "json", content: "..." }`.
2. Importar o novo módulo: `import { createJsonBodyEditor, formatJson } from "./json-body-editor.js";`.
3. `BODY_TYPES`: adicionar `{ value: "json", label: "JSON" }` (após `raw`, antes de `form_urlencoded`, refletindo a ordem do seletor pedida — `none`/`raw`/`json`/`x-www-form-urlencoded`/`form-data`).
4. `createEmptyDraft()`: adicionar `bodyJson: ""`.
5. `normalizeIncomingRequest()`: adicionar `bodyJson: body.type === "json" ? body.content || "" : empty.bodyJson`, seguindo exatamente o padrão de `bodyRaw`.
6. `buildBodySection()`: novo branch `else if (draft.bodyType === "json")` chamando uma nova função `buildJsonBodySection()` (implementada no mesmo arquivo, para reaproveitar `containsVariable` já definido localmente):
   ```js
   function buildJsonBodySection() {
     const wrapper = document.createElement("div");
     wrapper.className = "json-body-editor-wrapper";

     const toolbar = document.createElement("div");
     toolbar.className = "json-body-toolbar";
     const formatBtn = document.createElement("button");
     formatBtn.type = "button";
     formatBtn.className = "json-format-btn";
     formatBtn.textContent = "Formatar JSON";
     toolbar.appendChild(formatBtn);
     wrapper.appendChild(toolbar);

     const errorEl = document.createElement("p");
     errorEl.className = "json-body-error";
     errorEl.hidden = true;
     wrapper.appendChild(errorEl);

     const editorContainer = document.createElement("div");
     editorContainer.className = "json-body-editor";
     wrapper.appendChild(editorContainer);

     wrapper.classList.toggle("has-variable", containsVariable(draft.bodyJson));

     const editor = createJsonBodyEditor({
       container: editorContainer,
       value: draft.bodyJson,
       onChange: (value) => {
         draft.bodyJson = value;
         wrapper.classList.toggle("has-variable", containsVariable(value));
       },
     });

     formatBtn.addEventListener("click", () => {
       try {
         const formatted = formatJson(editor.getValue());
         editor.setValue(formatted);
         draft.bodyJson = formatted;
         errorEl.hidden = true;
       } catch (e) {
         errorEl.textContent = "JSON inválido: " + e.message;
         errorEl.hidden = false;
       }
     });

     return wrapper;
   }
   ```
7. `buildRequestBody()`: novo `case "json": return { type: "json", content: draft.bodyJson };`.

### 5. `src/styles.css`

1. Tema do CodeMirror coerente com a paleta existente (targets nas classes padrão do CodeMirror, sob o seletor de tema `.cm-s-apiui`, convencionado na opção `theme: "apiui"` do passo 3):
   ```css
   .json-body-editor-wrapper {
     margin-top: 0.6rem;
   }

   .json-body-toolbar {
     display: flex;
     justify-content: flex-end;
     margin-bottom: 0.4rem;
   }

   .json-format-btn {
     background-color: var(--color-bg-panel);
     color: var(--color-text);
     border: 1px solid var(--color-border);
     border-radius: 4px;
     padding: 0.3rem 0.6rem;
     font-size: 0.8rem;
     cursor: pointer;
   }
   .json-format-btn:hover {
     border-color: var(--color-accent);
   }

   .json-body-error {
     color: var(--color-danger);
     font-size: 0.85rem;
     margin: -0.2rem 0 0.5rem;
   }

   .json-body-editor {
     border: 1px solid var(--color-border);
     border-radius: 4px;
     overflow: hidden;
   }
   .json-body-editor-wrapper.has-variable .json-body-editor {
     border-color: var(--color-accent);
     background-color: rgba(30, 110, 168, 0.1);
   }

   .json-body-editor .CodeMirror {
     height: auto;
     min-height: 180px;
     max-height: 420px;
     font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
     font-size: 0.85rem;
   }

   .cm-s-apiui.CodeMirror {
     background: var(--color-bg);
     color: var(--color-text);
   }
   .cm-s-apiui .CodeMirror-gutters {
     background: var(--color-bg-panel);
     border-right: 1px solid var(--color-border);
   }
   .cm-s-apiui .CodeMirror-linenumber {
     color: var(--color-text-muted);
   }
   .cm-s-apiui .CodeMirror-cursor {
     border-left: 1px solid var(--color-text);
   }
   .cm-s-apiui .cm-string { color: #ce9178; }
   .cm-s-apiui .cm-number { color: #b5cea8; }
   .cm-s-apiui .cm-atom { color: #569cd6; }
   .cm-s-apiui .cm-property { color: #9cdcfe; }
   .cm-s-apiui .cm-punctuation { color: var(--color-text-muted); }
   .cm-s-apiui .CodeMirror-matchingbracket {
     color: var(--color-accent-hover);
     font-weight: bold;
   }
   ```
   (Paleta de tokens inspirada no esquema padrão do VS Code dark, para ficar familiar sem depender de um tema vendorizado à parte.)
2. `.json-body-editor-wrapper.has-variable` segue o mesmo padrão visual já usado em `.body-raw-textarea.has-variable` (linha 406) e `.kv-input.has-variable` (linha 373) — reaproveitar os mesmos valores de cor.

## Critérios de aceite

- O seletor de tipo de body do editor de requisição mostra a opção `JSON` entre `raw` e `x-www-form-urlencoded`.
- Ao selecionar `JSON`, aparece um editor com números de linha e coloração de sintaxe (strings, números, `true`/`false`/`null` e chaves de propriedade em cores visualmente distintas).
- Digitar e pressionar Enter dentro de um objeto/array aberto mantém indentação coerente automaticamente (2 espaços por nível).
- Colar um JSON "minificado" (uma linha só) e clicar em "Formatar JSON" reformata para indentação de 2 espaços em múltiplas linhas.
- Clicar em "Formatar JSON" com um conteúdo inválido (ex.: vírgula sobrando, aspas não fechadas) mostra uma mensagem de erro abaixo da barra de ferramentas e **não** altera o conteúdo do editor.
- Salvar uma requisição com body `JSON` e recarregar a aplicação (ou trocar de requisição e voltar) preserva o conteúdo exato.
- Editar campos não relacionados ao body (ex.: adicionar um query param) não descarta o conteúdo já digitado no editor JSON.
- Ao enviar uma requisição com body `JSON` sem nenhum header `Content-Type` definido manualmente, a requisição efetivamente enviada tem `Content-Type: application/json` (verificável, por exemplo, apontando a requisição para um serviço de eco como `https://httpbin.org/post` e conferindo os headers recebidos, ou por teste automatizado do lado Rust).
- Se o usuário definir manualmente um header `Content-Type` diferente (ex.: `application/json; charset=utf-8` ou até um valor não relacionado a JSON) junto de um body `JSON`, esse valor manual prevalece — o backend não o sobrescreve.
- Body `raw` continua funcionando exatamente como hoje (textarea simples, sem coloração), sem nenhuma regressão.
- Nenhum acesso à rede/CDN é necessário em tempo de execução para o editor JSON funcionar (todos os arquivos da lib servidos localmente de `src/vendor/codemirror/`).

## Entregáveis

- `package.json` / `package-lock.json` atualizados com a dependência `codemirror`.
- `src/vendor/codemirror/` (novo) com os arquivos vendorizados listados na seção 1.
- `src-tauri/src/http_engine.rs` atualizado (variant `Json`, `apply_body`, injeção automática de `Content-Type`, comentário do módulo).
- `src/json-body-editor.js` (novo).
- `src/request-editor.js`, `src/index.html`, `src/styles.css` atualizados conforme acima.
- Novo tipo de body `json`, com editor formatado e colorido, integrado ao fluxo existente de montar/salvar/enviar requisições.
