// Importação/exportação de uma coleção inteira via arquivo JSON (fase 8).
//
// A exportação usa o comando `export_collection_to_json` (já existente no
// backend desde a fase 2, agora ligado à UI); a importação usa o novo
// `import_collection_from_json`. Os dois abrem um diálogo nativo do sistema
// para o usuário escolher o arquivo/pasta. A importação sempre cria uma
// coleção nova (ids regenerados no backend).
//
// Este módulo não guarda estado: devolve o resultado ao host (main.js), que
// cuida de inserir a coleção importada em `state.collections` e re-renderizar.
import { showAlert } from "./modal.js";
import { buildActionMenu } from "./action-menu.js";

function invoke(command, args) {
  return window.__TAURI__.core.invoke(command, args);
}

// Ícone (currentColor) do gatilho "Exportação" — seta para cima saindo de uma
// bandeja (espelho do ícone de importação).
const ICON_EXPORT =
  '<svg class="action-menu-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<path fill="currentColor" d="M7.47 1.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1-1.06 1.06L8.75 4.06v6.69a.75.75 0 0 1-1.5 0V4.06L5.53 5.78a.75.75 0 0 1-1.06-1.06l3-3Z"/>' +
  '<path fill="currentColor" d="M2.75 9.5a.75.75 0 0 1 .75.75v2A.75.75 0 0 0 4.25 13h7.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 11.75 14.5h-7.5A2.25 2.25 0 0 1 2 12.25v-2a.75.75 0 0 1 .75-.75Z"/>' +
  "</svg>";

/**
 * Abre o diálogo nativo de seleção de arquivo e importa a coleção do JSON
 * escolhido. Retorna o objeto `Collection` criado, ou `null` se o usuário
 * cancelar o diálogo ou se ocorrer um erro (já exibido em um alerta).
 */
export async function importCollectionFromJson() {
  try {
    const collection = await invoke("import_collection_from_json");
    return collection ?? null;
  } catch (error) {
    await showAlert({ title: "Erro ao importar coleção", message: String(error) });
    return null;
  }
}

/**
 * Abre o diálogo nativo de salvamento e exporta a coleção informada para o
 * arquivo JSON escolhido. Em caso de sucesso, mostra um alerta com o caminho
 * do arquivo gravado; se o usuário cancelar, nada acontece.
 */
export async function exportCollectionToJson(collectionId) {
  try {
    const path = await invoke("export_collection_to_json", { collectionId });
    if (path) {
      await showAlert({ title: "Coleção exportada", message: `Arquivo salvo em:\n${path}` });
    }
  } catch (error) {
    await showAlert({ title: "Erro ao exportar coleção", message: String(error) });
  }
}

/**
 * Monta o menu "Exportação" da action bar global. Quando há uma coleção
 * selecionada, o dropdown tem um item com o nome dela (ex.:
 * `Coleção "Minha API" (JSON)`); sem coleção selecionada, o gatilho fica
 * desabilitado.
 *
 * @param {object}   opts
 * @param {object|null} opts.collection  a coleção selecionada (ou null)
 * @param {(collection: object) => void} opts.onExport
 * @returns {HTMLElement}
 */
export function buildCollectionExportMenu({ collection, onExport }) {
  const hasCollection = Boolean(collection);
  return buildActionMenu({
    label: "Exportação",
    title: hasCollection
      ? `Exportar a coleção "${collection.name}" para um arquivo JSON`
      : "Selecione uma coleção para exportar",
    iconSvg: ICON_EXPORT,
    disabled: !hasCollection,
    items: hasCollection
      ? [
          {
            label: `Coleção "${collection.name}" (JSON)`,
            title: "Escolher onde salvar o arquivo .json da coleção",
            onSelect: () => onExport(collection),
          },
        ]
      : [],
  });
}
