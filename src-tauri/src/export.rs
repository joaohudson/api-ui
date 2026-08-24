//! Exportação de coleção para arquivo JSON.
//! Implementado na atividade 7 (exportação em JSON).
//!
//! Formato de exportação: um único arquivo JSON contendo a coleção (com suas
//! requisições salvas) e a lista completa dos ambientes associados a ela
//! (dados que, durante o uso normal do app, ficam espalhados em arquivos
//! separados — `collections/<id>.json` e `environments/<id>.json`, via
//! `crate::persistence`). A exportação junta tudo em um único documento
//! autocontido, para que o usuário possa guardar/compartilhar a coleção fora
//! do app.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::collections::{self, CollectionsError};
use crate::environments::{self, Environment, EnvironmentsError};
use crate::models::Collection;

/// Erros das operações de exportação de coleção.
#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error(transparent)]
    Collections(#[from] CollectionsError),
    #[error(transparent)]
    Environments(#[from] EnvironmentsError),
    #[error("falha ao serializar a coleção para JSON: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("falha ao escrever o arquivo exportado em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

pub type Result<T> = std::result::Result<T, ExportError>;

/// Formato serializado de exportação de uma coleção: a coleção (com suas
/// requisições) e os dados completos de cada ambiente referenciado por ela.
///
/// Este é o contrato do arquivo JSON gerado pela exportação — usado apenas
/// para leitura futura (fora do escopo desta atividade) ou compartilhamento
/// manual do arquivo pelo usuário. `collection` já traz a referência aos ids
/// de ambiente (`Collection::environments`, do tipo `EnvironmentRef`); o campo
/// `environments` aqui complementa essa referência com os dados completos
/// (nome e variáveis) de cada ambiente, por isso usa um nome diferente para
/// não colidir com o campo já existente em `Collection`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CollectionExport {
    #[serde(flatten)]
    pub collection: Collection,
    pub environment_data: Vec<Environment>,
}

/// Monta a estrutura de exportação de uma coleção: os dados da coleção (que já
/// incluem as requisições salvas) mais os dados completos de cada ambiente
/// associado a ela.
fn build_export(app: &AppHandle, collection_id: &str) -> Result<CollectionExport> {
    let collection = collections::get_collection(app, collection_id)?;
    let environments = environments::list_environments(app, collection_id)?;

    Ok(CollectionExport {
        collection,
        environment_data: environments,
    })
}

/// Exporta uma coleção (requisições, ambientes e variáveis) para um arquivo
/// JSON, perguntando ao usuário onde salvar via diálogo nativo do Tauri.
///
/// Retorna `Ok(None)` se o usuário cancelar o diálogo de salvamento, e
/// `Ok(Some(caminho))` com o caminho do arquivo gravado em caso de sucesso.
pub async fn export_collection_to_json(
    app: &AppHandle,
    collection_id: &str,
) -> Result<Option<String>> {
    let export = build_export(app, collection_id)?;
    let json = serde_json::to_string_pretty(&export)?;

    let default_file_name = format!("{}.json", sanitize_file_name(&export.collection.name));

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_file_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let file_path_display = file_path.to_string();
    let path_buf = file_path.into_path().map_err(|e| ExportError::Io {
        path: file_path_display,
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, e.to_string()),
    })?;

    std::fs::write(&path_buf, json).map_err(|source| ExportError::Io {
        path: path_buf.display().to_string(),
        source,
    })?;

    Ok(Some(path_buf.display().to_string()))
}

/// Remove caracteres inadequados para nome de arquivo a partir do nome da
/// coleção, para sugerir um nome de arquivo padrão razoável no diálogo de
/// salvamento.
fn sanitize_file_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect();

    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "colecao".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitiza_caracteres_invalidos_no_nome_do_arquivo() {
        assert_eq!(
            sanitize_file_name("API: Usuários / v1?"),
            "API_ Usuários _ v1_"
        );
    }

    #[test]
    fn usa_nome_padrao_quando_nome_fica_vazio() {
        assert_eq!(sanitize_file_name("   "), "colecao");
    }

    #[test]
    fn mantem_nome_valido_inalterado() {
        assert_eq!(sanitize_file_name("minha-colecao_1"), "minha-colecao_1");
    }
}
