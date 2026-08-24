// Divisores redimensionáveis com o mouse (fase 2).
//
// Cada resizer controla o tamanho de um "target" (via flex-basis inline),
// enquanto o elemento irmão dentro do mesmo container mantém `flex: 1` e
// absorve automaticamente o espaço restante. O tamanho ajustado é
// persistido em localStorage (preferência de UI local ao webview, distinta
// da persistência de dados de domínio feita pelo backend Rust).

const STORAGE_PREFIX = "apiui.layout.";
const HANDLE_THICKNESS = 6;

function readStoredSize(storageKey) {
  const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeStoredSize(storageKey, px) {
  localStorage.setItem(STORAGE_PREFIX + storageKey, String(px));
}

function applySize(target, px) {
  target.style.flex = `0 0 ${px}px`;
}

function clampSize(size, min, siblingMin, containerSize) {
  const max = containerSize - HANDLE_THICKNESS - siblingMin;
  return Math.min(Math.max(size, min), Math.max(max, min));
}

function createResizer({ handle, target, container, axis, min, siblingMin, defaultSize, storageKey }) {
  const isHorizontal = axis === "horizontal";
  const sizeProp = isHorizontal ? "width" : "height";
  const pointerProp = isHorizontal ? "clientX" : "clientY";
  const bodyClass = isHorizontal ? "resizing-col" : "resizing-row";

  const stored = readStoredSize(storageKey);
  applySize(target, stored !== null ? stored : defaultSize);

  let dragging = false;
  let startPointer = 0;
  let startSize = 0;

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startPointer = e[pointerProp];
    startSize = target.getBoundingClientRect()[sizeProp];
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing", bodyClass);
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const delta = e[pointerProp] - startPointer;
    const containerSize = container.getBoundingClientRect()[sizeProp];
    const size = clampSize(startSize + delta, min, siblingMin, containerSize);
    applySize(target, size);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing", bodyClass);
    const finalSize = target.getBoundingClientRect()[sizeProp];
    writeStoredSize(storageKey, Math.round(finalSize));
  }

  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

export function initResizablePanels() {
  const sidebar = document.getElementById("sidebar");
  const appBody = document.getElementById("app-body");
  const sidebarCollectionsSection = document.getElementById("sidebar-collections-section");
  const mainArea = document.getElementById("main-area");
  const requestEditor = document.getElementById("request-editor");

  createResizer({
    handle: document.getElementById("sidebar-resizer"),
    target: sidebar,
    container: appBody,
    axis: "horizontal",
    min: 200,
    siblingMin: 320,
    defaultSize: 280,
    storageKey: "sidebarWidth",
  });

  createResizer({
    handle: document.getElementById("sidebar-sections-resizer"),
    target: sidebarCollectionsSection,
    container: sidebar,
    axis: "vertical",
    min: 80,
    siblingMin: 80,
    defaultSize: 200,
    storageKey: "sidebarCollectionsHeight",
  });

  const defaultEditorHeight = mainArea.getBoundingClientRect().height / 2;

  createResizer({
    handle: document.getElementById("main-resizer"),
    target: requestEditor,
    container: mainArea,
    axis: "vertical",
    min: 120,
    siblingMin: 120,
    defaultSize: defaultEditorHeight,
    storageKey: "requestEditorHeight",
  });
}
