# Plano de Execução — Fase 4

Esta fase não amplia o escopo funcional descrito em `CLAUDE.md` (verbos HTTP, coleções, ambientes, persistência etc.), que permanece coberto pelas fases 1-3. É uma fase de **UI pura**: mudar a forma como os parâmetros da requisição são apresentados no editor.

O escopo é pequeno o suficiente para não justificar arquivos de detalhamento em `plan/`: toda a implementação está descrita diretamente abaixo. Um agente executor deve seguir este arquivo sozinho.

## Problema atual

Em `src/request-editor.js`, `renderRequestEditor()` (L494-537) empilha, um abaixo do outro dentro de `.request-editor-form` (`display:flex; flex-direction:column`), quatro seções (`.editor-subsection`, cada uma com borda/fundo próprios): "Query Params", "Path Params", "Headers" e "Body". `#request-editor` é um `.panel` com `overflow-y: auto` (`src/styles.css:189-197`), então com as quatro seções preenchidas (várias linhas de chave/valor em cada uma, ou um body `raw` com `textarea` de 8 linhas) o usuário precisa rolar essa área inteira para alcançar, por exemplo, o Body — cada seção começa sempre visível e ocupando espaço, mesmo quando o que importa no momento é só uma delas.

O app já tem, no painel de resposta (`src/response-panel.js:94-132`, estilos em `src/styles.css:468-505`), um padrão de tab menu funcional (`.response-tabs` / `.response-tab-buttons` / `.response-tab-btn` / `.response-tab-panels` / `.response-tab-panel`, com `display:none` no painel inativo e troca de classe `active` no clique) que serve de referência visual e estrutural para esta fase — sem reaproveitar as mesmas classes CSS, para manter os dois componentes desacoplados (mesmo raciocínio que já separa `editor-*` de `response-*` no projeto).

## Objetivo

Substituir as quatro seções empilhadas por um único **tab menu** com quatro abas — Query Params, Path Params, Headers, Body — onde apenas o conteúdo da aba selecionada fica visível por vez. Escopo confirmado com o usuário: as quatro seções entram nas abas (não só query/path/body; Headers também sai do empilhamento, pelo mesmo motivo).

## Fora de escopo

- Contadores/badges nas abas (ex.: "Headers (3)" com a quantidade de linhas preenchidas).
- Navegação por teclado entre abas (setas esquerda/direita) — mantém o mesmo mecanismo simples de clique já usado no tab menu do painel de resposta; não há suporte a teclado lá também.
- Reordenar, ocultar ou tornar configurável quais abas aparecem.
- Qualquer mudança na estrutura de dados do rascunho (`draft` em `request-editor.js`), no formato enviado a `execute_http_request`/`update_request`, ou em qualquer comando/arquivo Rust (`src-tauri/`) — é puramente uma mudança de apresentação no frontend.
- Qualquer mudança no tab menu já existente no painel de resposta (`response-panel.js`/`.response-tab-*`), além de servir de referência de padrão visual.
- Mudança nos resizers/redimensionamento de painéis (fase 2) — o editor continua sendo a mesma área redimensionável de antes, só o conteúdo interno dela muda.
- Breakpoints ou ajustes específicos de responsividade/mobile — a aplicação é desktop (Tauri), sem esse requisito.

## Detalhes de implementação

### `src/request-editor.js`

1. **Estado da aba ativa**: nova variável de módulo `let activeParamsTab = "query";` (valores possíveis: `"query"`, `"path"`, `"headers"`, `"body"`), ao lado de `draft`/`running`/`saving`. Persiste entre chamadas de `renderRequestEditor()` (ex.: ao adicionar/remover uma linha ou trocar o tipo de body, que hoje já disparam um re-render completo) e também entre trocas de requisição via `loadRequestIntoEditor` — trocar de requisição selecionada na sidebar **não** deve resetar para a primeira aba; mantém a última aba que o usuário estava usando, por simplicidade (não há necessidade funcional de resetar).

2. **`createRowsSection`** (L153-214): adicionar parâmetro opcional `showTitle` (default `true`) ao objeto de opções. Quando `false`:
   - Não cria o `<h3>` de título dentro de `.editor-subsection-header` (o nome já aparece no botão da aba correspondente; repeti-lo dentro do conteúdo seria redundante).
   - Adiciona a classe `editor-subsection-header--tab` ao `header` (usada no CSS para alinhar o botão "+" sozinho à direita, já que sem o `<h3>` o `justify-content: space-between` original deixaria o botão colado à esquerda).
   - O botão "+" de adicionar linha continua normalmente (usa `title.toLowerCase()` internamente para o texto do `title` do botão — como `title` continua sendo passado como parâmetro mesmo com `showTitle:false`, o tooltip "Adicionar query params" etc. continua funcionando sem mudança).

3. **`buildKeyValueSection`** (L216-238): repassar `showTitle` recebido nas opções para `createRowsSection`.

4. **Chamadas às três seções de chave/valor** (Query Params, Path Params, Headers): passam a incluir `showTitle: false` (feito dentro da nova `buildParamsTabsSection`, ver item 6 — não nas chamadas atuais em `renderRequestEditor`, que serão removidas dali).

5. **`buildBodySection`** (L265-322): remover o bloco de cabeçalho (`.editor-subsection-header` com `<h3>Body</h3>`, L269-274) — sem botão "+" nesta seção, então o cabeçalho só existia para o título, que fica redundante com o nome da aba. O `<select>` de tipo passa a ser o primeiro filho de `section`.

6. **Nova função `buildParamsTabsSection()`**, substituindo em `renderRequestEditor()` as quatro chamadas empilhadas atuais (L506-534). Monta a estrutura de tabs seguindo o mesmo padrão de `response-panel.js:94-132`:
   ```js
   function buildParamsTabsSection() {
     const wrapper = document.createElement("div");
     wrapper.className = "editor-tabs";

     const tabButtons = document.createElement("div");
     tabButtons.className = "editor-tab-buttons";

     const tabPanels = document.createElement("div");
     tabPanels.className = "editor-tab-panels";

     const tabs = [
       {
         id: "query",
         label: "Query Params",
         panel: buildKeyValueSection({
           title: "Query Params",
           showTitle: false,
           list: draft.queryParams,
           keyPlaceholder: "chave",
           valuePlaceholder: "valor",
         }),
       },
       {
         id: "path",
         label: "Path Params",
         panel: buildKeyValueSection({
           title: "Path Params",
           showTitle: false,
           description: "Use {nome} na URL para indicar onde o valor será inserido.",
           list: draft.pathParams,
           keyPlaceholder: "nome",
           valuePlaceholder: "valor",
         }),
       },
       {
         id: "headers",
         label: "Headers",
         panel: buildKeyValueSection({
           title: "Headers",
           showTitle: false,
           list: draft.headers,
           keyPlaceholder: "chave",
           valuePlaceholder: "valor",
         }),
       },
       { id: "body", label: "Body", panel: buildBodySection() },
     ];

     tabs.forEach((tab) => {
       const btn = document.createElement("button");
       btn.type = "button";
       btn.className = "editor-tab-btn";
       btn.textContent = tab.label;
       if (tab.id === activeParamsTab) btn.classList.add("active");
       btn.addEventListener("click", () => {
         activeParamsTab = tab.id;
         tabButtons.querySelectorAll(".editor-tab-btn").forEach((b) => b.classList.remove("active"));
         btn.classList.add("active");
         tabPanels.querySelectorAll(".editor-tab-panel").forEach((p) => p.classList.remove("active"));
         tab.panel.classList.add("active");
       });
       tabButtons.appendChild(btn);

       tab.panel.classList.add("editor-tab-panel");
       if (tab.id === activeParamsTab) tab.panel.classList.add("active");
       tabPanels.appendChild(tab.panel);
     });

     wrapper.appendChild(tabButtons);
     wrapper.appendChild(tabPanels);
     return wrapper;
   }
   ```
   Ponto importante: a troca de aba (clique no botão) só alterna classes via `querySelectorAll`/`classList`, sem chamar `renderRequestEditor()` — mesmo padrão do painel de resposta, evita reconstruir todo o formulário (e perder foco de algum campo) só por causa da troca de aba. Cada `.editor-subsection` retornado por `buildKeyValueSection`/`buildBodySection` recebe a classe adicional `editor-tab-panel` (mantém a aparência de "cartão" — borda, padding, fundo — já usada hoje) mais `active` quando corresponde a `activeParamsTab`.

7. **`renderRequestEditor()`** (L494-537): trocar o bloco que hoje monta as quatro seções empilhadas (L506-534) por:
   ```js
   form.appendChild(buildParamsTabsSection());
   ```
   mantendo `form.appendChild(buildToolbar());` como primeiro filho, igual hoje.

### `src/styles.css`

Nova seção `/* Tabs de parâmetros do editor (fase 4) */`, logo após a seção "Request editor (atividade 9)" existente (após a regra `.body-raw-textarea.has-variable`, L393-396):

```css
.editor-tabs {
  display: flex;
  flex-direction: column;
  max-width: 900px;
}

.editor-tab-buttons {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.75rem;
}

.editor-tab-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  padding: 0.5rem 0.8rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.editor-tab-btn:hover {
  color: var(--color-text);
}

.editor-tab-btn.active {
  color: var(--color-text);
  border-bottom-color: var(--color-accent);
}

.editor-tab-panel {
  display: none;
}

.editor-tab-panel.active {
  display: block;
}

.editor-subsection-header--tab {
  justify-content: flex-end;
}
```

Valores (cores, paddings, tamanhos de fonte) espelham deliberadamente `.response-tab-buttons`/`.response-tab-btn`/`.response-tab-panel` (`src/styles.css:468-505`) para os dois tab menus da aplicação parecerem parte do mesmo sistema visual, mesmo sem compartilhar classes.

`.request-editor-form` (L230-235) não muda — já tem `max-width: 900px` e `gap: 1.25rem` entre `.editor-toolbar` e `.editor-tabs` (os dois únicos filhos diretos agora).

## Critérios de aceite

- O editor de requisição mostra um único tab menu logo abaixo da barra de método/URL/Salvar/Enviar, com quatro abas: "Query Params", "Path Params", "Headers", "Body".
- Apenas o conteúdo da aba selecionada é exibido por vez; clicar em outra aba troca o conteúdo visível imediatamente, sem precisar rolar a tela para encontrar Body (ou qualquer outra seção) quando as demais estão preenchidas com várias linhas.
- Trocar de aba não descarta nem reseta dados já digitados nas outras abas — voltar para uma aba anterior mostra os valores exatamente como foram deixados.
- Adicionar/remover uma linha em Query Params, Path Params ou Headers, ou trocar o tipo de Body (`none`/`raw`/`x-www-form-urlencoded`/`form-data`), mantém a aba atualmente selecionada em foco depois do re-render (não pula de volta para "Query Params").
- Trocar de requisição selecionada na sidebar (`loadRequestIntoEditor`) carrega os dados normalmente nas quatro abas, sem quebrar a aba atualmente ativa.
- O indicador visual de uso de `{{variavel}}` (`applyVariableIndicator`) continua funcionando normalmente em cada campo, dentro de cada aba.
- Nenhuma mudança perceptível fora do editor de requisição: sidebar, painel de resposta e resizers (fase 2) continuam se comportando exatamente como antes.
- Nenhuma mudança em `src-tauri/`, nos comandos Tauri invocados, ou no formato de dados enviado/recebido (`buildHttpRequestInput`, `buildSavedRequestPayload`, `normalizeIncomingRequest`) — a fase é só de apresentação.

## Entregáveis

- `src/request-editor.js` atualizado: estado `activeParamsTab`, `showTitle` em `createRowsSection`/`buildKeyValueSection`, `buildBodySection` sem cabeçalho redundante, nova `buildParamsTabsSection()`, `renderRequestEditor()` usando o tab menu no lugar das quatro seções empilhadas.
- `src/styles.css` atualizado com a nova seção de estilos do tab menu do editor (`.editor-tabs`, `.editor-tab-buttons`, `.editor-tab-btn`, `.editor-tab-panel`, `.editor-subsection-header--tab`).
- Editor de requisição com Query Params, Path Params, Headers e Body organizados em abas, eliminando a rolagem vertical de seções empilhadas para alternar entre esses parâmetros.
