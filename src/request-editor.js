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
//   { type: "json", content: "..." }
//
// A exibição da resposta (status, headers, corpo) é responsabilidade da
// atividade 10. Este módulo dispara a requisição e notifica o restante da
// aplicação através de `onRequestStateChange`, informando o estado de
// execução (`running`) e o resultado (`response`/`error`), junto do
// `requestId` da requisição salva que foi enviada (`null` se for um
// rascunho sem requisição selecionada) — usado pelo host (main.js) para
// manter a resposta de cada requisição associada a ela mesma (fase 3).
//
// `loadRequestIntoEditor` (chamado pelo host/main.js ao trocar a seleção na
// sidebar) troca o rascunho pelos dados da requisição salva escolhida; o
// botão "Salvar" persiste o rascunho de volta via `update_request` (fase 3),
// notificando o host através de `onRequestSaved`.
//
// O frontend não usa bundler (JS vanilla servido diretamente por
// `frontendDist`), então em vez de importar o pacote npm `@tauri-apps/api`
// (especificador "bare" que o navegador não resolve sem import map), usamos
// a API global exposta pelo Tauri via `app.withGlobalTauri` (tauri.conf.json).
import { showAlert } from "./modal.js";
import { showCurlImportDialog } from "./curl-import.js";
import { createJsonBodyEditor, formatJson } from "./json-body-editor.js";

function invoke(command, args) {
  return window.__TAURI__.core.invoke(command, args);
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const BODY_TYPES = [
  { value: "none", label: "none" },
  { value: "raw", label: "raw" },
  { value: "json", label: "JSON" },
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
    bodyJson: "",
    bodyFormUrlEncoded: [{ key: "", value: "" }],
    bodyFormData: [{ name: "", value: "", filePath: "" }],
  };
}

let draft = createEmptyDraft();
let running = false;
let saving = false;
let onRequestStateChange = null;
let onRequestSaved = null;

/** Aba atualmente selecionada no tab menu de parâmetros (fase 4). */
let activeParamsTab = "query";

/**
 * Identifica qual requisição salva está carregada no editor no momento
 * (`requestId`/`collectionId`), para permitir persistir as edições de volta
 * via `update_request`. `null` quando o editor está com um rascunho vazio
 * (nenhuma requisição selecionada).
 */
let currentMeta = { collectionId: null, requestId: null, name: null };

/** Permite ao host (main.js) reagir ao início/fim da execução da requisição. */
export function setRequestStateListener(listener) {
  onRequestStateChange = listener;
}

/** Permite ao host (main.js) reagir a um salvamento bem-sucedido (`update_request`). */
export function setRequestSavedListener(listener) {
  onRequestSaved = listener;
}

/**
 * Substitui o rascunho atual pelos dados de uma requisição salva (formato
 * `SavedRequest` do backend), ou limpa o editor se `savedRequest` for
 * null/undefined (ex.: nenhuma requisição selecionada na sidebar).
 * `meta.collectionId` é guardado para permitir salvar de volta depois.
 */
export function loadRequestIntoEditor(savedRequest, meta = {}) {
  if (savedRequest) {
    draft = normalizeIncomingRequest(savedRequest);
    currentMeta = {
      collectionId: meta.collectionId || null,
      requestId: savedRequest.id,
      name: savedRequest.name,
    };
  } else {
    draft = createEmptyDraft();
    currentMeta = { collectionId: meta.collectionId || null, requestId: null, name: null };
  }
  renderRequestEditor();
}

function normalizeIncomingRequest(data) {
  const empty = createEmptyDraft();
  const body = data.body || { type: "none" };
  return {
    method: data.method || empty.method,
    url: data.url || "",
    queryParams: pairsToRowList(data.query_params),
    pathParams: pairsToRowList(data.path_params),
    headers: pairsToRowList(data.headers),
    bodyType: body.type || "none",
    bodyRaw: body.type === "raw" ? body.content || "" : "",
    bodyJson: body.type === "json" ? body.content || "" : empty.bodyJson,
    bodyFormUrlEncoded:
      body.type === "form_urlencoded" ? pairsToRowList(body.fields) : empty.bodyFormUrlEncoded,
    bodyFormData: body.type === "form_data" ? formDataFieldsToRowList(body.fields) : empty.bodyFormData,
  };
}

function pairsToRowList(pairs) {
  if (!pairs || pairs.length === 0) return [{ key: "", value: "" }];
  return pairs.map(([key, value]) => ({ key: key || "", value: value || "" }));
}

function formDataFieldsToRowList(fields) {
  if (!fields || fields.length === 0) return [{ name: "", value: "", filePath: "" }];
  return fields.map((f) => ({ name: f.name || "", value: f.value || "", filePath: f.file_path || "" }));
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

function createRowsSection({ title, description, rows, onAdd, onRemove, onChangeField, fields, showTitle = true }) {
  const section = document.createElement("div");
  section.className = "editor-subsection";

  const header = document.createElement("div");
  header.className = "editor-subsection-header";
  if (!showTitle) header.classList.add("editor-subsection-header--tab");
  if (showTitle) {
    const titleEl = document.createElement("h3");
    titleEl.textContent = title;
    header.appendChild(titleEl);
  }
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

function buildKeyValueSection({ title, description, list, keyPlaceholder, valuePlaceholder, showTitle }) {
  return createRowsSection({
    title,
    description,
    showTitle,
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

/**
 * "raw" e "json" são os dois tipos de body em texto livre — ao trocar entre
 * eles, o texto já digitado deve ser transportado (não perdido), já que na
 * prática representam o mesmo conteúdo em edições diferentes (textarea vs.
 * editor com highlighting). Trocas envolvendo outros tipos não sincronizam.
 */
function syncBodyTextOnTypeChange(oldType, newType) {
  const isFreeText = (t) => t === "raw" || t === "json";
  if (!isFreeText(oldType) || !isFreeText(newType) || oldType === newType) return;
  const text = oldType === "raw" ? draft.bodyRaw : draft.bodyJson;
  if (newType === "raw") {
    draft.bodyRaw = text;
  } else {
    draft.bodyJson = text;
  }
}

function buildBodySection() {
  const section = document.createElement("div");
  section.className = "editor-subsection";

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
    const newType = e.target.value;
    syncBodyTextOnTypeChange(draft.bodyType, newType);
    draft.bodyType = newType;
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
  } else if (draft.bodyType === "json") {
    section.appendChild(buildJsonBodySection());
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
    case "json":
      return { type: "json", content: draft.bodyJson };
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
  // Capturado no início: se o usuário trocar a requisição selecionada
  // enquanto esta ainda está em voo, a resposta deve continuar associada à
  // requisição que foi de fato enviada, não à que estiver selecionada quando
  // a resposta chegar.
  const requestId = currentMeta.requestId;
  notifyStateChange({ running: true, requestId });

  try {
    const request = buildHttpRequestInput();
    const response = await invoke("execute_http_request", { request });
    notifyStateChange({ running: false, response, requestId });
  } catch (error) {
    notifyStateChange({ running: false, error: String(error), requestId });
  } finally {
    running = false;
  }
}

function notifyStateChange(payload) {
  if (typeof onRequestStateChange === "function") {
    onRequestStateChange(payload);
  }
}

function buildSavedRequestPayload() {
  return {
    name: currentMeta.name,
    method: draft.method,
    url: draft.url,
    query_params: rowsToPairs(draft.queryParams),
    path_params: rowsToPairs(draft.pathParams),
    headers: rowsToPairs(draft.headers),
    body: buildRequestBody(),
  };
}

async function handleSaveRequest(button) {
  if (saving || !currentMeta.requestId) return;

  const meta = currentMeta;
  saving = true;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const updated = await invoke("update_request", {
      collectionId: meta.collectionId,
      requestId: meta.requestId,
      request: buildSavedRequestPayload(),
    });

    // Só atualiza o meta ativo se o usuário não trocou de requisição
    // enquanto o salvamento estava em andamento.
    if (currentMeta === meta) {
      currentMeta.name = updated.name;
    }

    if (typeof onRequestSaved === "function") {
      onRequestSaved(updated);
    }

    button.textContent = "Salvo!";
    setTimeout(() => {
      button.textContent = originalText;
    }, 1200);
  } catch (error) {
    button.textContent = originalText;
    await showAlert({ title: "Erro ao salvar requisição", message: String(error) });
  } finally {
    saving = false;
    button.disabled = !currentMeta.requestId;
  }
}

/**
 * Substitui o rascunho atual pelo resultado da importação de um comando
 * curl (fase 5). `currentMeta` não é tocado: se havia uma requisição salva
 * selecionada, ela continua associada ao rascunho importado (o botão
 * "Salvar" segue disponível e grava por cima dela).
 */
async function handleImportCurl() {
  const parsed = await showCurlImportDialog();
  if (!parsed) return;
  draft = normalizeIncomingRequest(parsed);
  renderRequestEditor();
}

/**
 * Menu de importação (fase 5): botão de ação (ícone + rótulo, sem borda,
 * no estilo dos demais itens de action bar) que abre um submenu com as
 * origens suportadas (hoje só "cURL"). Fechado ao escolher uma opção,
 * clicar fora ou pressionar Escape — mesmo padrão de fechamento usado
 * pelos diálogos em modal.js/curl-import.js.
 */
function buildImportMenu() {
  const wrapper = document.createElement("div");
  wrapper.className = "import-menu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "import-menu-trigger";
  trigger.title = "Importar requisição a partir de outro formato";
  trigger.innerHTML =
    '<svg class="import-menu-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<path fill="currentColor" d="M8 1.5a.75.75 0 0 1 .75.75v6.69l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V2.25A.75.75 0 0 1 8 1.5Z"/>' +
    '<path fill="currentColor" d="M2.75 9.5a.75.75 0 0 1 .75.75v2A.75.75 0 0 0 4.25 13h7.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 11.75 14.5h-7.5A2.25 2.25 0 0 1 2 12.25v-2a.75.75 0 0 1 .75-.75Z"/>' +
    "</svg>" +
    '<span>Importar</span>';

  const dropdown = document.createElement("div");
  dropdown.className = "import-menu-dropdown";
  dropdown.hidden = true;

  const curlItem = document.createElement("button");
  curlItem.type = "button";
  curlItem.className = "import-menu-item";
  curlItem.textContent = "cURL";
  curlItem.title = "Importar um comando curl (estilo Linux) para preencher esta requisição";
  curlItem.addEventListener("click", () => {
    closeDropdown();
    handleImportCurl();
  });
  dropdown.appendChild(curlItem);

  function onOutsideClick(event) {
    if (!wrapper.contains(event.target)) closeDropdown();
  }
  function onKeydown(event) {
    if (event.key === "Escape") closeDropdown();
  }
  function closeDropdown() {
    dropdown.hidden = true;
    trigger.classList.remove("open");
    document.removeEventListener("click", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
  }
  function openDropdown() {
    dropdown.hidden = false;
    trigger.classList.add("open");
    document.addEventListener("click", onOutsideClick);
    document.addEventListener("keydown", onKeydown);
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (dropdown.hidden) {
      openDropdown();
    } else {
      closeDropdown();
    }
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);
  return wrapper;
}

/**
 * Monta o menu de importação na action bar global (`#global-action-bar`,
 * fase 5), a barra fininha com separador visível logo abaixo da barra de
 * título — fora do toolbar da requisição atual (método/URL/Salvar/Enviar).
 * Chamado uma única vez pelo host (main.js) no carregamento da página; o
 * menu não depende do `draft` e não precisa ser reconstruído a cada
 * `renderRequestEditor`.
 */
export function mountGlobalActionBar() {
  const bar = document.getElementById("global-action-bar");
  if (!bar) return;
  bar.innerHTML = "";
  bar.appendChild(buildImportMenu());
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

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "save-btn";
  saveBtn.textContent = "Salvar";
  saveBtn.disabled = saving || !currentMeta.requestId;
  saveBtn.title = currentMeta.requestId
    ? "Salvar alterações nesta requisição"
    : "Selecione uma requisição salva na sidebar para habilitar o salvamento";
  saveBtn.addEventListener("click", () => handleSaveRequest(saveBtn));
  toolbar.appendChild(saveBtn);

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "send-btn";
  sendBtn.textContent = running ? "Enviando..." : "Enviar";
  sendBtn.disabled = running;
  sendBtn.addEventListener("click", handleSendRequest);
  toolbar.appendChild(sendBtn);

  return toolbar;
}

function buildParamsTabsSection() {
  const wrapper = document.createElement("div");
  wrapper.className = "editor-tabs";

  const tabButtons = document.createElement("div");
  tabButtons.className = "editor-tab-buttons";

  const tabPanels = document.createElement("div");
  tabPanels.className = "editor-tab-panels";

  const tabs = [
    {
      id: "query",
      label: "Query Params",
      panel: buildKeyValueSection({
        title: "Query Params",
        showTitle: false,
        list: draft.queryParams,
        keyPlaceholder: "chave",
        valuePlaceholder: "valor",
      }),
    },
    {
      id: "path",
      label: "Path Params",
      panel: buildKeyValueSection({
        title: "Path Params",
        showTitle: false,
        description: "Use {nome} na URL para indicar onde o valor será inserido.",
        list: draft.pathParams,
        keyPlaceholder: "nome",
        valuePlaceholder: "valor",
      }),
    },
    {
      id: "headers",
      label: "Headers",
      panel: buildKeyValueSection({
        title: "Headers",
        showTitle: false,
        list: draft.headers,
        keyPlaceholder: "chave",
        valuePlaceholder: "valor",
      }),
    },
    { id: "body", label: "Body", panel: buildBodySection() },
  ];

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "editor-tab-btn";
    btn.textContent = tab.label;
    if (tab.id === activeParamsTab) btn.classList.add("active");
    btn.addEventListener("click", () => {
      activeParamsTab = tab.id;
      tabButtons.querySelectorAll(".editor-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tabPanels.querySelectorAll(".editor-tab-panel").forEach((p) => p.classList.remove("active"));
      tab.panel.classList.add("active");
    });
    tabButtons.appendChild(btn);

    tab.panel.classList.add("editor-tab-panel");
    if (tab.id === activeParamsTab) tab.panel.classList.add("active");
    tabPanels.appendChild(tab.panel);
  });

  wrapper.appendChild(tabButtons);
  wrapper.appendChild(tabPanels);
  return wrapper;
}

export function renderRequestEditor() {
  const container = document.getElementById("request-editor");
  if (!container) return;

  container.innerHTML = "";
  container.classList.add("request-editor-panel");

  const form = document.createElement("div");
  form.className = "request-editor-form";

  form.appendChild(buildToolbar());
  form.appendChild(buildParamsTabsSection());

  container.appendChild(form);
}

export function getRequestDraft() {
  return draft;
}
