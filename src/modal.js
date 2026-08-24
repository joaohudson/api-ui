// Modal customizado, no mesmo tema visual do restante da aplicação.
// Substitui o uso de window.prompt/window.alert, que não seguem o tema.
//
// Expõe três funções assíncronas que resolvem quando o usuário interage:
// - showPrompt(...): retorna a string digitada, ou null se cancelado.
// - showAlert(...): retorna void; só tem um botão de confirmação.
// - showConfirm(...): retorna true/false; sem campo de texto, com Cancelar.

let overlayEl;
let titleEl;
let messageEl;
let inputEl;
let cancelBtn;
let confirmBtn;
let activeResolve = null;
let previouslyFocused = null;

function getElements() {
  if (overlayEl) {
    return { overlayEl, titleEl, messageEl, inputEl, cancelBtn, confirmBtn };
  }

  overlayEl = document.getElementById("modal-overlay");
  titleEl = document.getElementById("modal-title");
  messageEl = document.getElementById("modal-message");
  inputEl = document.getElementById("modal-input");
  cancelBtn = document.getElementById("modal-cancel-btn");
  confirmBtn = document.getElementById("modal-confirm-btn");

  cancelBtn.addEventListener("click", () => closeModal(null));
  confirmBtn.addEventListener("click", () => {
    closeModal(inputEl.hidden ? true : inputEl.value);
  });
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      closeModal(null);
    }
  });
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      closeModal(inputEl.value);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (overlayEl.style.display === "none" || overlayEl.style.display === "") {
      return;
    }
    if (event.key === "Escape") {
      closeModal(null);
    }
  });

  return { overlayEl, titleEl, messageEl, inputEl, cancelBtn, confirmBtn };
}

function closeModal(result) {
  const els = getElements();
  els.overlayEl.style.display = "none";

  if (previouslyFocused) {
    previouslyFocused.focus();
    previouslyFocused = null;
  }

  if (activeResolve) {
    const resolve = activeResolve;
    activeResolve = null;
    resolve(result);
  }
}

function openModal({ title, message, withInput, inputValue, placeholder, confirmLabel, showCancel }) {
  const els = getElements();

  els.titleEl.textContent = title;
  els.messageEl.textContent = message || "";
  els.messageEl.hidden = !message;

  els.inputEl.hidden = !withInput;
  els.inputEl.value = inputValue || "";
  els.inputEl.placeholder = placeholder || "";

  els.cancelBtn.hidden = !showCancel;
  els.confirmBtn.textContent = confirmLabel;

  previouslyFocused = document.activeElement;
  els.overlayEl.style.display = "flex";

  if (withInput) {
    els.inputEl.focus();
    els.inputEl.select();
  } else {
    els.confirmBtn.focus();
  }

  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}

export function showPrompt({ title, message, placeholder, inputValue, confirmLabel = "Confirmar" }) {
  return openModal({
    title,
    message,
    withInput: true,
    placeholder,
    inputValue,
    confirmLabel,
    showCancel: true,
  });
}

export function showAlert({ title = "Aviso", message }) {
  return openModal({
    title,
    message,
    withInput: false,
    confirmLabel: "OK",
    showCancel: false,
  }).then(() => undefined);
}

export function showConfirm({ title, message, confirmLabel = "Confirmar" }) {
  return openModal({
    title,
    message,
    withInput: false,
    confirmLabel,
    showCancel: true,
  }).then((result) => result === true);
}
