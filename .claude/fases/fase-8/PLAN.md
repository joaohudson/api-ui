# Plano de Execução — Fase 8

Esta fase completa o ciclo de **transferência de uma coleção via arquivo JSON**:
exportar uma coleção existente para um arquivo `.json` escolhido pelo usuário e
importar uma coleção a partir de um arquivo `.json` gerado por essa mesma
exportação. Não amplia o escopo funcional geral de `CLAUDE.md` (verbos HTTP,
coleções, ambientes, persistência local) — apenas adiciona uma forma de os
dados de uma coleção saírem e entrarem do app em um documento autocontido.

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em
`plan/`: toda a implementação está descrita diretamente abaixo. Um agente
executor deve seguir este arquivo sozinho.

## Contexto (o que já existe)

- O backend **já tem** o comando `export_collection_to_json(collection_id)`
  (`src-tauri/src/export.rs` + `src-tauri/src/commands.rs:273`), registrado em
  `src-tauri/src/lib.rs:31`. Ele monta um `CollectionExport`
  (`#[serde(flatten)] collection: Collection` + `environment_data: Vec<Environment>`),
  serializa com `serde_json::to_string_pretty`, abre o diálogo nativo de
  salvamento do Tauri (`app.dialog().file().set_file_name(...).add_filter("JSON", &["json"]).blocking_save_file()`)
  e grava o arquivo. Retorna `Ok(None)` em cancelamento ou `Ok(Some(caminho))`
  em sucesso. **Esse comando nunca foi ligado a nenhum elemento de UI** — esta
  fase apenas o expõe na interface (e adiciona um marcador de formato, ver
  abaixo).
- Não existe nenhum comando de importação.
- A action bar global (`#global-action-bar` em `src/index.html:16`, estilo
  `.global-action-bar` em `src/styles.css:54`) hoje contém apenas o menu
  "Importar" (dropdown com um único item, "cURL"), montado uma vez por
  `mountGlobalActionBar()` em `src/request-editor.js:657` → `buildImportMenu()`
  (`src/request-editor.js:586`). Esse item de "cURL" preenche o **rascunho do
  editor** com o resultado do parse — semântica diferente da importação desta
  fase (ver "Semântica da importação").
- `src/main.js` é o host: mantém `state.collections` / `state.selectedCollectionId`
  / `state.selectedRequestId`, carrega coleções via `list_collections`, e é
  quem chama `mountGlobalActionBar()` (uma vez, no `DOMContentLoaded`,
  `src/main.js:346`). Cada item de `state.collections` tem o formato
  `{ id, name, requests: [...], environments: {...} }` — o mesmo objeto
  `Collection` retornado pelos comandos Tauri.
- Persistência: cada coleção é um arquivo `collections/<id>.json` e cada
  ambiente um arquivo `environments/<id>.json`, dentro do diretório de dados do
  app (`src-tauri/src/persistence.rs`). `collections::save_collection` grava uma
  `Collection` já montada; ambientes só têm criação campo a campo
  (`environments::create_environment`), não há uma função que persista um
  `Environment` já montado — esta fase adiciona uma.

## Objetivo

1. **Exportação** — nova ação "Exportação" na action bar global, à direita do
   menu "Importar", no mesmo padrão visual de dropdown. Contém **um item** cujo
   rótulo deixa claro o que será exportado: o nome da coleção selecionada, ex.
   `Coleção "Minha API" (JSON)`. Ao escolher o item, abre o diálogo nativo de
   salvamento (o usuário escolhe a pasta e o nome do arquivo `.json`) e grava a
   coleção — com suas requisições, ambientes e variáveis — no arquivo. Quando
   não há coleção selecionada, o gatilho "Exportação" fica desabilitado.
2. **Importação** — novo item no dropdown do menu "Importar" já existente,
   abaixo de "cURL", com rótulo `Coleção (JSON)`. Ao escolher, abre o diálogo
   nativo de seleção de arquivo (o usuário escolhe o arquivo `.json`); o
   conteúdo é lido e vira uma **nova coleção** no app (ver "Semântica da
   importação"), que passa a aparecer na sidebar já selecionada.
3. O arquivo trocado é sempre JSON, com o mesmo formato nos dois sentidos
   (o que a exportação grava, a importação lê).
4. **Edição do nome da coleção** — botão de editar (ícone de lápis) em cada
   item da lista de coleções na sidebar, ao lado do botão de excluir. Abre um
   prompt já preenchido com o nome atual; ao confirmar, renomeia a coleção via
   o comando `rename_collection` (já existente no backend). O rótulo do item
   de exportação acompanha o novo nome (a action bar é remontada a cada
   `render()`).

## Semântica da importação

- A importação **sempre cria uma coleção nova**; nunca mescla com uma coleção
  existente nem sobrescreve nada.
- **Todos os ids são regenerados** (coleção, cada requisição, cada ambiente).
  Isso evita colisão com dados já presentes no app e permite importar o mesmo
  arquivo várias vezes. As referências internas são remapeadas:
  `collection.environments.environment_ids` recebe os novos ids de ambiente, e
  `active_environment_id` é remapeado pelo id novo correspondente (ou vira
  `None` se o ambiente ativo original não estiver no arquivo).
- Cada `Environment` importado tem seu `collection_id` ajustado para o id da
  nova coleção.
- **Colisão de nome**: se já existir uma coleção com o mesmo `name`, o nome
  importado recebe o sufixo ` (importada)`; se ainda colidir, ` (importada 2)`,
  ` (importada 3)`, etc. Sem diálogo perguntando ao usuário.

## Formato do arquivo

Objeto JSON único, autocontido. Igual ao `CollectionExport` atual, acrescido de
um campo marcador no topo:

```json
{
  "schema": "api-ui/collection-export@1",
  "id": "…",
  "name": "…",
  "requests": [ { "id", "name", "method", "url", "query_params", "path_params", "headers", "body" }, … ],
  "environments": { "environment_ids": ["…"], "active_environment_id": "…" | null },
  "environment_data": [ { "id", "collection_id", "name", "variables" }, … ]
}
```

- `schema` é gravado pela exportação e **validado** pela importação: se o valor
  estiver presente e for diferente de `api-ui/collection-export@1`, a
  importação falha com mensagem clara ("arquivo de um formato/versão não
  suportado"). Se `schema` estiver ausente, aceita mesmo assim, desde que a
  estrutura mínima bata (`name` string + `requests` array) — não há arquivos
  antigos "no mundo" porque a exportação nunca esteve disponível, então o
  campo pode ser tratado como obrigatório na prática, mas a leniência mantém a
  regra simples.
- `id`, os `id` de requisição e os `id`/`collection_id` de ambiente presentes
  no arquivo são **ignorados na importação** (regenerados) — ficam no arquivo
  só porque `Collection`/`SavedRequest`/`Environment` os serializam.

## Fora de escopo

- Importar coleções de **outras ferramentas** (Postman, Insomnia, Thunder
  Client, OpenAPI, HAR, etc.) — continua fora de escopo, como em `CLAUDE.md`.
  Só o próprio formato de exportação do API UI é lido.
- Mesclar o conteúdo importado em uma coleção existente, ou dar opção de
  "substituir" uma coleção — a importação sempre cria uma coleção nova.
- Preservar os ids originais na importação, ou detectar "esta coleção já foi
  importada antes" para atualizar em vez de duplicar.
- Diálogo de resolução de conflito de nome — o sufixo ` (importada N)` é
  automático.
- Exportar **uma única requisição** (ou um subconjunto) — a exportação é sempre
  da coleção inteira selecionada.
- Exportar/importar por outro meio que não o diálogo nativo: arrastar-e-soltar
  arquivo na janela, colar caminho, linha de comando, área de transferência.
- Lembrar a última pasta usada / sugerir diretório de exportação. O diálogo
  nativo cuida disso com seu próprio comportamento padrão; a exportação só
  pré-preenche o **nome do arquivo** (já feito hoje, via `sanitize_file_name`).
- Escolher o formato de serialização (YAML, arquivo por requisição, .zip) — só
  um arquivo `.json` único, pretty-printed.
- Exportar o histórico/última resposta das requisições (o `responseCache` de
  `main.js` é de sessão, não entra no arquivo) ou o layout dos painéis.
- Versionar/migrar o formato: só existe `@1`; um `schema` diferente é rejeitado,
  não convertido.
- Barra de progresso, importação em lote de vários arquivos de uma vez,
  pré-visualização do conteúdo antes de confirmar a importação.

## Detalhes de implementação

### Backend

#### 1. `src-tauri/src/export.rs`

- Adicionar o campo marcador ao `CollectionExport`:
  ```rust
  #[derive(Debug, Clone, serde::Serialize)]
  pub struct CollectionExport {
      /// Marcador de formato/versão do arquivo exportado. Constante; lido e
      /// validado pela importação (`crate::import`).
      pub schema: &'static str,
      #[serde(flatten)]
      pub collection: Collection,
      pub environment_data: Vec<Environment>,
  }

  /// Valor de `CollectionExport::schema`. A importação rejeita qualquer outro.
  pub const EXPORT_SCHEMA: &str = "api-ui/collection-export@1";
  ```
  Ajustar `build_export` para preencher `schema: EXPORT_SCHEMA`.
- `export_collection_to_json` permanece igual no resto (diálogo, escrita,
  retorno `Option<String>`).
- Manter os testes existentes de `sanitize_file_name`.

#### 2. `src-tauri/src/environments.rs`

Adicionar função pública para persistir um `Environment` já montado (usada pela
importação; espelha `collections::save_collection`):

```rust
/// Persiste um ambiente já montado (ex.: vindo da importação de uma coleção),
/// gravando/sobrescrevendo o arquivo `environments/<id>.json`. Não mexe na
/// `Collection` — quem chama é responsável por manter
/// `Collection::environments.environment_ids` coerente.
pub fn save_environment(app: &AppHandle, environment: &Environment) -> Result<()> {
    persistence::write_json(app, &environment_path(&environment.id), environment)?;
    Ok(())
}
```

#### 3. Novo módulo `src-tauri/src/import.rs`

```rust
//! Importação de uma coleção a partir de um arquivo JSON gerado pela
//! exportação (`crate::export`). Cria sempre uma coleção nova, com todos os
//! ids regenerados; nunca mescla nem sobrescreve dados existentes.
```

- `ImportError` (`thiserror`): variantes para
  - `Dialog`/cancelamento não é erro (retorna `Ok(None)`);
  - `Io { path, source }` (falha ao ler o arquivo escolhido);
  - `Parse(serde_json::Error)` — JSON inválido / estrutura incompatível;
  - `UnsupportedSchema(String)` — `schema` presente e diferente de
    `EXPORT_SCHEMA`;
  - `#[from] CollectionsError`, `#[from] EnvironmentsError`,
    `#[from] PersistenceError`.
- Struct de leitura (espelha o formato do arquivo; `Collection` e `Environment`
  já são `Deserialize`):
  ```rust
  #[derive(Debug, serde::Deserialize)]
  struct CollectionImportDoc {
      #[serde(default)]
      schema: Option<String>,
      #[serde(flatten)]
      collection: Collection,
      #[serde(default)]
      environment_data: Vec<Environment>,
  }
  ```
- `pub async fn import_collection_from_json(app: &AppHandle) -> Result<Option<Collection>>`:
  1. `let Some(file_path) = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file() else { return Ok(None); };`
  2. Converter `file_path` em `PathBuf` (mesmo padrão de `export.rs` com
     `into_path()`), ler com `std::fs::read_to_string` → `ImportError::Io`.
  3. `let doc: CollectionImportDoc = serde_json::from_str(&contents)?;`
  4. Se `doc.schema` é `Some(s)` e `s != export::EXPORT_SCHEMA` →
     `Err(ImportError::UnsupportedSchema(s))`.
  5. Montar a nova coleção:
     - `new_collection_id = Uuid::new_v4().to_string()`
     - `name` = `resolve_name_collision(app, &doc.collection.name)?` (ver
       abaixo)
     - `requests` = `doc.collection.requests` com cada `id` trocado por
       `Uuid::new_v4().to_string()` (demais campos intactos)
     - ambientes: para cada `Environment` em `doc.environment_data`, gerar
       `new_env_id`, guardar `old_id -> new_id` num `HashMap`, e produzir um
       `Environment { id: new_env_id, collection_id: new_collection_id.clone(), name, variables }`
     - `environments.environment_ids` = lista dos novos ids (na mesma ordem de
       `environment_data`)
     - `environments.active_environment_id` =
       `doc.collection.environments.active_environment_id`
       remapeado pelo `HashMap` (`.and_then(|old| map.get(&old).cloned())`)
  6. Persistir: `collections::save_collection(app, &collection)?` e, para cada
     ambiente novo, `environments::save_environment(app, &env)?`.
  7. `Ok(Some(collection))`.
- `fn resolve_name_collision(app: &AppHandle, desired: &str) -> Result<String>`:
  lista `collections::list_collections(app)?`, coleta os nomes num
  `HashSet`; se `desired` não colide, retorna `desired`; senão tenta
  `format!("{desired} (importada)")`, depois `format!("{desired} (importada {n})")`
  com `n` a partir de 2, até achar um livre.
- Bloco `#[cfg(test)]` cobrindo pelo menos: remapeamento de
  `active_environment_id`; rejeição de `schema` desconhecido; regeneração de
  ids (novo id != id do arquivo). Testes que dependem de `AppHandle` podem ser
  omitidos — extrair as partes puras (remapeamento, resolução de nome com um
  slice de nomes existentes, validação de schema) para funções testáveis sem
  `AppHandle`, no mesmo espírito dos testes já existentes no projeto.

#### 4. `src-tauri/src/commands.rs`

- `use crate::import::{self, ImportError};`
- `impl From<ImportError> for CommandError` (só `message: err.to_string()`,
  como os outros).
- Novo comando, na seção de exportação/importação:
  ```rust
  /// Importa uma coleção a partir de um arquivo JSON escolhido pelo usuário
  /// via diálogo nativo. Cria sempre uma coleção nova (ids regenerados).
  /// Retorna `None` se o usuário cancelar o diálogo, ou a coleção criada.
  #[tauri::command]
  pub async fn import_collection_from_json(app: AppHandle) -> CommandResult<Option<Collection>> {
      Ok(import::import_collection_from_json(&app).await?)
  }
  ```

#### 5. `src-tauri/src/lib.rs`

- `mod import;`
- Registrar `commands::import_collection_from_json` no `generate_handler!`.

### Frontend

#### 6. Novo módulo `src/action-menu.js` — dropdown de ação reutilizável

Extrai o padrão de dropdown hoje embutido em `buildImportMenu`
(`src/request-editor.js`). Sem estado global; um wrapper por chamada.

```js
/**
 * Monta um menu de ação da action bar global: um gatilho (ícone opcional +
 * rótulo) que abre um dropdown de itens. Fecha ao escolher um item, clicar
 * fora ou apertar Escape. Mesmo padrão visual de `.action-menu*`.
 *
 * @param {object}   opts
 * @param {string}   opts.label      texto do gatilho
 * @param {string}   opts.title      tooltip do gatilho
 * @param {string}  [opts.iconSvg]   HTML de um <svg> inline (currentColor)
 * @param {boolean} [opts.disabled]  gatilho desabilitado, sem dropdown
 * @param {Array<{label,title?,onSelect}>} opts.items
 * @returns {HTMLElement} o wrapper `.action-menu`
 */
export function buildActionMenu({ label, title, iconSvg = "", disabled = false, items }) { … }
```

- Classes: `.action-menu` (wrapper), `.action-menu-trigger` (+ `.open`),
  `.action-menu-icon`, `.action-menu-dropdown` (+ `[hidden]`),
  `.action-menu-item`.
- `disabled: true` → `trigger.disabled = true`, sem listeners de abertura.
- Cada item: `<button class="action-menu-item">`, `click` → fecha o dropdown e
  chama `item.onSelect()`.

#### 7. `src/styles.css`

Renomear o bloco `.import-menu*` (linhas ~939–1000) para `.action-menu*`
(`.import-menu` → `.action-menu`, `.import-menu-trigger` → `.action-menu-trigger`,
etc.). Acrescentar, no seletor do gatilho, o estado desabilitado:

```css
.action-menu-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

Nenhuma outra regra muda. `.global-action-bar` já usa `display:flex; gap` não —
conferir: hoje não há `gap`; adicionar `gap: 0.25rem` em `.global-action-bar`
para separar os dois menus (ou margin-left no segundo). Preferir `gap`.

#### 8. `src/request-editor.js`

- `import { buildActionMenu } from "./action-menu.js";`
- Reescrever `buildImportMenu()` para usar `buildActionMenu`, mantendo o ícone
  de download atual (`import-menu-icon` vira `action-menu-icon`, mesmo path
  SVG) e o item "cURL" (`onSelect: () => handleImportCurl()`). O comentário do
  bloco de ícones (`src/request-editor.js:54`) que cita `buildImportMenu`
  continua válido.
- `mountGlobalActionBar` passa a aceitar opções e a poder ser chamado várias
  vezes (já faz `bar.innerHTML = ""`):
  ```js
  /**
   * (Re)monta a action bar global. Chamado pelo host (main.js) no load e
   * sempre que a seleção de coleção muda (o menu de exportação reflete a
   * coleção atual).
   *
   * @param {object}  [opts]
   * @param {Array<{label,title?,onSelect}>} [opts.extraImportItems]
   *        itens extras no fim do dropdown "Importar" (após "cURL").
   * @param {HTMLElement} [opts.exportMenu]
   *        nó de menu já montado, anexado após o menu "Importar".
   */
  export function mountGlobalActionBar({ extraImportItems = [], exportMenu = null } = {}) {
    const bar = document.getElementById("global-action-bar");
    if (!bar) return;
    bar.innerHTML = "";
    bar.appendChild(buildImportMenu(extraImportItems));
    if (exportMenu) bar.appendChild(exportMenu);
  }
  ```
  `buildImportMenu(extraItems = [])` monta os itens como
  `[{ label: "cURL", title: …, onSelect: … }, ...extraItems]`.

#### 9. Novo módulo `src/collection-transfer.js` — importação/exportação de coleção

```js
import { showAlert } from "./modal.js";
import { buildActionMenu } from "./action-menu.js";

function invoke(command, args) {
  return window.__TAURI__.core.invoke(command, args);
}
```

- `export async function importCollectionFromJson()`:
  ```js
  try {
    const collection = await invoke("import_collection_from_json");
    return collection ?? null;           // null = cancelado
  } catch (error) {
    await showAlert({ title: "Erro ao importar coleção", message: String(error) });
    return null;
  }
  ```
- `export async function exportCollectionToJson(collectionId)`:
  ```js
  try {
    const path = await invoke("export_collection_to_json", { collectionId });
    if (path) {
      await showAlert({ title: "Coleção exportada", message: `Arquivo salvo em:\n${path}` });
    }
  } catch (error) {
    await showAlert({ title: "Erro ao exportar coleção", message: String(error) });
  }
  ```
- `export function buildCollectionExportMenu({ collection, onExport })`:
  ```js
  const hasCollection = Boolean(collection);
  return buildActionMenu({
    label: "Exportação",
    title: hasCollection
      ? `Exportar a coleção "${collection.name}" para um arquivo JSON`
      : "Selecione uma coleção para exportar",
    disabled: !hasCollection,
    items: hasCollection
      ? [{
          label: `Coleção "${collection.name}" (JSON)`,
          title: "Escolher onde salvar o arquivo .json da coleção",
          onSelect: () => onExport(collection),
        }]
      : [],
  });
  ```
  (Opcional: dar ao menu de exportação um ícone SVG próprio — de "upload"/seta
  para cima; se preferir, sem ícone, só o rótulo.)

#### 10. `src/main.js`

- Import:
  ```js
  import {
    importCollectionFromJson,
    exportCollectionToJson,
    buildCollectionExportMenu,
  } from "./collection-transfer.js";
  ```
- Nova função `renderActionBar()`:
  ```js
  function renderActionBar() {
    mountGlobalActionBar({
      extraImportItems: [{
        label: "Coleção (JSON)",
        title: "Importar uma coleção de um arquivo JSON exportado pelo API UI",
        onSelect: handleImportCollection,
      }],
      exportMenu: buildCollectionExportMenu({
        collection: getSelectedCollection(),
        onExport: handleExportCollection,
      }),
    });
  }
  ```
- Chamar `renderActionBar()` dentro de `render()` (logo após
  `renderRequestsList()`), para o menu de exportação acompanhar a seleção.
  Remover a chamada solta `mountGlobalActionBar()` do `DOMContentLoaded`
  (o primeiro `render()` já cobre) — ou trocá-la por `renderActionBar()`.
- `handleImportCollection()`:
  ```js
  async function handleImportCollection() {
    const collection = await importCollectionFromJson();
    if (!collection) return;                 // cancelado ou erro (já alertado)
    state.collections.push(collection);
    state.selectedCollectionId = collection.id;
    state.selectedRequestId = null;
    render();
    syncEditorWithSelection();
  }
  ```
- `handleExportCollection(collection)`:
  ```js
  async function handleExportCollection(collection) {
    if (!collection) return;
    await exportCollectionToJson(collection.id);
  }
  ```

#### 11. Edição do nome da coleção — `src/main.js` + `src/styles.css`

- `src/styles.css`: estender as regras `.list-item-delete-btn` /
  `.list-item-delete-btn:hover` para também cobrir `.list-item-edit-btn`
  (mesmo tamanho/opacidade/hover).
- `src/main.js`, em `renderCollectionsList()`: antes do `deleteBtn`, criar um
  `editBtn` (`.list-item-edit-btn`, texto `✎`, `title` "Editar nome da
  coleção"), com `click` chamando `event.stopPropagation()` +
  `renameCollection(collection.id, collection.name)`.
- `src/main.js`: nova `renameCollection(collectionId, currentName)` — usa
  `showPrompt` com `inputValue: currentName` e `confirmLabel: "Salvar"`;
  cancela se `null`, string vazia ou nome igual ao atual; caso contrário
  `invoke("rename_collection", { id, name })`, atualiza `collection.name` no
  `state` e chama `render()` (que remonta a action bar, refletindo o novo
  nome no item de exportação). Erro → `showAlert`.
- Requisições não ganham edição de nome nesta fase (só coleções, conforme o
  pedido).

### `src/index.html`

Sem mudança estrutural — a action bar continua sendo populada por JS. (Se o
menu de exportação ganhar um ícone SVG inline, ele é criado em JS como o do
menu de importação, não no HTML.)

## Critérios de aceite

1. Com uma coleção selecionada, a action bar mostra "Importar" e "Exportação".
   Sem coleção selecionada, "Exportação" aparece desabilitada.
2. "Exportação" → item com o nome da coleção (ex. `Coleção "Minha API" (JSON)`).
   Clicar abre o diálogo nativo de salvar, com o nome do arquivo pré-preenchido
   (`<nome-sanitizado>.json`) e o usuário podendo escolher a pasta. Confirmando,
   o arquivo é gravado e um alerta mostra o caminho. Cancelando, nada acontece
   e nenhum erro aparece.
3. O menu "Importar" tem dois itens: "cURL" (comportamento inalterado — preenche
   o editor) e "Coleção (JSON)".
4. "Coleção (JSON)" → diálogo nativo de abrir arquivo (filtro `.json`).
   Escolhendo um arquivo exportado pelo passo 2, uma nova coleção aparece na
   sidebar, já selecionada, com as mesmas requisições, ambientes e variáveis do
   arquivo. Cancelando, nada acontece.
5. Exportar a coleção "X" e importar o arquivo resultante duas vezes gera
   "X (importada)" e "X (importada 2)", sem erro, cada uma com ids próprios e
   independentes da original.
6. Importar um `.json` que não seja uma exportação do API UI (JSON aleatório,
   ou `schema` diferente) mostra um alerta de erro claro e não cria coleção.
7. O ambiente ativo da coleção original continua ativo na coleção importada
   (remapeado para o novo id).
8. `cargo test` no `src-tauri/` passa, incluindo os novos testes de `import.rs`.
9. `npm run tauri dev` sobe sem erro de console; os fluxos 2 e 4 funcionam
   ponta a ponta.
10. Cada coleção na sidebar tem um botão de editar (lápis); clicá-lo abre um
    prompt com o nome atual, e confirmar com um nome novo renomeia a coleção
    na sidebar e atualiza o rótulo do item de exportação.

## Entregáveis

- `src-tauri/src/import.rs` (novo) + `mod import;` em `lib.rs`.
- `src-tauri/src/export.rs` com o campo/constante `schema` (`EXPORT_SCHEMA`).
- `environments::save_environment` (novo) em `src-tauri/src/environments.rs`.
- `commands::import_collection_from_json` + `From<ImportError>` em `commands.rs`,
  registrado em `lib.rs`.
- `src/action-menu.js` (novo) — dropdown de ação reutilizável.
- `src/collection-transfer.js` (novo) — import/export de coleção + menu de
  exportação.
- `src/request-editor.js` — `buildImportMenu` sobre `buildActionMenu`;
  `mountGlobalActionBar` com opções.
- `src/main.js` — `renderActionBar()`, `handleImportCollection`,
  `handleExportCollection`, `renameCollection` + botão de editar na lista de
  coleções.
- `src/styles.css` — `.import-menu*` → `.action-menu*` + estado `:disabled` +
  `gap` na `.global-action-bar` + `.list-item-edit-btn` (junto de
  `.list-item-delete-btn`).
- `CLAUDE.md` — mover "Exportação de coleção para arquivo JSON" para incluir
  também a importação do próprio formato; deixar claro que importar de outras
  ferramentas segue fora de escopo.
- `README.md` — ajustar a seção "Funcionalidades" (e a frase final sobre
  "importação de coleções de outras ferramentas") para refletir
  importação/exportação do formato próprio.
- `.claude/fases/PROGRESSO.md` — marcar "Fase 8 - Concluída" ao final.
