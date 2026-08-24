// Importação de comando curl (fase 5), estilo Linux/bash.
//
// Duas responsabilidades neste módulo: o parser (puro, sem DOM) e o diálogo
// (DOM) que coleta o texto colado pelo usuário e mostra erros de parse sem
// fechar o diálogo. O resultado de `parseCurlCommand` usa o mesmo formato
// `SavedRequest`-like já consumido por `normalizeIncomingRequest` em
// request-editor.js: { method, url, query_params: [[k,v],...],
// headers: [[k,v],...], body: RequestBody }.
//
// Ver .claude/fases/fase-5/PLAN.md para a especificação completa do
// comportamento esperado (flags suportadas, precedência, fora de escopo).

const SUPPORTED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const KNOWN_FLAGS = {
  "-X": { arity: 1, kind: "method" },
  "--request": { arity: 1, kind: "method" },
  "-H": { arity: 1, kind: "header" },
  "--header": { arity: 1, kind: "header" },
  "-d": { arity: 1, kind: "data" },
  "--data": { arity: 1, kind: "data" },
  "--data-ascii": { arity: 1, kind: "data" },
  "--data-raw": { arity: 1, kind: "data" },
  "--data-binary": { arity: 1, kind: "data" },
  "--data-urlencode": { arity: 1, kind: "data-urlencode" },
  "-F": { arity: 1, kind: "form" },
  "--form": { arity: 1, kind: "form" },
  "-G": { arity: 0, kind: "get" },
  "--get": { arity: 0, kind: "get" },
  "-u": { arity: 1, kind: "user" },
  "--user": { arity: 1, kind: "user" },
  "-A": { arity: 1, kind: "user-agent" },
  "--user-agent": { arity: 1, kind: "user-agent" },
  "-e": { arity: 1, kind: "referer" },
  "--referer": { arity: 1, kind: "referer" },
  "-b": { arity: 1, kind: "cookie" },
  "--cookie": { arity: 1, kind: "cookie" },
  "--url": { arity: 1, kind: "url" },
  "-k": { arity: 0, kind: "ignored" },
  "--insecure": { arity: 0, kind: "ignored" },
  "-s": { arity: 0, kind: "ignored" },
  "--silent": { arity: 0, kind: "ignored" },
  "-S": { arity: 0, kind: "ignored" },
  "--show-error": { arity: 0, kind: "ignored" },
  "-v": { arity: 0, kind: "ignored" },
  "--verbose": { arity: 0, kind: "ignored" },
  "-i": { arity: 0, kind: "ignored" },
  "--include": { arity: 0, kind: "ignored" },
  "-L": { arity: 0, kind: "ignored" },
  "--location": { arity: 0, kind: "ignored" },
  "--compressed": { arity: 0, kind: "ignored" },
  "-o": { arity: 1, kind: "ignored" },
  "--output": { arity: 1, kind: "ignored" },
  "-w": { arity: 1, kind: "ignored" },
  "--write-out": { arity: 1, kind: "ignored" },
  "--http1.1": { arity: 0, kind: "ignored" },
  "--http1.0": { arity: 0, kind: "ignored" },
  "--http2": { arity: 0, kind: "ignored" },
  "--http3": { arity: 0, kind: "ignored" },
  "-x": { arity: 1, kind: "ignored" },
  "--proxy": { arity: 1, kind: "ignored" },
  "--connect-timeout": { arity: 1, kind: "ignored" },
  "--max-time": { arity: 1, kind: "ignored" },
  "--resolve": { arity: 1, kind: "ignored" },
  "--cacert": { arity: 1, kind: "ignored" },
  "--cert": { arity: 1, kind: "ignored" },
  "--key": { arity: 1, kind: "ignored" },
  "-c": { arity: 1, kind: "ignored" },
  "--cookie-jar": { arity: 1, kind: "ignored" },
  "-T": { arity: 1, kind: "ignored" },
  "--upload-file": { arity: 1, kind: "ignored" },
};

/**
 * Tokeniza um comando shell estilo bash/POSIX: continuações de linha com
 * `\` no fim da linha, aspas simples (literais) e duplas (com escapes
 * limitados a `\"`, `\\`, `\$`, `` \` ``), e `\` fora de aspas escapando o
 * próximo caractere. Não expande `$VAR`/`` `cmd` ``/`{{variavel}}` — tudo
 * isso é preservado literalmente no texto do token.
 */
function tokenizeShellCommand(input) {
  const normalized = input.replace(/\\\r?\n[ \t]*/g, " ").replace(/\r/g, "");

  const tokens = [];
  let current = "";
  let hasCurrent = false;
  let mode = "none"; // "none" | "single" | "double"

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (mode === "single") {
      if (ch === "'") {
        mode = "none";
      } else {
        current += ch;
      }
      continue;
    }

    if (mode === "double") {
      if (ch === '"') {
        mode = "none";
      } else if (ch === "\\" && i + 1 < normalized.length && "\"\\$`".includes(normalized[i + 1])) {
        current += normalized[i + 1];
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    // mode === "none"
    if (ch === " " || ch === "\t") {
      if (hasCurrent) {
        tokens.push(current);
        current = "";
        hasCurrent = false;
      }
      continue;
    }
    if (ch === "'") {
      mode = "single";
      hasCurrent = true;
      continue;
    }
    if (ch === '"') {
      mode = "double";
      hasCurrent = true;
      continue;
    }
    if (ch === "\\" && i + 1 < normalized.length) {
      current += normalized[i + 1];
      hasCurrent = true;
      i++;
      continue;
    }
    current += ch;
    hasCurrent = true;
  }

  if (mode !== "none") {
    throw new Error("Comando com aspas não fechadas.");
  }
  if (hasCurrent) {
    tokens.push(current);
  }

  return tokens;
}

function splitQueryString(queryString) {
  if (!queryString) return [];
  return queryString
    .split("&")
    .filter((part) => part !== "")
    .map((part) => {
      const eqIndex = part.indexOf("=");
      const rawKey = eqIndex === -1 ? part : part.slice(0, eqIndex);
      const rawValue = eqIndex === -1 ? "" : part.slice(eqIndex + 1);
      return [decodeQueryComponent(rawKey), decodeQueryComponent(rawValue)];
    });
}

function decodeQueryComponent(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/** Interpreta o texto colado pelo usuário e retorna `{method, url, query_params, headers, body}`. */
export function parseCurlCommand(rawInput) {
  let tokens = tokenizeShellCommand(rawInput.trim());

  if (tokens[0] === "$") {
    tokens = tokens.slice(1);
  }

  if (tokens[0] !== "curl") {
    throw new Error('O comando precisa começar com "curl".');
  }

  let method = null;
  const headers = [];
  const dataParts = [];
  const formFields = [];
  let explicitUrl = null;
  let positionalUrl = null;
  let useGet = false;
  let userAuth = null;
  let userAgent = null;
  let referer = null;
  let cookie = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.startsWith("-") && token !== "-") {
      const flag = KNOWN_FLAGS[token] || { arity: 0, kind: "ignored" };
      let value = null;
      if (flag.arity === 1) {
        if (i + 1 >= tokens.length) {
          throw new Error(`A opção "${token}" espera um valor, mas nenhum foi encontrado.`);
        }
        value = tokens[i + 1];
        i++;
      }

      switch (flag.kind) {
        case "method":
          method = value.toUpperCase();
          break;
        case "header": {
          const colonIndex = value.indexOf(":");
          if (colonIndex === -1) {
            headers.push([value.trim(), ""]);
          } else {
            headers.push([value.slice(0, colonIndex).trim(), value.slice(colonIndex + 1).trim()]);
          }
          break;
        }
        case "data":
          dataParts.push(value);
          break;
        case "data-urlencode": {
          const match = value.match(/^([^=]+)=(.*)$/);
          if (match) {
            dataParts.push(`${match[1]}=${encodeURIComponent(match[2])}`);
          } else {
            dataParts.push(encodeURIComponent(value));
          }
          break;
        }
        case "form": {
          let fieldValue = value;
          const typeIndex = fieldValue.indexOf(";type=");
          if (typeIndex !== -1) {
            fieldValue = fieldValue.slice(0, typeIndex);
          }
          const eqIndex = fieldValue.indexOf("=");
          const name = eqIndex === -1 ? fieldValue : fieldValue.slice(0, eqIndex);
          const rest = eqIndex === -1 ? "" : fieldValue.slice(eqIndex + 1);
          if (rest.startsWith("@")) {
            formFields.push({ name, value: "", file_path: rest.slice(1) });
          } else {
            formFields.push({ name, value: rest, file_path: null });
          }
          break;
        }
        case "get":
          useGet = true;
          break;
        case "user":
          userAuth = value;
          break;
        case "user-agent":
          userAgent = value;
          break;
        case "referer":
          referer = value;
          break;
        case "cookie":
          if (value.includes("=")) {
            cookie = value;
          }
          break;
        case "url":
          explicitUrl = value;
          break;
        case "ignored":
        default:
          break;
      }
      continue;
    }

    if (positionalUrl === null) {
      positionalUrl = token;
    }
  }

  const fullUrl = explicitUrl || positionalUrl;
  if (!fullUrl) {
    throw new Error("Não foi possível encontrar a URL no comando.");
  }

  const questionIndex = fullUrl.indexOf("?");
  const baseUrl = questionIndex === -1 ? fullUrl : fullUrl.slice(0, questionIndex);
  const queryString = questionIndex === -1 ? "" : fullUrl.slice(questionIndex + 1);
  const queryParams = splitQueryString(queryString);

  let body;
  if (formFields.length > 0) {
    body = { type: "form_data", fields: formFields };
  } else if (dataParts.length > 0 && !useGet) {
    body = { type: "raw", content: dataParts.join("&") };
  } else {
    body = { type: "none" };
  }

  if (useGet && dataParts.length > 0) {
    for (const part of splitQueryString(dataParts.join("&"))) {
      queryParams.push(part);
    }
  }

  let resolvedMethod;
  if (method) {
    if (!SUPPORTED_METHODS.includes(method)) {
      throw new Error(
        `Método "${method}" não é suportado. Métodos aceitos: ${SUPPORTED_METHODS.join(", ")}.`
      );
    }
    resolvedMethod = method;
  } else if (formFields.length > 0 || (dataParts.length > 0 && !useGet)) {
    resolvedMethod = "POST";
  } else {
    resolvedMethod = "GET";
  }

  const finalHeaders = [...headers];
  const hasHeader = (name) => finalHeaders.some(([k]) => k.toLowerCase() === name.toLowerCase());

  if (body.type === "raw" && !hasHeader("Content-Type")) {
    finalHeaders.push(["Content-Type", "application/x-www-form-urlencoded"]);
  }
  if (userAgent && !hasHeader("User-Agent")) {
    finalHeaders.push(["User-Agent", userAgent]);
  }
  if (referer && !hasHeader("Referer")) {
    finalHeaders.push(["Referer", referer]);
  }
  if (cookie && !hasHeader("Cookie")) {
    finalHeaders.push(["Cookie", cookie]);
  }
  if (userAuth && !hasHeader("Authorization")) {
    let encoded;
    try {
      encoded = btoa(userAuth);
    } catch {
      throw new Error("Usuário/senha de -u contém caracteres não suportados.");
    }
    finalHeaders.push(["Authorization", `Basic ${encoded}`]);
  }

  return {
    method: resolvedMethod,
    url: baseUrl,
    query_params: queryParams,
    headers: finalHeaders,
    body,
  };
}

let overlayEl;
let textareaEl;
let errorEl;
let cancelBtn;
let confirmBtn;
let activeResolve = null;
let previouslyFocused = null;

function getElements() {
  if (overlayEl) {
    return { overlayEl, textareaEl, errorEl, cancelBtn, confirmBtn };
  }

  overlayEl = document.getElementById("curl-import-overlay");
  textareaEl = document.getElementById("curl-import-textarea");
  errorEl = document.getElementById("curl-import-error");
  cancelBtn = document.getElementById("curl-import-cancel-btn");
  confirmBtn = document.getElementById("curl-import-confirm-btn");

  cancelBtn.addEventListener("click", () => closeDialog(null));
  confirmBtn.addEventListener("click", () => {
    try {
      const parsed = parseCurlCommand(textareaEl.value);
      closeDialog(parsed);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  });
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      closeDialog(null);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (overlayEl.style.display === "none" || overlayEl.style.display === "") {
      return;
    }
    if (event.key === "Escape") {
      closeDialog(null);
    }
  });

  return { overlayEl, textareaEl, errorEl, cancelBtn, confirmBtn };
}

function closeDialog(result) {
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

/** Abre o diálogo de importação; resolve com o resultado do parse, ou `null` se cancelado. */
export function showCurlImportDialog() {
  const els = getElements();

  els.textareaEl.value = "";
  els.errorEl.hidden = true;
  els.errorEl.textContent = "";

  previouslyFocused = document.activeElement;
  els.overlayEl.style.display = "flex";
  els.textareaEl.focus();

  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}
