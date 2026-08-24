# Plano de Execução — Fase 5

Esta fase não amplia o escopo funcional geral descrito em `CLAUDE.md` (verbos HTTP, query/path params, headers, tipos de body, coleções, ambientes). O que ela adiciona é uma **forma alternativa de preencher o editor de requisição**: importar um comando `curl` (colado pelo usuário, estilo terminal Linux/bash) e converter automaticamente seus dados — método, URL, query params, headers e body — para o formato que o editor já usa hoje (`request-editor.js`).

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

## Contexto

O editor de requisição (`src/request-editor.js`) já mantém um "rascunho" (`draft`) em memória com `method`, `url`, `queryParams`, `pathParams`, `headers` e `body` (tipos `none`/`raw`/`form_urlencoded`/`form_data` — ver `src-tauri/src/http_engine.rs::RequestBody`). Existe hoje uma função `normalizeIncomingRequest(data)` que já sabe converter um objeto no formato `SavedRequest` do backend (`{ method, url, query_params: [[k,v],...], headers: [[k,v],...], body: {type,...} }`) para o formato do `draft`. Esta fase reaproveita exatamente essa função: o parser de `curl` produz um objeto no mesmo formato `SavedRequest`-like, e a integração só precisa chamar `normalizeIncomingRequest` (hoje não exportada) e re-renderizar — sem inventar um segundo caminho de adaptação.

Não há bundler no frontend (JS vanilla servido direto, `window.__TAURI__` global) — o parser de curl deve ser JS puro, sem dependências novas em `package.json`/`Cargo.toml`.

## Objetivo

Adicionar uma action bar global (`#global-action-bar`), uma faixa fininha com separador visível (`border-bottom`) logo abaixo da barra de título (`#app-header`), acima de `#app-body` (sidebar + editor + resposta). Nela fica um botão "Importar" que abre um submenu com as origens de importação suportadas — nesta fase, apenas "cURL". Escolher "cURL" abre um diálogo com um campo de texto (multi-linha) para colar o comando. Ao confirmar, o comando é interpretado e os campos do rascunho atual do editor de requisição (método, URL, query params, headers, body) são substituídos pelo resultado — o usuário revisa/ajusta como já faz com qualquer edição manual, e persiste com o botão "Salvar" já existente (a importação em si não salva nada em disco).

## Fora de escopo

- **Exportar** uma requisição do app como comando `curl` (sentido inverso). Não foi pedido; fica para uma fase futura.
- Sintaxe de continuação de linha do Windows (`^` do `cmd.exe`) ou do PowerShell (crase, aspas diferentes). Suporta-se exclusivamente o estilo Linux/bash/zsh: continuação com `\` no fim da linha e aspas simples/duplas no padrão POSIX shell.
- Expansão de variáveis de shell (`$VAR`, `${VAR}`, `$(comando)`, crases). Esses trechos são preservados como texto literal no valor importado, nunca executados ou substituídos — inclusive porque o app tem sua própria sintaxe de variável (`{{variavel}}`), que deve passar ilesa pelo import.
- Múltiplas URLs no mesmo comando (`curl url1 url2`, recurso real do curl). Apenas uma URL é considerada: a de `--url`, se presente, senão o primeiro argumento posicional; qualquer posicional extra é ignorado.
- Flags que exigiriam acesso a arquivos do disco no momento do parse: `-T`/`--upload-file`, `--data-binary @arquivo`/`-d @arquivo` (o `@arquivo` é mantido como texto literal no body, não lido), `--cacert`/`--cert`/`--key`, `--cookie-jar`/`-c` (arquivo), `-b`/`--cookie <arquivo>` (só a forma inline `nome=valor` é suportada, não caminho de arquivo).
- Flags de rede/transporte/saída sem efeito no modelo de requisição do app: `-k`/`--insecure`, `-L`/`--location`, `--compressed`, `-s`/`-S`, `-v`, `-i`, `-o`/`--output`, `-w`/`--write-out`, `--http1.1`/`--http1.0`/`--http2`/`--http3`, `-x`/`--proxy`, `--connect-timeout`/`--max-time`, `--resolve`. São reconhecidas (para não quebrar o parsing de argumentos) e descartadas.
- Autenticação avançada (`--oauth2-bearer`, AWS SigV4, `--negotiate`, `--ntlm` etc.) — fora de escopo geral do projeto. `-u`/`--user` é aceito porque vira só um header `Authorization: Basic ...` calculado localmente (mesma natureza de "header manual" já suportada).
- Qualquer flag desconhecida/rara não listada nesta fase: é tratada como sem argumento (ignorada). Se algum comando real usar uma flag rara de 1 argumento não mapeada aqui, o valor dela pode ser lido erroneamente como a URL/positional seguinte — limitação conhecida e aceitável dado que não há uma lista oficial exaustiva de flags do curl embutida no app.
- Validação/parse de `--data-urlencode` não replica byte a byte o algoritmo de percent-encoding do curl; usa `encodeURIComponent` no valor, o que cobre o caso comum mas pode divergir em caracteres de borda muito específicos.

## Detalhes de implementação

### 1. Novo módulo `src/curl-import.js`

Duas responsabilidades no mesmo arquivo: o parser (puro, testável) e o diálogo (DOM).

#### 1.1 Tokenizador

```js
function tokenizeShellCommand(input)
```

- Primeiro, normaliza continuações de linha estilo bash: substitui `/\\\r?\n[ \t]*/g` por um espaço (uma barra invertida no fim da linha une com a próxima). Também remove `\r` soltos restantes.
- Percorre a string caractere a caractere mantendo um estado (`none` | `single` | `double`) e um buffer do token atual:
  - Fora de aspas: espaço em branco fecha o token atual (se não vazio) e começa um novo; `'` entra em modo aspas simples (não copiado ao buffer); `"` entra em modo aspas duplas (não copiado); `\` fora de aspas escapa o próximo caractere literalmente (copia o caractere seguinte, descarta a barra).
  - Em aspas simples: tudo literal até o próximo `'` (sem processar escapes), que fecha o modo.
  - Em aspas duplas: `\` só escapa `"`, `\`, `$` e `` ` `` (copia o caractere escapado, descarta a barra); qualquer outro `\` é mantido literal; `"` fecha o modo.
  - Transições de aspas não quebram o token (`--data='{"a":1}'resto` vira um único token) — só espaço fora de aspas quebra.
  - Se a string terminar com um modo de aspas ainda aberto, lança `Error("Comando com aspas não fechadas.")`.
- Retorna a lista de tokens (strings já "desescapadas").

#### 1.2 Tabela de flags conhecidas

```js
const KNOWN_FLAGS = {
  // nome: { arity: 0 | 1, kind: "method" | "header" | "data" | "data-urlencode" | "form" | "get" | "user" | "user-agent" | "referer" | "cookie" | "url" | "ignored" }
  "-X": { arity: 1, kind: "method" }, "--request": { arity: 1, kind: "method" },
  "-H": { arity: 1, kind: "header" }, "--header": { arity: 1, kind: "header" },
  "-d": { arity: 1, kind: "data" }, "--data": { arity: 1, kind: "data" },
  "--data-ascii": { arity: 1, kind: "data" }, "--data-raw": { arity: 1, kind: "data" },
  "--data-binary": { arity: 1, kind: "data" },
  "--data-urlencode": { arity: 1, kind: "data-urlencode" },
  "-F": { arity: 1, kind: "form" }, "--form": { arity: 1, kind: "form" },
  "-G": { arity: 0, kind: "get" }, "--get": { arity: 0, kind: "get" },
  "-u": { arity: 1, kind: "user" }, "--user": { arity: 1, kind: "user" },
  "-A": { arity: 1, kind: "user-agent" }, "--user-agent": { arity: 1, kind: "user-agent" },
  "-e": { arity: 1, kind: "referer" }, "--referer": { arity: 1, kind: "referer" },
  "-b": { arity: 1, kind: "cookie" }, "--cookie": { arity: 1, kind: "cookie" },
  "--url": { arity: 1, kind: "url" },
  // reconhecidas e descartadas (arity correta para não desalinhar o parsing)
  "-k": { arity: 0, kind: "ignored" }, "--insecure": { arity: 0, kind: "ignored" },
  "-s": { arity: 0, kind: "ignored" }, "--silent": { arity: 0, kind: "ignored" },
  "-S": { arity: 0, kind: "ignored" }, "--show-error": { arity: 0, kind: "ignored" },
  "-v": { arity: 0, kind: "ignored" }, "--verbose": { arity: 0, kind: "ignored" },
  "-i": { arity: 0, kind: "ignored" }, "--include": { arity: 0, kind: "ignored" },
  "-L": { arity: 0, kind: "ignored" }, "--location": { arity: 0, kind: "ignored" },
  "--compressed": { arity: 0, kind: "ignored" },
  "-o": { arity: 1, kind: "ignored" }, "--output": { arity: 1, kind: "ignored" },
  "-w": { arity: 1, kind: "ignored" }, "--write-out": { arity: 1, kind: "ignored" },
  "--http1.1": { arity: 0, kind: "ignored" }, "--http1.0": { arity: 0, kind: "ignored" },
  "--http2": { arity: 0, kind: "ignored" }, "--http3": { arity: 0, kind: "ignored" },
  "-x": { arity: 1, kind: "ignored" }, "--proxy": { arity: 1, kind: "ignored" },
  "--connect-timeout": { arity: 1, kind: "ignored" }, "--max-time": { arity: 1, kind: "ignored" },
  "--resolve": { arity: 1, kind: "ignored" },
  "--cacert": { arity: 1, kind: "ignored" }, "--cert": { arity: 1, kind: "ignored" },
  "--key": { arity: 1, kind: "ignored" },
  "-c": { arity: 1, kind: "ignored" }, "--cookie-jar": { arity: 1, kind: "ignored" },
  "-T": { arity: 1, kind: "ignored" }, "--upload-file": { arity: 1, kind: "ignored" },
};
```

Qualquer flag (token começando com `-`) fora dessa tabela é tratada como `{ arity: 0, kind: "ignored" }` (ver limitação já registrada em "Fora de escopo").

#### 1.3 `parseCurlCommand(rawInput)`

1. Tokeniza com `tokenizeShellCommand`.
2. Descarta um primeiro token `$` isolado, se presente (prompt copiado por engano, ex.: `$ curl ...`).
3. Exige que o primeiro token seja exatamente `curl`; senão lança `Error("O comando precisa começar com \"curl\".")`. (Sem suporte a `curl.exe` — explicitamente "estilo Linux".)
4. Percorre os tokens restantes. Acumula: `method` (string|null), `headers` (array de `[k,v]`), `dataParts` (array de strings, uma por ocorrência de `-d`/`--data*`/`--data-urlencode`), `formFields` (array), `explicitUrl` (string|null), `positionalUrl` (string|null — primeiro token sem `-` inicial), `useGet` (bool), `userAuth`/`userAgent`/`referer`/`cookie` (string|null).
   - Token que comece com `-`: procura na tabela (usa o token inteiro; não expande flags curtas agrupadas tipo `-sL` — limitação aceitável, não é um padrão comum em comandos copiados de "Copy as cURL"). Se `arity === 1`, consome o próximo token como valor (se não houver próximo token, lança `Error` indicando a flag incompleta). Roteia pelo `kind`:
     - `method`: `method = valor.toUpperCase()`.
     - `header`: separa `valor` no primeiro `:`; chave = trim antes, valor = trim depois (se não houver `:`, guarda o header com valor vazio). Empurra em `headers`.
     - `data`/`data-urlencode`: para `data-urlencode`, se `valor` casar `/^([^=]+)=(.*)$/`, vira `nome + "=" + encodeURIComponent(grupo2)`; senão `encodeURIComponent(valor)` inteiro. Empurra a string resultante em `dataParts`.
     - `form`: parseia `nome=valor`; se `valor` começa com `@`, é arquivo (`file_path = valor.slice(1)`, `value = ""`); suporta um sufixo `;type=...` no final removendo-o antes de checar o `@` (descarta o mime, só documentado). Empurra `{ name, value, file_path }`.
     - `get`: `useGet = true`.
     - `user`: `userAuth = valor`.
     - `user-agent`: `userAgent = valor`.
     - `referer`: `referer = valor`.
     - `cookie`: só usa se `valor` contiver `=` (senão é um caminho de arquivo, ignorado); `cookie = valor`.
     - `url`: `explicitUrl = valor`.
     - `ignored`: descarta.
   - Token que não comece com `-`: se `positionalUrl` ainda for `null`, vira `positionalUrl`; senão é ignorado (segunda URL, fora de escopo).
5. URL final = `explicitUrl || positionalUrl`. Se vazia/ausente, lança `Error("Não foi possível encontrar a URL no comando.")`.
6. Separa query string da URL **sem usar `new URL()`** (a URL pode conter `{{variavel}}`, que não é uma URL absoluta válida): acha o primeiro `?` na string; tudo antes é `baseUrl`, tudo depois é `queryString`. Se não houver `?`, `queryString = ""`.
   - `queryParams` = `queryString.split("&")` (ignora vazios), cada parte splitada no primeiro `=` (`indexOf("=")`; se não houver `=`, valor = `""`); chave/valor passam por `decodeURIComponent(parte.replace(/\+/g, " "))` dentro de um `try/catch` — se falhar (sequência `%` inválida), usa o texto cru sem decodificar.
7. Resolve o body:
   - Se `formFields.length > 0`: `body = { type: "form_data", fields: formFields }`.
   - Senão se `dataParts.length > 0` e **não** `useGet`: `body = { type: "raw", content: dataParts.join("&") }`.
   - Senão: `body = { type: "none" }`.
   - Se `useGet` e `dataParts.length > 0`: em vez de virar body, cada parte de `dataParts` é *também* parseada como par `chave=valor` (mesma regra do passo 6) e anexada a `queryParams` (replica o `-G`/`--get` do curl: dados viram query string).
8. Resolve o método (nesta ordem de precedência):
   - `method` explícito (`-X`), se presente — deve ser um dos suportados pelo app (`GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`); senão lança `Error("Método \"" + method + "\" não é suportado. Métodos aceitos: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.")`.
   - Senão, se `formFields.length > 0` ou (`dataParts.length > 0` e não `useGet`): `"POST"`.
   - Senão, `"GET"`.
9. Monta `headers` final: começa com os `headers` coletados no passo 4, depois adiciona (só se a chave ainda não existir, comparação case-insensitive):
   - Se `body.type === "raw"`: `["Content-Type", "application/x-www-form-urlencoded"]` (mesmo default do curl para `-d` sem `-H Content-Type` explícito).
   - Se `userAgent`: `["User-Agent", userAgent]`.
   - Se `referer`: `["Referer", referer]`.
   - Se `cookie`: `["Cookie", cookie]`.
   - Se `userAuth`: `["Authorization", "Basic " + btoa(userAuth)]` (envolver em `try/catch`; se `btoa` falhar por caractere fora de Latin1, lança `Error("Usuário/senha de -u contém caracteres não suportados.")`).
10. Retorna `{ method, url: baseUrl, query_params: queryParams, headers, body }` — mesmo formato aceito por `normalizeIncomingRequest` em `request-editor.js`.

#### 1.4 Diálogo `showCurlImportDialog()`

```js
export function showCurlImportDialog()
```

Promise que resolve com o objeto retornado por `parseCurlCommand` quando o usuário importa com sucesso, ou `null` se cancelar/fechar. Usa a marcação própria adicionada em `index.html` (seção 2), não reaproveita `modal.js` (o modal existente só tem um `<input>` de uma linha e confirma com Enter — incompatível com colar um comando multi-linha).

- Ao abrir: `textarea.value = ""`, esconde a área de erro, mostra o overlay (`display: flex`), foca o textarea, guarda `document.activeElement` anterior para restaurar o foco ao fechar (mesmo padrão de `modal.js`).
- Botão "Cancelar" e clique fora do card (`overlay` mas não `.modal`) e tecla `Escape`: resolve `null` e fecha.
- Botão "Importar": chama `parseCurlCommand(textarea.value)` dentro de um `try/catch`. Em caso de erro, escreve `error.message` na área de erro (`hidden = false`) e **mantém o diálogo aberto** (usuário corrige o texto e tenta de novo). Em caso de sucesso, fecha o diálogo e resolve com o resultado.
- Sem atalho de Enter para confirmar (é uma textarea multi-linha; Enter deve inserir quebra de linha normalmente).

### 2. `src/index.html`

Adicionar, dentro de `#app`, entre `#app-header` e `#app-body`, um contêiner vazio para a action bar global (preenchido via JS por `mountGlobalActionBar()`, seção 4):

```html
<div id="global-action-bar" class="global-action-bar"></div>
```

Adicionar também, ao lado do `#modal-overlay` já existente (fora de `#app`), um segundo overlay dedicado:

```html
<div id="curl-import-overlay" class="modal-overlay" style="display: none;">
  <div class="modal modal--curl-import" role="dialog" aria-modal="true" aria-labelledby="curl-import-title">
    <h3 id="curl-import-title" class="modal-title">Importar comando curl</h3>
    <p class="modal-message">Cole abaixo um comando curl (estilo Linux/bash). Método, URL, query params, headers e body serão preenchidos automaticamente no editor.</p>
    <textarea id="curl-import-textarea" class="curl-import-textarea" rows="10" spellcheck="false" placeholder="curl -X POST https://api.exemplo.com/users \&#10;  -H &quot;Content-Type: application/json&quot; \&#10;  -d '{&quot;name&quot;:&quot;Ana&quot;}'"></textarea>
    <p id="curl-import-error" class="curl-import-error" hidden></p>
    <div class="modal-actions">
      <button id="curl-import-cancel-btn" class="modal-btn modal-btn-secondary" type="button">Cancelar</button>
      <button id="curl-import-confirm-btn" class="modal-btn modal-btn-primary" type="button">Importar</button>
    </div>
  </div>
</div>
```

### 3. `src/styles.css`

Reaproveitar as classes `.modal-overlay`/`.modal`/`.modal-title`/`.modal-message`/`.modal-actions`/`.modal-btn*` já existentes (não duplicar) para o diálogo de colar o comando. Adicionar:

```css
.modal--curl-import {
  width: min(640px, 90vw);
}

.curl-import-textarea {
  width: 100%;
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
}

.curl-import-error {
  color: var(--color-danger, #d33);
  font-size: 13px;
}
```

(Usar a variável de cor de erro/perigo já existente no tema, se houver uma com outro nome — conferir `styles.css` antes de introduzir `--color-danger`; só criar a variável se nenhuma equivalente já existir.)

Além disso, estilos para a action bar global e o menu suspenso de importação — ver seção 4 abaixo:

```css
.global-action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0.35rem 1rem;
  background-color: var(--color-bg-alt);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
```

(`#global-action-bar` é filho direto de `#app`, entre `#app-header` e `#app-body` — participa do `display: flex; flex-direction: column` de `#app`; o `border-bottom` é o separador visível pedido, igual ao já usado em `#app-header`. As actions são alinhadas da esquerda para a direita — `justify-content: flex-start` — e não pela ponta oposta, para futuras actions se acumularem em sequência a partir da esquerda, como em toolbars convencionais.)

`.import-menu`, `.import-menu-trigger`, `.import-menu-icon`, `.import-menu-dropdown`, `.import-menu-item`: o trigger é um botão de ação "flat" (sem borda, sem seta textual "▾"), com um ícone SVG inline (tray de import) + rótulo "Importar", destacado só no hover/aberto (`background-color: var(--color-bg-panel)`) — no mesmo estilo visual esperado de itens de action bar, não de um `<select>`/botão com borda. O dropdown é um pequeno painel posicionado (`position: absolute`) abaixo e alinhado à esquerda do trigger (`left: 0`, coerente com o trigger ficar na ponta esquerda da action bar), com um item de menu por origem suportada; esse painel (não o trigger) é quem tem borda/sombra, por ser um menu flutuante.

### 4. `src/request-editor.js`

- Importar: `import { showCurlImportDialog } from "./curl-import.js";`.
- Exportar `normalizeIncomingRequest` deixa de ser necessário exportar — a integração fica no próprio arquivo (é função interna já usada por `loadRequestIntoEditor`).
- Nova função `handleImportCurl`:
  ```js
  async function handleImportCurl() {
    const parsed = await showCurlImportDialog();
    if (!parsed) return;
    draft = normalizeIncomingRequest(parsed);
    renderRequestEditor();
  }
  ```
  Note que `currentMeta` **não é alterado** — se havia uma requisição salva selecionada, ela continua associada ao rascunho (o botão "Salvar" continua habilitado e grava por cima dela); se não havia (`requestId: null`), o botão "Salvar" continua desabilitado, igual a qualquer edição manual em um rascunho novo.
- Nova função `buildImportMenu()`: constrói o botão "Importar ▾" e um dropdown (`hidden` por padrão) com um item "cURL" por enquanto. Ao clicar no trigger, alterna a visibilidade do dropdown; ao escolher o item "cURL", fecha o dropdown e chama `handleImportCurl()`. Fecha também ao clicar fora do menu (listener em `document`, checando `wrapper.contains(event.target)`) ou pressionar `Escape` — mesmo padrão de fechamento dos diálogos existentes. Estrutura pensada para comportar novas origens no futuro (mais `import-menu-item`s no dropdown), embora nenhuma outra origem esteja no escopo desta fase.
- Nova função exportada `mountGlobalActionBar()`: localiza `#global-action-bar` via `getElementById`, limpa o conteúdo e anexa `buildImportMenu()`. Diferente do toolbar da requisição, **não** é chamada dentro de `renderRequestEditor()` — o menu não depende do `draft` e não deve ser reconstruído a cada re-render (perderia o estado aberto/fechado à toa). É chamada **uma única vez** pelo host.
- `buildToolbar()` continua exatamente como antes desta fase (método/URL/Salvar/Enviar), sem o menu de importação.

### 5. `src/main.js`

- Importar `mountGlobalActionBar` de `./request-editor.js`.
- Chamar `mountGlobalActionBar()` uma vez dentro do listener de `DOMContentLoaded`, junto das outras inicializações (`renderRequestEditor()`, `renderInitialResponsePanel()` etc.).

## Critérios de aceite

- O app exibe uma action bar fininha logo abaixo da barra de título (`#app-header`), com separador visível, contendo um botão "Importar" que abre um submenu com a opção "cURL"; escolher essa opção abre o diálogo de colar o comando.
- Um comando curl típico, multi-linha (continuações com `\`), com `-X`, múltiplos `-H` e um `-d` com JSON, importado com sucesso: preenche corretamente método, URL (sem query string embutida), aba "Query Params" (se a URL original tinha `?...`), aba "Headers" (todas as `-H`, mais `Content-Type: application/x-www-form-urlencoded` automático só se nenhuma delas já definia `Content-Type`) e aba "Body" como `raw` com o conteúdo colado.
- Um comando com `-F`/`--form` (incluindo pelo menos um campo `nome=@arquivo`) importa como Body "form-data", com o campo de arquivo preenchido em "caminho do arquivo".
- Um comando com `-G`/`--get` combinado com `-d chave=valor` importa como método GET, sem body, com `chave=valor` na aba "Query Params".
- Um comando com `-u usuario:senha` importa um header `Authorization: Basic <base64 de "usuario:senha">` calculado corretamente.
- Um comando com `-X TRACE` (método não suportado pelo app) mostra uma mensagem de erro dentro do próprio diálogo, sem fechá-lo, permitindo corrigir e tentar de novo.
- Um texto colado que não começa com `curl`, ou sem nenhuma URL identificável, mostra mensagem de erro clara no diálogo (sem lançar exceção não tratada nem fechar o diálogo).
- URLs, headers ou body contendo `{{variavel}}` (sintaxe de variável do app) são preservados literalmente após a importação, e os campos correspondentes recebem o indicador visual de variável (`has-variable`) já existente no editor.
- Importar não persiste nada sozinho: o botão "Salvar" continua sendo o único jeito de gravar a requisição importada em disco, e seu estado habilitado/desabilitado segue exatamente a mesma regra de hoje (depende de haver uma requisição salva selecionada).
- Nenhuma dependência nova em `package.json` ou `Cargo.toml` — parser 100% JS vanilla, sem tocar no lado Rust.

## Entregáveis

- `src/curl-import.js` (novo): parser de comando curl + diálogo de importação.
- `src/index.html`, `src/styles.css`, `src/request-editor.js`, `src/main.js` atualizados conforme acima.
- Action bar global, logo abaixo da barra de título, com menu "Importar" (submenu contendo a opção "cURL"), cobrindo os fluxos descritos nos critérios de aceite.
