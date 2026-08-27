// Área de exibição da resposta da requisição (atividade 10).
//
// Consome as notificações emitidas por `setRequestStateListener`
// (request-editor.js, atividade 9), cujo payload é:
//   { running: true }
//   { running: false, response: HttpResponseOutput }
//   { running: false, error: string }
// `HttpResponseOutput` (contrato definido em src-tauri/src/http_engine.rs)
// tem o formato:
//   { status, headers: [[k,v],...], body: string, duration_ms, error }
// Quando `execute_http_request` não lança (fluxo normal), falhas de
// rede/timeout/URL vêm em `response.error`, com `status === 0`.

const PANEL_ID = "response-panel";

function findHeaderValue(headers, name) {
  const target = name.toLowerCase();
  const match = (headers || []).find(([k]) => k.toLowerCase() === target);
  return match ? match[1] : null;
}

function tryFormatJson(body) {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

function isJsonContentType(contentType) {
  return typeof contentType === "string" && /json/i.test(contentType);
}

function statusClass(status) {
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 300 && status < 400) return "status-redirect";
  if (status >= 400) return "status-error";
  return "status-unknown";
}

function renderEmptyState(container) {
  container.innerHTML = "";
  container.classList.remove("response-panel-content");
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "A resposta da requisição aparecerá aqui após o envio.";
  container.appendChild(empty);
}

function renderLoadingState(container) {
  container.innerHTML = "";
  container.classList.remove("response-panel-content");
  const loading = document.createElement("div");
  loading.className = "empty-state response-loading";
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = "Enviando requisição...";
  loading.appendChild(spinner);
  loading.appendChild(text);
  container.appendChild(loading);
}

function renderErrorState(container, message) {
  container.innerHTML = "";
  container.classList.remove("response-panel-content");
  const errorBox = document.createElement("div");
  errorBox.className = "response-error-box";
  const title = document.createElement("p");
  title.className = "response-error-title";
  title.textContent = "Falha ao executar a requisição";
  const detail = document.createElement("p");
  detail.className = "response-error-detail";
  detail.textContent = message;
  errorBox.appendChild(title);
  errorBox.appendChild(detail);
  container.appendChild(errorBox);
}

function buildMetaBar(response) {
  const meta = document.createElement("div");
  meta.className = "response-meta-bar";

  const statusEl = document.createElement("span");
  statusEl.className = `response-status ${statusClass(response.status)}`;
  statusEl.textContent = `Status: ${response.status}`;
  meta.appendChild(statusEl);

  const timeEl = document.createElement("span");
  timeEl.className = "response-time";
  timeEl.textContent = `Tempo: ${response.duration_ms} ms`;
  meta.appendChild(timeEl);

  return meta;
}

function buildTabs(response) {
  const tabsContainer = document.createElement("div");
  tabsContainer.className = "response-tabs";

  const tabButtons = document.createElement("div");
  tabButtons.className = "response-tab-buttons";

  const tabPanels = document.createElement("div");
  tabPanels.className = "response-tab-panels";

  const bodyPanel = buildBodyPanel(response);
  const headersPanel = buildHeadersPanel(response.headers);

  const tabs = [
    { id: "body", label: "Body", panel: bodyPanel },
    { id: "headers", label: `Headers (${(response.headers || []).length})`, panel: headersPanel },
  ];

  tabs.forEach((tab, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "response-tab-btn";
    btn.textContent = tab.label;
    if (index === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      tabButtons.querySelectorAll(".response-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tabPanels.querySelectorAll(".response-tab-panel").forEach((p) => p.classList.remove("active"));
      tab.panel.classList.add("active");
    });
    tabButtons.appendChild(btn);

    tab.panel.classList.add("response-tab-panel");
    if (index === 0) tab.panel.classList.add("active");
    tabPanels.appendChild(tab.panel);
  });

  tabsContainer.appendChild(tabButtons);
  tabsContainer.appendChild(tabPanels);
  return tabsContainer;
}

function buildBodyPanel(response) {
  const panel = document.createElement("div");

  if (!response.body) {
    const empty = document.createElement("p");
    empty.className = "empty-state response-body-empty";
    empty.textContent = "A resposta não possui corpo.";
    panel.appendChild(empty);
    return panel;
  }

  // Detecta JSON pelo content-type; se não vier declarado (ou vier
  // divergente), tenta parsear o corpo mesmo assim e usa o resultado
  // formatado quando o parse for bem-sucedido.
  const contentType = findHeaderValue(response.headers, "content-type");
  const formattedJson = tryFormatJson(response.body);
  const isJson = isJsonContentType(contentType) || formattedJson !== null;

  const pre = document.createElement("pre");
  pre.className = "response-body";
  pre.textContent = isJson && formattedJson !== null ? formattedJson : response.body;
  panel.appendChild(pre);

  return panel;
}

function buildHeadersPanel(headers) {
  const panel = document.createElement("div");

  if (!headers || headers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state response-body-empty";
    empty.textContent = "Nenhum header retornado.";
    panel.appendChild(empty);
    return panel;
  }

  const table = document.createElement("table");
  table.className = "response-headers-table";

  const tbody = document.createElement("tbody");
  for (const [name, value] of headers) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "response-header-name";
    nameCell.textContent = name;
    const valueCell = document.createElement("td");
    valueCell.className = "response-header-value";
    valueCell.textContent = value;
    row.appendChild(nameCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  panel.appendChild(table);

  return panel;
}

function renderResponseState(container, response) {
  container.innerHTML = "";
  container.classList.add("response-panel-content");

  if (response.error) {
    renderErrorState(container, response.error);
    return;
  }

  container.appendChild(buildMetaBar(response));
  container.appendChild(buildTabs(response));
}

/** Renderiza o painel de resposta a partir de um evento vindo do editor (atividade 9). */
export function handleRequestStateChange(payload) {
  const container = document.getElementById(PANEL_ID);
  if (!container) return;

  if (payload.running) {
    renderLoadingState(container);
    return;
  }

  if (payload.error) {
    renderErrorState(container, payload.error);
    return;
  }

  if (payload.response) {
    renderResponseState(container, payload.response);
    return;
  }

  renderEmptyState(container);
}

/** Restaura o estado inicial (placeholder) do painel de resposta. */
export function renderInitialResponsePanel() {
  const container = document.getElementById(PANEL_ID);
  if (!container) return;
  renderEmptyState(container);
}
