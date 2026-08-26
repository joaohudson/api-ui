// Wrapper fino em torno do `window.CodeMirror` global (vendorizado em
// src/vendor/codemirror/, carregado via <script> clássico em index.html),
// isolando a integração da lib do resto do editor de requisição (fase 6).

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
