// Ponto de entrada do frontend vanilla.
//
// O shell navegável (sidebar de coleções/requisições) foi construído na
// atividade 8. O editor de requisição (#request-editor) é preenchido pela
// atividade 9 (request-editor.js). A exibição de resposta (#response-panel)
// é preenchida pela atividade 10 (response-panel.js), que se inscreve via
// `setRequestStateListener` para saber quando uma requisição está em
// execução e qual foi o resultado.
//
// Estado local de navegação (em memória, sem persistência real ainda).
// `collections` é uma lista vazia por enquanto: quando a atividade 5
// integrar os comandos Tauri de coleções, ela deve popular este array com
// objetos no formato { id, name, requests: [{ id, name }] }.
import { renderRequestEditor, setRequestStateListener } from "./request-editor.js";
import { handleRequestStateChange, renderInitialResponsePanel } from "./response-panel.js";

const state = {
  collections: [],
  selectedCollectionId: null,
  selectedRequestId: null,
};

function getSelectedCollection() {
  return state.collections.find((c) => c.id === state.selectedCollectionId) || null;
}

function selectCollection(collectionId) {
  state.selectedCollectionId = collectionId;
  state.selectedRequestId = null;
  render();
}

function selectRequest(requestId) {
  state.selectedRequestId = requestId;
  render();
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
    li.textContent = collection.name;
    li.dataset.collectionId = collection.id;
    if (collection.id === state.selectedCollectionId) {
      li.classList.add("active");
    }
    li.addEventListener("click", () => selectCollection(collection.id));
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
    li.textContent = request.name;
    li.dataset.requestId = request.id;
    if (request.id === state.selectedRequestId) {
      li.classList.add("active");
    }
    li.addEventListener("click", () => selectRequest(request.id));
    listEl.appendChild(li);
  }
}

function render() {
  renderCollectionsList();
  renderRequestsList();
}

window.addEventListener("DOMContentLoaded", () => {
  render();
  renderRequestEditor();
  renderInitialResponsePanel();
  setRequestStateListener(handleRequestStateChange);
  console.log("API Client iniciado.");
});
