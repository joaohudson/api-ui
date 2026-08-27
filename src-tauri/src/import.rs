//! Importação de uma coleção a partir de um arquivo JSON gerado pela
//! exportação (`crate::export`).
//!
//! A importação **sempre cria uma coleção nova**, com todos os ids
//! regenerados (coleção, cada requisição, cada ambiente); nunca mescla nem
//! sobrescreve dados existentes. As referências internas — os ids de ambiente
//! conhecidos da coleção, o ambiente ativo e o `collection_id` de cada
//! ambiente — são remapeadas para os novos ids. Em caso de colisão de nome
//! com uma coleção já existente, o nome importado recebe o sufixo
//! ` (importada)`, depois ` (importada 2)`, ` (importada 3)`, etc.

use std::collections::{HashMap, HashSet};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::collections::{self, CollectionsError};
use crate::environments::{self, Environment, EnvironmentsError};
use crate::export;
use crate::models::{Collection, EnvironmentRef};
use crate::persistence::PersistenceError;

/// Erros das operações de importação de coleção.
#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error(transparent)]
    Collections(#[from] CollectionsError),
    #[error(transparent)]
    Environments(#[from] EnvironmentsError),
    #[error(transparent)]
    Persistence(#[from] PersistenceError),
    #[error("falha ao ler o arquivo de importação em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("o arquivo não é uma exportação de coleção válida do API UI: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("arquivo de um formato/versão de exportação não suportado: '{0}'")]
    UnsupportedSchema(String),
}

pub type Result<T> = std::result::Result<T, ImportError>;

/// Formato de leitura do arquivo de importação: espelha o `CollectionExport`
/// da exportação. `Collection`/`Environment` já são `Deserialize`; o campo
/// `schema` é opcional na leitura para permitir aceitar arquivos sem o
/// marcador, desde que a estrutura mínima da coleção esteja presente (o que a
/// própria desserialização de `Collection` garante — `name` é obrigatório).
#[derive(Debug, serde::Deserialize)]
struct CollectionImportDoc {
    #[serde(default)]
    schema: Option<String>,
    #[serde(flatten)]
    collection: Collection,
    #[serde(default)]
    environment_data: Vec<Environment>,
}

/// Valida o marcador de formato lido do arquivo: se presente, precisa ser
/// exatamente `export::EXPORT_SCHEMA`; ausente é aceito.
fn validate_schema(schema: Option<&str>) -> Result<()> {
    match schema {
        Some(value) if value != export::EXPORT_SCHEMA => {
            Err(ImportError::UnsupportedSchema(value.to_string()))
        }
        _ => Ok(()),
    }
}

/// Resolve o nome final da coleção importada evitando colisão com os nomes já
/// existentes: `desired` se estiver livre, senão `desired (importada)`, senão
/// `desired (importada 2)`, `desired (importada 3)`, etc.
fn resolve_name_collision_in(desired: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(desired) {
        return desired.to_string();
    }

    let first = format!("{desired} (importada)");
    if !existing.contains(&first) {
        return first;
    }

    let mut n = 2;
    loop {
        let candidate = format!("{desired} (importada {n})");
        if !existing.contains(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// Monta a nova coleção (e a lista de ambientes a persistir) a partir do
/// documento lido, regenerando todos os ids e remapeando as referências de
/// ambiente. Função pura — não toca em disco.
fn build_imported_collection(
    doc: CollectionImportDoc,
    name: String,
) -> (Collection, Vec<Environment>) {
    let new_collection_id = Uuid::new_v4().to_string();

    let requests = doc
        .collection
        .requests
        .into_iter()
        .map(|mut request| {
            request.id = Uuid::new_v4().to_string();
            request
        })
        .collect();

    let mut id_map: HashMap<String, String> = HashMap::new();
    let mut new_environments = Vec::with_capacity(doc.environment_data.len());
    for environment in doc.environment_data {
        let new_id = Uuid::new_v4().to_string();
        id_map.insert(environment.id.clone(), new_id.clone());
        new_environments.push(Environment {
            id: new_id,
            collection_id: new_collection_id.clone(),
            name: environment.name,
            variables: environment.variables,
        });
    }

    let environment_ids = new_environments.iter().map(|env| env.id.clone()).collect();
    let active_environment_id = doc
        .collection
        .environments
        .active_environment_id
        .and_then(|old| id_map.get(&old).cloned());

    let collection = Collection {
        id: new_collection_id,
        name,
        requests,
        environments: EnvironmentRef {
            environment_ids,
            active_environment_id,
        },
    };

    (collection, new_environments)
}

/// Importa uma coleção a partir de um arquivo JSON escolhido pelo usuário via
/// diálogo nativo. Cria sempre uma coleção nova (ids regenerados) e a
/// persiste, junto de seus ambientes.
///
/// Retorna `Ok(None)` se o usuário cancelar o diálogo, ou `Ok(Some(colecao))`
/// com a coleção criada em caso de sucesso.
pub async fn import_collection_from_json(app: &AppHandle) -> Result<Option<Collection>> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let file_path_display = file_path.to_string();
    let path_buf = file_path.into_path().map_err(|e| ImportError::Io {
        path: file_path_display,
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, e.to_string()),
    })?;

    let contents = std::fs::read_to_string(&path_buf).map_err(|source| ImportError::Io {
        path: path_buf.display().to_string(),
        source,
    })?;

    let doc: CollectionImportDoc = serde_json::from_str(&contents)?;
    validate_schema(doc.schema.as_deref())?;

    let existing_names: HashSet<String> = collections::list_collections(app)?
        .into_iter()
        .map(|collection| collection.name)
        .collect();
    let name = resolve_name_collision_in(&doc.collection.name, &existing_names);

    let (collection, new_environments) = build_imported_collection(doc, name);

    collections::save_collection(app, &collection)?;
    for environment in &new_environments {
        environments::save_environment(app, environment)?;
    }

    Ok(Some(collection))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http_engine::HttpMethod;
    use crate::models::SavedRequest;

    fn sample_doc() -> CollectionImportDoc {
        CollectionImportDoc {
            schema: Some(export::EXPORT_SCHEMA.to_string()),
            collection: Collection {
                id: "col-antiga".to_string(),
                name: "API".to_string(),
                requests: vec![SavedRequest {
                    id: "req-antiga".to_string(),
                    name: "listar".to_string(),
                    method: HttpMethod::Get,
                    url: "http://exemplo".to_string(),
                    query_params: vec![],
                    path_params: vec![],
                    headers: vec![],
                    body: Default::default(),
                }],
                environments: EnvironmentRef {
                    environment_ids: vec!["env-1".to_string(), "env-2".to_string()],
                    active_environment_id: Some("env-2".to_string()),
                },
            },
            environment_data: vec![
                Environment {
                    id: "env-1".to_string(),
                    collection_id: "col-antiga".to_string(),
                    name: "dev".to_string(),
                    variables: vec![],
                },
                Environment {
                    id: "env-2".to_string(),
                    collection_id: "col-antiga".to_string(),
                    name: "prod".to_string(),
                    variables: vec![],
                },
            ],
        }
    }

    #[test]
    fn aceita_schema_ausente_ou_igual_ao_esperado() {
        assert!(validate_schema(None).is_ok());
        assert!(validate_schema(Some(export::EXPORT_SCHEMA)).is_ok());
    }

    #[test]
    fn rejeita_schema_desconhecido() {
        let err = validate_schema(Some("outra-ferramenta/formato@9")).unwrap_err();
        assert!(matches!(err, ImportError::UnsupportedSchema(_)));
    }

    #[test]
    fn resolve_nome_sem_colisao_mantem_original() {
        let existing = HashSet::new();
        assert_eq!(resolve_name_collision_in("API", &existing), "API");
    }

    #[test]
    fn resolve_nome_com_colisao_adiciona_sufixo_incremental() {
        let mut existing = HashSet::new();
        existing.insert("API".to_string());
        assert_eq!(
            resolve_name_collision_in("API", &existing),
            "API (importada)"
        );

        existing.insert("API (importada)".to_string());
        assert_eq!(
            resolve_name_collision_in("API", &existing),
            "API (importada 2)"
        );

        existing.insert("API (importada 2)".to_string());
        assert_eq!(
            resolve_name_collision_in("API", &existing),
            "API (importada 3)"
        );
    }

    #[test]
    fn regenera_todos_os_ids_da_colecao_importada() {
        let (collection, envs) = build_imported_collection(sample_doc(), "API".to_string());

        assert_ne!(collection.id, "col-antiga");
        assert_ne!(collection.requests[0].id, "req-antiga");
        assert_eq!(collection.requests[0].name, "listar");
        for env in &envs {
            assert!(env.id != "env-1" && env.id != "env-2");
            assert_eq!(env.collection_id, collection.id);
        }
        assert_eq!(
            collection.environments.environment_ids,
            vec![envs[0].id.clone(), envs[1].id.clone()]
        );
    }

    #[test]
    fn remapeia_ambiente_ativo_para_o_novo_id() {
        let (collection, envs) = build_imported_collection(sample_doc(), "API".to_string());
        // "env-2" era o ativo (2º da lista) -> deve virar o id do 2º ambiente novo.
        assert_eq!(
            collection.environments.active_environment_id,
            Some(envs[1].id.clone())
        );
    }

    #[test]
    fn ambiente_ativo_inexistente_no_arquivo_vira_none() {
        let mut doc = sample_doc();
        doc.collection.environments.active_environment_id = Some("env-fantasma".to_string());
        let (collection, _) = build_imported_collection(doc, "API".to_string());
        assert_eq!(collection.environments.active_environment_id, None);
    }
}
