# Plano de Execução — Fase 3

Esta fase não amplia o escopo funcional descrito em `CLAUDE.md`. É uma **correção de bug**: a sidebar (seção "Coleções" e "Requisições") não tinha nenhuma integração real com os comandos Tauri de gerenciamento de coleções/requisições — não dava para criar coleção, excluir coleção, criar requisição nem excluir requisição, embora o backend já implementasse tudo isso. Além disso, o editor de requisição (`request-editor.js`) nunca esteve de fato ligado à seleção da sidebar: trocar a requisição selecionada não recarregava seus dados no editor, e não havia nenhuma forma de persistir as edições feitas nele — o botão "Enviar" só executava a requisição pontualmente, sem gravar nada em disco.

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

> Nota: a fase começou cobrindo só "criar coleção" e foi ampliada, ainda dentro da mesma fase (a pedido do usuário, por ser um conjunto de mudanças pequeno e correlato), primeiro para cobrir "excluir coleção", "criar requisição" e "excluir requisição", depois para corrigir a falta de sincronização real entre a sidebar e o editor de requisição (seleção carrega os dados; botão "Salvar" persiste via `update_request`), e por fim para o painel de resposta também acompanhar a requisição selecionada (antes mostrava sempre a resposta da última requisição enviada, independente de qual estivesse selecionada na sidebar).

## Causa raiz (já investigada — não repetir a investigação)

**Não é um bug de binding entre Rust e JS.** Todos os comandos Tauri usados nesta fase já estão corretamente:

- Implementados em `src-tauri/src/collections.rs`: `create_collection` (L37-48), `delete_collection` (L86-89), `create_request` (L103-121), `update_request` (L136-162), `delete_request` (L164-176).
- Expostos como `#[tauri::command]` em `src-tauri/src/commands.rs`: `create_collection`, `delete_collection`, `create_request`, `update_request`, `delete_request`.
- Registrados no `invoke_handler!` em `src-tauri/src/lib.rs`.

Os botões existem em `src/index.html` (`#new-collection-btn` na L20, `#new-request-btn` na L35), mas **`src/main.js` nunca ligava o clique desses botões a nenhuma chamada `invoke`**, e as listas renderizadas (`renderCollectionsList`/`renderRequestsList`) não tinham nenhum controle de exclusão por item.

Separadamente, `request-editor.js` já expunha `loadRequestIntoEditor(requestData)` desde a atividade 9, mas **nada em `main.js` chamava essa função** — `selectRequest(requestId)` só atualizava `state.selectedRequestId` e re-renderizava a sidebar, nunca o editor. O editor também não tinha noção de "qual requisição salva está aberta", então não havia como persistir de volta: só existia `execute_http_request` (disparo pontual), nunca `update_request`.

Ou seja: o bug é de **frontend incompleto** (falta de implementação em `main.js`/`request-editor.js`), não de binding quebrado entre as camadas — mesmo diagnóstico já validado na primeira parte da fase (criar coleção), agora confirmado também para os fluxos de exclusão, criação de requisição, seleção real na sidebar e persistência via "Salvar".

## Objetivo

1. Ao clicar em `#new-collection-btn`, pedir o nome da nova coleção, chamar `create_collection`, e atualizar a sidebar para exibir a coleção recém-criada (já selecionada).
2. Ao iniciar a aplicação (`DOMContentLoaded`), carregar as coleções já persistidas via `list_collections`, para que `state.collections` reflita o estado real em disco em vez de começar sempre vazio.
3. Cada item da lista de coleções ganha um botão de exclusão; ao clicar, pedir confirmação em modal customizado e, se confirmado, chamar `delete_collection` e remover a coleção da sidebar (e, se era a selecionada, limpar a seleção).
4. Ao clicar em `#new-request-btn` (habilitado apenas com uma coleção selecionada), pedir o nome da nova requisição, chamar `create_request` com valores padrão (`GET`, URL vazia, sem params/headers/body), e atualizar a lista de requisições da coleção selecionada (já selecionada).
5. Cada item da lista de requisições ganha um botão de exclusão; ao clicar, pedir confirmação em modal customizado e, se confirmado, chamar `delete_request` e remover a requisição da lista (e, se era a selecionada, limpar a seleção).
6. Ao selecionar uma requisição diferente na sidebar (ou trocar/excluir a coleção, ou criar uma nova requisição/coleção), o editor de requisição deve carregar os dados reais da requisição selecionada (`method`, `url`, `query_params`, `path_params`, `headers`, `body`) — hoje a seleção na sidebar não tinha efeito nenhum sobre o editor.
7. O editor de requisição ganha um botão "Salvar" que persiste o rascunho atual de volta na requisição selecionada via `update_request`, habilitado apenas quando existe uma requisição salva carregada no editor (desabilitado com o editor em branco, sem seleção).
8. O painel de resposta acompanha a requisição selecionada: ao trocar de requisição, mostra o último resultado (`running`/`response`/`error`) que aquela requisição específica teve nesta sessão, ou o estado vazio se ela nunca foi enviada — hoje o painel sempre continuava mostrando a resposta da última requisição enviada, mesmo depois de trocar a seleção para outra requisição.

## Fora de escopo

- Renomear coleção (`rename_collection`) ou renomear uma requisição existente pela UI — o nome só é definido na criação (via `showPrompt`); o campo `name` não é editável no editor de requisição, então "Salvar" sempre reenvia o nome atual sem alterá-lo.
- Qualquer mudança em `src-tauri/` — o backend já está correto e completo para estas operações (incluindo `update_request`, que já existia); a fase é só de integração no frontend.
- Indicador visual de "alterações não salvas" (dirty state) no item da sidebar ou no editor — o botão "Salvar" persiste a qualquer momento; não há aviso ao trocar de requisição com edições pendentes e não gravadas (o rascunho em memória é simplesmente descartado ao trocar a seleção).
- Salvar automaticamente (auto-save) ao trocar de requisição ou perder o foco de um campo — o salvamento é sempre uma ação explícita do usuário (clique em "Salvar").
- Persistir o histórico/última resposta de cada requisição em disco — o cache de respostas por requisição (`responseCache` em `main.js`) existe só em memória da sessão atual; fechar e reabrir a aplicação não restaura a última resposta vista, cada requisição volta ao estado vazio até ser enviada novamente.
- Validação avançada de nome (duplicados, caracteres especiais, limite de tamanho) além de recusar nome vazio.
- Estados de loading visual (spinner, desabilitar botão durante a chamada) — as operações são locais e rápidas; não é o foco do bug reportado.
- Sistema de notificação genérico (toasts, banners) — o modal criado nesta fase cobre apenas prompt de nome, confirmação de exclusão e exibição de erro pontual, usados aqui.
- Estilização diferenciada (ex.: cor de destaque/"perigo") para o botão de confirmação de exclusão no modal — reaproveita o mesmo `.modal-btn-primary` já existente.

## Detalhes de implementação

### `src/modal.js` (novo)

Componente de modal customizado, no mesmo tema visual (cores, bordas, tipografia) do restante da aplicação — substitui `window.prompt`/`window.alert`, que não seguem o tema da aplicação e "ficam ruins" visualmente. Expõe duas funções assíncronas baseadas em Promise, operando sobre marcação fixa já presente em `index.html` (não cria elementos dinamicamente, seguindo o padrão de outras seções que só alternam visibilidade de elementos existentes):

- `showPrompt({ title, message, placeholder, inputValue, confirmLabel })` → `Promise<string | null>`. Retorna a string digitada ao confirmar (Enter no campo ou clique em confirmar), ou `null` se cancelado (botão Cancelar, tecla Escape, ou clique fora do modal).
- `showAlert({ title, message })` → `Promise<void>`. Modal só com botão de confirmação (sem campo de texto, sem botão cancelar).
- `showConfirm({ title, message, confirmLabel })` → `Promise<boolean>`. Modal sem campo de texto, com os botões "Cancelar" e confirmar; usado nas confirmações de exclusão de coleção/requisição. Resolve `true` só quando o botão de confirmação é clicado; Cancelar, Escape ou clique fora resolvem `false`.

As três reutilizam a mesma marcação (`#modal-overlay`), alternando `hidden`/visibilidade do campo de texto e do botão "Cancelar" conforme o caso.

### `src/index.html`

Adicionar, como filho direto de `<body>` (fora de `#app`, para não ser afetado pelo layout flex do app), a marcação fixa do modal, inicialmente oculta (`style="display: none;"` no overlay):

```html
<div id="modal-overlay" class="modal-overlay" style="display: none;">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h3 id="modal-title" class="modal-title"></h3>
    <p id="modal-message" class="modal-message"></p>
    <input id="modal-input" class="modal-input" type="text" hidden />
    <div class="modal-actions">
      <button id="modal-cancel-btn" class="modal-btn modal-btn-secondary" type="button">Cancelar</button>
      <button id="modal-confirm-btn" class="modal-btn modal-btn-primary" type="button">OK</button>
    </div>
  </div>
</div>
```

### `src/styles.css`

Nova seção `/* Modal (fase 3) */` ao final do arquivo, reutilizando as variáveis de tema já definidas em `:root` (`--color-bg`, `--color-bg-panel`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`) e o mesmo vocabulário visual do restante do app (`border-radius: 4-6px`, tamanhos de fonte entre `0.85rem` e `1rem`, mesmo padrão de botão usado em `.send-btn`/`.icon-btn`): overlay em tela cheia com fundo semitransparente, caixa centralizada (`.modal`), título, mensagem opcional, campo de texto opcional e dois botões de ação (primário/secundário).

Também ajustadas `.collections-list li`/`.requests-list li` (existentes) para layout flex (nome + botão de excluir lado a lado), com duas classes novas:

- `.list-item-name`: `flex: 1; min-width: 0;` + o `white-space`/`overflow`/`text-overflow` que antes estava direto no `li`, para o nome truncar com reticências sem empurrar o botão de excluir.
- `.list-item-delete-btn`: botão discreto (sem borda, `opacity: 0.6` em repouso, `opacity: 1` + leve fundo escuro no hover), herda `color: inherit` para acompanhar a cor do texto quando o item está `.active`.

### `src/main.js`

1. **Helper de invocação**, no mesmo padrão usado em `src/request-editor.js:24-26` (o frontend não usa bundler, então acessa a API global `window.__TAURI__.core.invoke` em vez de importar `@tauri-apps/api`):
   ```js
   function invoke(command, args) {
     return window.__TAURI__.core.invoke(command, args);
   }
   ```

2. **Carregar coleções ao iniciar**: nova função `async function loadCollections()` que chama `invoke("list_collections")`, atribui o resultado a `state.collections` e chama `render()`. Tratar falha da chamada com `try/catch`, exibindo o erro via `showAlert({ title, message })` (importado de `./modal.js`).

3. **Criar nova coleção**: nova função `async function createCollection()` chamada pelo listener de clique de `#new-collection-btn`:
   - `await showPrompt({ title: "Nova coleção", message: "Informe o nome da nova coleção.", placeholder: "Nome da coleção", confirmLabel: "Criar" })` para obter o nome.
   - Se o usuário cancelar (`null`) ou o nome, após `.trim()`, for vazio, não faz nada (sem alerta de erro — cancelamento não é uma falha).
   - Chama `invoke("create_collection", { name })` (nome já com `.trim()` aplicado).
   - Em caso de sucesso: adiciona a coleção retornada a `state.collections`, seleciona-a (`state.selectedCollectionId = collection.id`) e chama `render()`.
   - Em caso de erro: exibir via `showAlert({ title: "Erro ao criar coleção", message: String(error) })`.

4. **Listener do botão**: dentro do listener de `DOMContentLoaded` (onde hoje já ficam `render()`, `renderRequestEditor()`, etc.), adicionar:
   ```js
   document.getElementById("new-collection-btn").addEventListener("click", createCollection);
   await loadCollections();
   ```
   Atenção à ordem: `loadCollections()` deve popular `state.collections` e re-renderizar *antes* ou *depois* de `renderRequestEditor()`/`renderInitialResponsePanel()` sem depender deles — esses módulos não leem `state.collections`, então a ordem entre eles é livre; o importante é que os listeners de clique sejam registrados uma única vez (não dentro de `render()`, que já é re-executado a cada mudança de estado).

5. O comentário de cabeçalho do arquivo (linhas 10-13) descreve `collections` como array vazio "por enquanto" até a atividade 5 integrar os comandos Tauri — esse comentário está desatualizado (a atividade 5, fase 1, já existe no backend) e deve ser removido/atualizado para refletir que a integração agora está feita.

6. **`renderCollectionsList()`/`renderRequestsList()`**: cada `<li>` passa a ter dois filhos, em vez de só `textContent`: um `<span class="list-item-name">` com o nome (mantendo o `<li>` como alvo do clique de seleção) e um `<button class="list-item-delete-btn">×</button>` com `title` apropriado. O clique no botão de excluir chama `event.stopPropagation()` antes de disparar `deleteCollection`/`deleteRequest`, para não também selecionar o item.

7. **Excluir coleção**: nova função `async function deleteCollection(collectionId, collectionName)`, chamada pelo botão de excluir de cada item da lista de coleções:
   - `await showConfirm({ title: "Excluir coleção", message: 'Tem certeza que deseja excluir a coleção "<nome>"? Todas as requisições salvas nela também serão removidas.', confirmLabel: "Excluir" })`.
   - Se não confirmado, não faz nada.
   - Chama `invoke("delete_collection", { id: collectionId })`.
   - Em caso de sucesso: remove a coleção de `state.collections`; se era a coleção selecionada, limpa `selectedCollectionId` e `selectedRequestId`; chama `render()`.
   - Em caso de erro: `showAlert({ title: "Erro ao excluir coleção", message: String(error) })`.

8. **Criar nova requisição**: nova função `async function createRequest()`, chamada pelo listener de clique de `#new-request-btn` (o botão já fica desabilitado sem coleção selecionada, então a função só precisa de uma guarda defensiva `if (!collection) return;`):
   - `await showPrompt({ title: "Nova requisição", message: "Informe o nome da nova requisição.", placeholder: "Nome da requisição", confirmLabel: "Criar" })` para obter o nome.
   - Cancelamento ou nome em branco (após `.trim()`): não faz nada.
   - Chama `invoke("create_request", { collectionId: collection.id, request: { name, method: "GET", url: "", query_params: [], path_params: [], headers: [], body: { type: "none" } } })` — os nomes dos campos dentro de `request` seguem o mesmo `snake_case` usado por `request-editor.js` em `buildHttpRequestInput()` (o objeto é desserializado direto numa struct Rust sem `rename_all`), enquanto o argumento de nível superior do comando usa `collectionId` em camelCase (convenção padrão do Tauri para nomes de parâmetro de comando).
   - Em caso de sucesso: adiciona a requisição retornada a `collection.requests`, seleciona-a (`state.selectedRequestId = request.id`) e chama `render()`.
   - Em caso de erro: `showAlert({ title: "Erro ao criar requisição", message: String(error) })`.

9. **Excluir requisição**: nova função `async function deleteRequest(collectionId, requestId, requestName)`, chamada pelo botão de excluir de cada item da lista de requisições:
   - `await showConfirm({ title: "Excluir requisição", message: 'Tem certeza que deseja excluir a requisição "<nome>"?', confirmLabel: "Excluir" })`.
   - Se não confirmado, não faz nada.
   - Chama `invoke("delete_request", { collectionId, requestId })`.
   - Em caso de sucesso: remove a requisição de `collection.requests`; se era a requisição selecionada, limpa `selectedRequestId`; chama `render()`.
   - Em caso de erro: `showAlert({ title: "Erro ao excluir requisição", message: String(error) })`.

10. **Listener do botão de nova requisição**: dentro do listener de `DOMContentLoaded`, ao lado do listener de `new-collection-btn`:
    ```js
    document.getElementById("new-request-btn").addEventListener("click", createRequest);
    ```

11. **Sincronizar o editor com a seleção**: novas funções `getSelectedRequest()` (procura, na coleção selecionada, a requisição cujo `id` é `state.selectedRequestId`) e `syncEditorWithSelection()` (chama `loadRequestIntoEditor(getSelectedRequest(), { collectionId: state.selectedCollectionId })`, importado de `request-editor.js`). Chamada após toda mutação de `selectedCollectionId`/`selectedRequestId` ou da lista de requisições da coleção selecionada: `selectCollection`, `selectRequest`, `createCollection`, `deleteCollection`, `createRequest`, `deleteRequest`, e uma vez após `loadCollections()` no `DOMContentLoaded` (`loadCollections().then(syncEditorWithSelection)`).

12. **Sincronizar a cópia local após salvar**: nova função `handleRequestSaved(updatedRequest)`, registrada via `setRequestSavedListener` (exportado por `request-editor.js`) no `DOMContentLoaded`. Substitui, em `collection.requests` (coleção atualmente selecionada), a requisição cujo `id` bate com `updatedRequest.id` pelo objeto retornado por `update_request` — mantém `state.collections` consistente com o disco sem precisar recarregar tudo via `list_collections`.

13. **Painel de resposta por requisição**: `const responseCache = new Map()` (módulo, indexado por `requestId`, com `null` representando o rascunho sem requisição salva selecionada) guarda o último payload de execução (`{ running, response, error }`, sem o `requestId`) de cada requisição.
    - `setRequestStateListener` passa a apontar para `handleEditorStateChange(payload)` (em vez de `handleRequestStateChange` de `response-panel.js` diretamente): desestrutura `requestId` do payload, grava o restante em `responseCache`, e só chama `handleRequestStateChange` (repassando ao painel) se `requestId === state.selectedRequestId` — evita que a resposta de uma requisição enviada e depois trocada apareça no painel de outra requisição selecionada em seguida.
    - `syncEditorWithSelection()` (já usada para sincronizar o editor) também chama `handleRequestStateChange(responseCache.get(state.selectedRequestId) || {})`, restaurando o último resultado daquela requisição (ou o estado vazio, via `{}`, que `handleRequestStateChange` já trata como "sem execução ainda").
    - `deleteRequest` remove a entrada correspondente de `responseCache` ao excluir a requisição.

### `src/request-editor.js` (continuação)

5. **`requestId` no payload de `onRequestStateChange`**: `handleSendRequest` captura `currentMeta.requestId` no início da função (antes do `await`, pelo mesmo motivo do `handleSaveRequest`: o usuário pode trocar de requisição selecionada enquanto o envio está em voo) e inclui esse valor em todas as chamadas de `notifyStateChange` (`{ running: true, requestId }`, `{ running: false, response, requestId }`, `{ running: false, error, requestId }`).

### `src/request-editor.js`

1. **`loadRequestIntoEditor(savedRequest, meta)`** (assinatura alterada — antes só recebia `requestData` num formato próprio do editor que nunca era realmente produzido por nenhum chamador): agora recebe o formato `SavedRequest` retornado pelo backend (`query_params`/`path_params`/`headers` como arrays de pares `[chave, valor]`, `body` como enum `{ type, ... }`) e um `meta.collectionId`. Se `savedRequest` for `null` (nenhuma requisição selecionada), limpa o rascunho (`createEmptyDraft()`). Guarda `{ collectionId, requestId: savedRequest.id, name: savedRequest.name }` em `currentMeta` (módulo interno), usado depois para saber que requisição salvar e habilitar/desabilitar o botão "Salvar".
2. **`normalizeIncomingRequest`** reescrita para converter esse formato do backend (antes convertia de um formato hipotético em `camelCase`/`bodyType` que nenhum código produzia) — novas funções auxiliares `pairsToRowList` (array de pares → linhas `{ key, value }`) e `formDataFieldsToRowList` (`{ name, value, file_path }` → `{ name, value, filePath }`).
3. **Botão "Salvar"**, adicionado na toolbar entre o campo de URL e o botão "Enviar" (`.save-btn`): desabilitado quando não há `currentMeta.requestId` (nenhuma requisição salva carregada) ou durante o próprio salvamento. Ao clicar, chama `handleSaveRequest(button)`:
   - Monta o payload via `buildSavedRequestPayload()` (mesmos campos de `buildHttpRequestInput()`, trocando `timeout_ms` por `name: currentMeta.name` — o nome não é editável nesta fase, então é sempre reenviado sem alteração).
   - Chama `invoke("update_request", { collectionId: currentMeta.collectionId, requestId: currentMeta.requestId, request: payload })`.
   - Sucesso: texto do botão muda brevemente para "Salvo!" (reset após 1.2s) e notifica o host via `onRequestSaved` (`setRequestSavedListener`). Guarda contra o usuário trocar de requisição durante o salvamento em andamento (compara `currentMeta === meta` capturado no início da função antes de sobrescrever `currentMeta.name`).
   - Erro: `showAlert({ title: "Erro ao salvar requisição", message: String(error) })` (import de `./modal.js`, novo nesta fase para este módulo).
4. **`setRequestSavedListener(listener)`**: exportada nos mesmos moldes de `setRequestStateListener`, para o host (`main.js`) reagir a um salvamento bem-sucedido.

## Critérios de aceite

- Ao clicar em "+" na seção "Coleções", informar um nome no modal customizado e confirmar: a nova coleção aparece imediatamente na lista da sidebar, já selecionada.
- Cancelar o modal (botão "Cancelar", tecla Escape ou clique fora da caixa) ou confirmar com nome em branco/só espaços não cria coleção nem exibe erro.
- Cada coleção na sidebar tem um botão de excluir; clicar nele abre um modal de confirmação customizado. Confirmar remove a coleção (e suas requisições) da sidebar e do disco; cancelar não faz nada. Excluir a coleção selecionada limpa a seleção de coleção e requisição.
- Com uma coleção selecionada, `#new-request-btn` fica habilitado; ao clicar, informar um nome no modal customizado e confirmar cria uma requisição com valores padrão (`GET`, URL vazia) que aparece imediatamente na lista de requisições, já selecionada.
- Cada requisição na lista tem um botão de excluir; clicar nele abre um modal de confirmação customizado. Confirmar remove a requisição da lista e do disco; cancelar não faz nada. Excluir a requisição selecionada limpa a seleção de requisição.
- O modal (prompt, alerta e confirmação) segue visualmente o tema escuro da aplicação (mesmas cores, bordas e tipografia do restante da UI) — nenhum `window.prompt`/`window.alert`/`window.confirm` nativo do navegador é usado em nenhum destes fluxos.
- Reabrir a aplicação exibe as coleções (e suas requisições) criadas em sessões anteriores (persistência real sendo refletida na UI, via `list_collections` no carregamento).
- Selecionar uma requisição diferente na sidebar substitui imediatamente o conteúdo do editor (método, URL, query/path params, headers, body) pelos dados reais daquela requisição salva. Selecionar outra coleção, criar uma nova requisição/coleção ou excluir a requisição/coleção aberta também atualiza o editor de forma coerente (limpa quando não sobra nenhuma requisição selecionada).
- Com uma requisição salva carregada no editor, o botão "Salvar" fica habilitado; editar qualquer campo e clicar em "Salvar" persiste as alterações via `update_request` — reabrir a aplicação (ou selecionar outra requisição e voltar) mostra os dados já editados. Sem nenhuma requisição carregada (editor em branco), "Salvar" fica desabilitado.
- Enviar a requisição A (botão "Enviar"), depois selecionar a requisição B: o painel de resposta mostra o estado vazio (ou a última resposta de B, se ela já tiver sido enviada antes) — nunca a resposta de A. Selecionar A novamente restaura a resposta de A tal como ficou.
- Nenhuma mudança em `src-tauri/` — a fase é restrita à integração no frontend.

## Entregáveis

- `src/modal.js` (novo): componente de modal customizado (`showPrompt`, `showAlert`, `showConfirm`).
- `src/index.html` atualizado com a marcação fixa do modal.
- `src/styles.css` atualizado com o estilo do modal, dos botões de excluir por item de lista e do botão "Salvar" do editor, no mesmo tema visual da aplicação.
- `src/main.js` atualizado conforme acima (função `invoke`, `loadCollections`, `createCollection`, `deleteCollection`, `createRequest`, `deleteRequest` usando o modal customizado, listeners dos botões, `getSelectedRequest`/`syncEditorWithSelection`/`handleRequestSaved` ligando a sidebar ao editor, `responseCache`/`handleEditorStateChange` ligando a sidebar ao painel de resposta, chamada inicial no `DOMContentLoaded`, comentário de cabeçalho corrigido).
- `src/request-editor.js` atualizado: `loadRequestIntoEditor` agora recebe o formato real de `SavedRequest`, botão "Salvar" persistindo via `update_request`, `setRequestSavedListener` para notificar o host, `requestId` incluído no payload de `onRequestStateChange`.
