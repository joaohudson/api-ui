// Editor de requisição (atividade 9).
//
// Constrói o formulário de montagem de requisição dentro de #request-editor
// e, ao enviar, invoca o comando Tauri `execute_http_request` (atividade 3),
// que delega ao motor HTTP (atividade 2). O contrato de dados esperado pelo
// backend está definido em src-tauri/src/http_engine.rs (`HttpRequestInput`):
//   { method, url, query_params: [[k,v],...], path_params: [[k,v],...],
//     headers: [[k,v],...], body: RequestBody, timeout_ms }
// `RequestBody` é um enum com tag "type" (snake_case):
//   { type: "none" }
//   { type: "raw", content: "..." }
//   { type: "form_urlencoded", fields: [[k,v],...] }
//   { type: "form_data", fields: [{ name, value, file_path }] }
//
// A exibição da resposta (status, headers, corpo) é responsabilidade da
// atividade 10. Este módulo apenas dispara a requisição e notifica o
// restante da aplicação através de `onRequestStateChange`, informando o
// estado de execução (`running`) e o resultado (`response`/`error`).
//
// O frontend não usa bundler (JS vanilla servido diretamente por
// `frontendDist`), então em vez de importar o pacote npm `@tauri-apps/api`
// (especificador "bare" que o navegador não resolve sem import map), usamos
// a API global exposta pelo Tauri via `app.withGlobalTauri` (tauri.conf.json).
function invoke(command, args) {
  return window.__TAURI__.core.invoke(command, args);
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const BODY_TYPES = [
  { value: "none", label: "none" },
  { value: "raw", label: "raw" },
  { value: "form_urlencoded", label: "x-www-form-urlencoded" },
  { value: "form_data", label: "form-data" },
];

const VARIABLE_PATTERN = /\{\{\s*[^{}]+\s*\}\}/;

/**
 * Estado em memória do editor (rascunho da requisição atualmente aberta).
 * `onChange`, quando definido pelo host (main.js), é chamado a cada
 * alteração relevante do rascunho (útil para futura persistência).
 */
function createEmptyDraft() {
  return {
    method: "GET",
    url: "",
    queryParams: [{ key: "", value: "" }],
    pathParams: [{ key: "", value: "" }],
    headers: [{ key: "", value: "" }],
    bodyType: "none",
    bodyRaw: "",
    bodyFormUrlEncoded: [{ key: "", value: "" }],
    bodyFormData: [{ name: "", value: "", filePath: "" }],
  };
}

let draft = createEmptyDraft();
let running = false;
let onRequestStateChange = null;

/** Permite ao host (main.js) reagir ao início/fim da execução da requisição. */
export function setRequestStateListener(listener) {
  onRequestStateChange = listener;
}

/** Substitui o rascunho atual (ex.: ao selecionar uma requisição salva). */
export function loadRequestIntoEditor(requestData) {
  draft = requestData ? normalizeIncomingRequest(requestData) : createEmptyDraft();
  renderRequestEditor();
}

function normalizeIncomingRequest(data) {
  const empty = createEmptyDraft();
  return {
    method: data.method || empty.method,
    url: data.url || "",
    queryParams: toRowList(data.queryParams),
    pathParams: toRowList(data.pathParams),
    headers: toRowList(data.headers),
    bodyType: data.bodyType || "none",
    bodyRaw: data.bodyRaw || "",
    bodyFormUrlEncoded: toRowList(data.bodyFormUrlEncoded),
    bodyFormData: toFormDataRowList(data.bodyFormData),
  };
}

function toRowList(rows) {
  if (!rows || rows.length === 0) return [{ key: "", value: "" }];
  return rows.map((r) => ({ key: r.key || "", value: r.value || "" }));
}

function toFormDataRowList(rows) {
  if (!rows || rows.length === 0) return [{ name: "", value: "", filePath: "" }];
  return rows.map((r) => ({ name: r.name || "", value: r.value || "", filePath: r.filePath || "" }));
}

function containsVariable(text) {
  return typeof text === "string" && VARIABLE_PATTERN.test(text);
}

/** Aplica/remove a classe visual que sinaliza uso de `{{variavel}}` no campo. */
function applyVariableIndicator(inputEl) {
  const update = () => {
    inputEl.classList.toggle("has-variable", containsVariable(inputEl.value));
  };
  update();
  inputEl.addEventListener("input", update);
}

function createRowsSection({ title, description, rows, onAdd, onRemove, onChangeField, fields }) {
  const section = document.createElement("div");
  section.className = "editor-subsection";

  const header = document.createElement("div");
  header.className = "editor-subsection-header";
  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  header.appendChild(titleEl);
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "icon-btn";
  addBtn.textContent = "+";
  addBtn.title = `Adicionar ${title.toLowerCase()}`;
  addBtn.addEventListener("click", onAdd);
  header.appendChild(addBtn);
  section.appendChild(header);

  if (description) {
    const desc = document.createElement("p");
    desc.className = "editor-subsection-description";
    desc.textContent = description;
    section.appendChild(desc);
  }

  const rowsContainer = document.createElement("div");
  rowsContainer.className = "kv-rows";

  rows.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kv-row";

    for (const field of fields) {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = field.placeholder;
      input.value = row[field.name] || "";
      input.className = "kv-input";
      input.addEventListener("input", (e) => {
        onChangeField(index, field.name, e.target.value);
      });
      if (field.trackVariable) {
        applyVariableIndicator(input);
      }
      rowEl.appendChild(input);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn kv-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "Remover linha";
    removeBtn.disabled = rows.length === 1;
    removeBtn.addEventListener("click", () => onRemove(index));
    rowEl.appendChild(removeBtn);

    rowsContainer.appendChild(rowEl);
  });

  section.appendChild(rowsContainer);
  return section;
}

function buildKeyValueSection({ title, description, list, keyPlaceholder, valuePlaceholder }) {
  return createRowsSection({
    title,
    description,
    rows: list,
    fields: [
      { name: "key", placeholder: keyPlaceholder, trackVariable: true },
      { name: "value", placeholder: valuePlaceholder, trackVariable: true },
    ],
    onAdd: () => {
      list.push({ key: "", value: "" });
      renderRequestEditor();
    },
    onRemove: (index) => {
      if (list.length === 1) return;
      list.splice(index, 1);
      renderRequestEditor();
    },
    onChangeField: (index, field, value) => {
      list[index][field] = value;
    },
  });
}

function buildFormDataSection() {
  return createRowsSection({
    title: "Form Data",
    description: "Deixe \"Caminho do arquivo\" vazio para enviar como texto.",
    rows: draft.bodyFormData,
    fields: [
      { name: "name", placeholder: "nome do campo", trackVariable: true },
      { name: "value", placeholder: "valor (texto)", trackVariable: true },
      { name: "filePath", placeholder: "caminho do arquivo (opcional)", trackVariable: false },
    ],
    onAdd: () => {
      draft.bodyFormData.push({ name: "", value: "", filePath: "" });
      renderRequestEditor();
    },
    onRemove: (index) => {
      if (draft.bodyFormData.length === 1) return;
      draft.bodyFormData.splice(index, 1);
      renderRequestEditor();
    },
    onChangeField: (index, field, value) => {
      draft.bodyFormData[index][field] = value;
    },
  });
}

function buildBodySection() {
  const section = document.createElement("div");
  section.className = "editor-subsection";

  const header = document.createElement("div");
  header.className = "editor-subsection-header";
  const titleEl = document.createElement("h3");
  titleEl.textContent = "Body";
  header.appendChild(titleEl);
  section.appendChild(header);

  const select = document.createElement("select");
  select.className = "body-type-select";
  for (const type of BODY_TYPES) {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.label;
    if (type.value === draft.bodyType) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", (e) => {
    draft.bodyType = e.target.value;
    renderRequestEditor();
  });
  section.appendChild(select);

  if (draft.bodyType === "none") {
    const info = document.createElement("p");
    info.className = "editor-subsection-description";
    info.textContent = "Esta requisição não enviará corpo.";
    section.appendChild(info);
  } else if (draft.bodyType === "raw") {
    const textarea = document.createElement("textarea");
    textarea.className = "body-raw-textarea";
    textarea.rows = 8;
    textarea.placeholder = "Texto plano ou JSON";
    textarea.value = draft.bodyRaw;
    textarea.addEventListener("input", (e) => {
      draft.bodyRaw = e.target.value;
      textarea.classList.toggle("has-variable", containsVariable(textarea.value));
    });
    textarea.classList.toggle("has-variable", containsVariable(textarea.value));
    section.appendChild(textarea);
  } else if (draft.bodyType === "form_urlencoded") {
    section.appendChild(
      buildKeyValueSection({
        title: "Campos",
        list: draft.bodyFormUrlEncoded,
        keyPlaceholder: "chave",
        valuePlaceholder: "valor",
      })
    );
  } else if (draft.bodyType === "form_data") {
    section.appendChild(buildFormDataSection());
  }

  return section;
}

function rowsToPairs(rows) {
  return rows
    .filter((r) => r.key.trim() !== "")
    .map((r) => [r.key, r.value]);
}

function buildRequestBody() {
  switch (draft.bodyType) {
    case "raw":
      return { type: "raw", content: draft.bodyRaw };
    case "form_urlencoded":
      return { type: "form_urlencoded", fields: rowsToPairs(draft.bodyFormUrlEncoded) };
    case "form_data":
      return {
        type: "form_data",
        fields: draft.bodyFormData
          .filter((f) => f.name.trim() !== "")
          .map((f) => ({
            name: f.name,
            value: f.value,
            file_path: f.filePath.trim() === "" ? null : f.filePath,
          })),
      };
    case "none":
    default:
      return { type: "none" };
  }
}

function buildHttpRequestInput() {
  return {
    method: draft.method,
    url: draft.url,
    query_params: rowsToPairs(draft.queryParams),
    path_params: rowsToPairs(draft.pathParams),
    headers: rowsToPairs(draft.headers),
    body: buildRequestBody(),
    timeout_ms: null,
  };
}

async function handleSendRequest() {
  if (running) return;
  running = true;
  notifyStateChange({ running: true });

  try {
    const request = buildHttpRequestInput();
    const response = await invoke("execute_http_request", { request });
    notifyStateChange({ running: false, response });
  } catch (error) {
    notifyStateChange({ running: false, error: String(error) });
  } finally {
    running = false;
  }
}

function notifyStateChange(payload) {
  if (typeof onRequestStateChange === "function") {
    onRequestStateChange(payload);
  }
}

function buildToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";

  const methodSelect = document.createElement("select");
  methodSelect.className = "method-select";
  for (const method of HTTP_METHODS) {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    if (method === draft.method) option.selected = true;
    methodSelect.appendChild(option);
  }
  methodSelect.addEventListener("change", (e) => {
    draft.method = e.target.value;
  });
  toolbar.appendChild(methodSelect);

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "url-input";
  urlInput.placeholder = "https://api.exemplo.com/users/{id}";
  urlInput.value = draft.url;
  urlInput.addEventListener("input", (e) => {
    draft.url = e.target.value;
  });
  applyVariableIndicator(urlInput);
  toolbar.appendChild(urlInput);

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "send-btn";
  sendBtn.textContent = running ? "Enviando..." : "Enviar";
  sendBtn.disabled = running;
  sendBtn.addEventListener("click", handleSendRequest);
  toolbar.appendChild(sendBtn);

  return toolbar;
}

export function renderRequestEditor() {
  const container = document.getElementById("request-editor");
  if (!container) return;

  container.innerHTML = "";
  container.classList.add("request-editor-panel");

  const form = document.createElement("div");
  form.className = "request-editor-form";

  form.appendChild(buildToolbar());

  form.appendChild(
    buildKeyValueSection({
      title: "Query Params",
      list: draft.queryParams,
      keyPlaceholder: "chave",
      valuePlaceholder: "valor",
    })
  );

  form.appendChild(
    buildKeyValueSection({
      title: "Path Params",
      description: "Use {nome} na URL para indicar onde o valor será inserido.",
      list: draft.pathParams,
      keyPlaceholder: "nome",
      valuePlaceholder: "valor",
    })
  );

  form.appendChild(
    buildKeyValueSection({
      title: "Headers",
      list: draft.headers,
      keyPlaceholder: "chave",
      valuePlaceholder: "valor",
    })
  );

  form.appendChild(buildBodySection());

  container.appendChild(form);
}

export function getRequestDraft() {
  return draft;
}
