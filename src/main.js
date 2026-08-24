// Ponto de entrada do frontend vanilla.
//
// O shell navegável (sidebar de coleções/requisições) foi construído na
// atividade 8. O editor de requisição (#request-editor) é preenchido pela
// atividade 9 (request-editor.js). A exibição de resposta (#response-panel)
// é preenchida pela atividade 10 (response-panel.js); este módulo se
// inscreve via `setRequestStateListener` para saber quando uma requisição
// está em execução e qual foi o resultado, mantendo um cache por requisição
// (`responseCache`) para que o painel sempre mostre a resposta da
// requisição selecionada, e não a da última enviada (fase 3).
//
// Estado local de navegação. `collections` é carregado a partir dos
// comandos Tauri de coleções (`list_collections`/`create_collection`) e
// populado com objetos no formato { id, name, requests: [{ id, name }] }.
import {
  renderRequestEditor,
  setRequestStateListener,
  loadRequestIntoEditor,
  setRequestSavedListener,
  mountGlobalActionBar,
} from "./request-editor.js";
import { handleRequestStateChange, renderInitialResponsePanel } from "./response-panel.js";
import { initResizablePanels } from "./resizable-panels.js";
import { showPrompt, showAlert, showConfirm } from "./modal.js";

function invoke(command, args) {
  return window.__TAURI__.core.invoke(command, args);
}

const state = {
  collections: [],
  selectedCollectionId: null,
  selectedRequestId: null,
};

/**
 * Último estado de execução (running/response/error) de cada requisição,
 * indexado por `requestId` (`null` = rascunho sem requisição salva
 * selecionada). Existe só em memória, não é persistido — serve para o
 * painel de resposta acompanhar a requisição selecionada em vez de mostrar
 * a resposta da última requisição enviada, seja qual for a selecionada.
 */
const responseCache = new Map();

function getSelectedCollection() {
  return state.collections.find((c) => c.id === state.selectedCollectionId) || null;
}

function getSelectedRequest() {
  const collection = getSelectedCollection();
  if (!collection) return null;
  return (collection.requests || []).find((r) => r.id === state.selectedRequestId) || null;
}

/**
 * Carrega no editor a requisição atualmente selecionada (ou limpa o editor,
 * se nenhuma estiver) e restaura, no painel de resposta, o último resultado
 * de execução dessa mesma requisição (ou o estado vazio, se ela nunca foi
 * enviada nesta sessão).
 */
function syncEditorWithSelection() {
  loadRequestIntoEditor(getSelectedRequest(), { collectionId: state.selectedCollectionId });
  handleRequestStateChange(responseCache.get(state.selectedRequestId) || {});
}

/**
 * Recebe as notificações de execução do editor (`{ running, response, error,
 * requestId }`), guarda no cache por requisição e só repassa ao painel de
 * resposta se a requisição notificada ainda for a selecionada no momento —
 * evita que a resposta de uma requisição enviada e depois trocada "vaze"
 * para o painel de outra requisição selecionada em seguida.
 */
function handleEditorStateChange(payload) {
  const { requestId, ...rest } = payload;
  responseCache.set(requestId, rest);
  if (requestId === state.selectedRequestId) {
    handleRequestStateChange(rest);
  }
}

function selectCollection(collectionId) {
  state.selectedCollectionId = collectionId;
  state.selectedRequestId = null;
  render();
  syncEditorWithSelection();
}

function selectRequest(requestId) {
  state.selectedRequestId = requestId;
  render();
  syncEditorWithSelection();
}

function renderCollectionsList() {
  const listEl = document.getElementById("collections-list");
  const emptyStateEl = document.getElementById("collections-empty-state");

  listEl.innerHTML = "";

  if (state.collections.length === 0) {
    emptyStateEl.style.display = "block";
    listEl.style.display = "none";
    return;
  }

  emptyStateEl.style.display = "none";
  listEl.style.display = "block";

  for (const collection of state.collections) {
    const li = document.createElement("li");
    li.dataset.collectionId = collection.id;
    if (collection.id === state.selectedCollectionId) {
      li.classList.add("active");
    }
    li.addEventListener("click", () => selectCollection(collection.id));

    const nameEl = document.createElement("span");
    nameEl.className = "list-item-name";
    nameEl.textContent = collection.name;
    li.appendChild(nameEl);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "list-item-delete-btn";
    deleteBtn.title = "Excluir coleção";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCollection(collection.id, collection.name);
    });
    li.appendChild(deleteBtn);

    listEl.appendChild(li);
  }
}

function renderRequestsList() {
  const listEl = document.getElementById("requests-list");
  const emptyStateEl = document.getElementById("requests-empty-state");
  const newRequestBtn = document.getElementById("new-request-btn");

  const collection = getSelectedCollection();
  listEl.innerHTML = "";

  if (!collection) {
    emptyStateEl.textContent = "Selecione uma coleção para ver suas requisições.";
    emptyStateEl.style.display = "block";
    listEl.style.display = "none";
    newRequestBtn.disabled = true;
    return;
  }

  newRequestBtn.disabled = false;

  if (!collection.requests || collection.requests.length === 0) {
    emptyStateEl.textContent = "Nenhuma requisição nesta coleção ainda.";
    emptyStateEl.style.display = "block";
    listEl.style.display = "none";
    return;
  }

  emptyStateEl.style.display = "none";
  listEl.style.display = "block";

  for (const request of collection.requests) {
    const li = document.createElement("li");
    li.dataset.requestId = request.id;
    if (request.id === state.selectedRequestId) {
      li.classList.add("active");
    }
    li.addEventListener("click", () => selectRequest(request.id));

    const nameEl = document.createElement("span");
    nameEl.className = "list-item-name";
    nameEl.textContent = request.name;
    li.appendChild(nameEl);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "list-item-delete-btn";
    deleteBtn.title = "Excluir requisição";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteRequest(collection.id, request.id, request.name);
    });
    li.appendChild(deleteBtn);

    listEl.appendChild(li);
  }
}

function render() {
  renderCollectionsList();
  renderRequestsList();
}

async function loadCollections() {
  try {
    state.collections = await invoke("list_collections");
    render();
  } catch (error) {
    await showAlert({ title: "Erro ao carregar coleções", message: String(error) });
  }
}

async function createCollection() {
  const name = await showPrompt({
    title: "Nova coleção",
    message: "Informe o nome da nova coleção.",
    placeholder: "Nome da coleção",
    confirmLabel: "Criar",
  });

  if (name === null) {
    return;
  }

  const trimmedName = name.trim();
  if (trimmedName === "") {
    return;
  }

  try {
    const collection = await invoke("create_collection", { name: trimmedName });
    state.collections.push(collection);
    state.selectedCollectionId = collection.id;
    state.selectedRequestId = null;
    render();
    syncEditorWithSelection();
  } catch (error) {
    await showAlert({ title: "Erro ao criar coleção", message: String(error) });
  }
}

async function deleteCollection(collectionId, collectionName) {
  const confirmed = await showConfirm({
    title: "Excluir coleção",
    message: `Tem certeza que deseja excluir a coleção "${collectionName}"? Todas as requisições salvas nela também serão removidas.`,
    confirmLabel: "Excluir",
  });

  if (!confirmed) {
    return;
  }

  try {
    await invoke("delete_collection", { id: collectionId });
    state.collections = state.collections.filter((c) => c.id !== collectionId);
    if (state.selectedCollectionId === collectionId) {
      state.selectedCollectionId = null;
      state.selectedRequestId = null;
    }
    render();
    syncEditorWithSelection();
  } catch (error) {
    await showAlert({ title: "Erro ao excluir coleção", message: String(error) });
  }
}

async function createRequest() {
  const collection = getSelectedCollection();
  if (!collection) {
    return;
  }

  const name = await showPrompt({
    title: "Nova requisição",
    message: "Informe o nome da nova requisição.",
    placeholder: "Nome da requisição",
    confirmLabel: "Criar",
  });

  if (name === null) {
    return;
  }

  const trimmedName = name.trim();
  if (trimmedName === "") {
    return;
  }

  try {
    const request = await invoke("create_request", {
      collectionId: collection.id,
      request: {
        name: trimmedName,
        method: "GET",
        url: "",
        query_params: [],
        path_params: [],
        headers: [],
        body: { type: "none" },
      },
    });
    collection.requests = collection.requests || [];
    collection.requests.push(request);
    state.selectedRequestId = request.id;
    render();
    syncEditorWithSelection();
  } catch (error) {
    await showAlert({ title: "Erro ao criar requisição", message: String(error) });
  }
}

async function deleteRequest(collectionId, requestId, requestName) {
  const confirmed = await showConfirm({
    title: "Excluir requisição",
    message: `Tem certeza que deseja excluir a requisição "${requestName}"?`,
    confirmLabel: "Excluir",
  });

  if (!confirmed) {
    return;
  }

  try {
    await invoke("delete_request", { collectionId, requestId });
    const collection = state.collections.find((c) => c.id === collectionId);
    if (collection) {
      collection.requests = (collection.requests || []).filter((r) => r.id !== requestId);
    }
    if (state.selectedRequestId === requestId) {
      state.selectedRequestId = null;
    }
    responseCache.delete(requestId);
    render();
    syncEditorWithSelection();
  } catch (error) {
    await showAlert({ title: "Erro ao excluir requisição", message: String(error) });
  }
}

/** Mantém a cópia em memória da requisição sincronizada após um salvamento no editor. */
function handleRequestSaved(updatedRequest) {
  const collection = getSelectedCollection();
  if (!collection) return;
  collection.requests = (collection.requests || []).map((r) =>
    r.id === updatedRequest.id ? updatedRequest : r
  );
}

window.addEventListener("DOMContentLoaded", () => {
  render();
  renderRequestEditor();
  mountGlobalActionBar();
  renderInitialResponsePanel();
  setRequestStateListener(handleEditorStateChange);
  setRequestSavedListener(handleRequestSaved);
  initResizablePanels();
  document.getElementById("new-collection-btn").addEventListener("click", createCollection);
  document.getElementById("new-request-btn").addEventListener("click", createRequest);
  loadCollections().then(syncEditorWithSelection);
  console.log("API UI iniciado.");
});
