// Dropdown de ação reutilizável da action bar global (#global-action-bar).
//
// Extrai o padrão antes embutido em `buildImportMenu` (request-editor.js): um
// gatilho (ícone opcional + rótulo, sem borda) que abre um dropdown de itens.
// Fecha ao escolher um item, clicar fora ou pressionar Escape — mesmo padrão
// de fechamento dos diálogos em modal.js/curl-import.js. Sem estado global:
// cada chamada devolve um wrapper independente.

/**
 * Monta um menu de ação da action bar global.
 *
 * @param {object}   opts
 * @param {string}   opts.label      texto do gatilho
 * @param {string}   opts.title      tooltip do gatilho
 * @param {string}  [opts.iconSvg]   HTML de um <svg> inline (usa currentColor)
 * @param {boolean} [opts.disabled]  gatilho desabilitado, sem dropdown
 * @param {Array<{label: string, title?: string, onSelect: () => void}>} opts.items
 * @returns {HTMLElement} o wrapper `.action-menu`
 */
export function buildActionMenu({ label, title, iconSvg = "", disabled = false, items = [] }) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-menu";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "action-menu-trigger";
  trigger.title = title;
  trigger.innerHTML = (iconSvg || "") + `<span>${label}</span>`;

  wrapper.appendChild(trigger);

  if (disabled) {
    trigger.disabled = true;
    return wrapper;
  }

  const dropdown = document.createElement("div");
  dropdown.className = "action-menu-dropdown";
  dropdown.hidden = true;

  for (const item of items) {
    const itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = "action-menu-item";
    itemBtn.textContent = item.label;
    if (item.title) itemBtn.title = item.title;
    itemBtn.addEventListener("click", () => {
      closeDropdown();
      item.onSelect();
    });
    dropdown.appendChild(itemBtn);
  }

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

  wrapper.appendChild(dropdown);
  return wrapper;
}
