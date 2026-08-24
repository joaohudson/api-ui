//! Gerenciamento de coleções e requisições (criação, edição, remoção, organização).
//! Implementado na atividade 5 (gerenciamento de coleções).
//!
//! Cada coleção é persistida como um arquivo JSON isolado em
//! `collections/<id>.json` (via `crate::persistence`), contendo tanto os dados
//! da coleção quanto as requisições salvas nela (não há arquivos separados por
//! requisição).

use std::path::{Path, PathBuf};

use tauri::AppHandle;
use uuid::Uuid;

use crate::models::{Collection, EnvironmentRef, SavedRequest};
use crate::persistence::{self, PersistenceError};

const COLLECTIONS_DIR: &str = "collections";

/// Erros das operações de gerenciamento de coleções e requisições.
#[derive(Debug, thiserror::Error)]
pub enum CollectionsError {
    #[error(transparent)]
    Persistence(#[from] PersistenceError),
    #[error("coleção '{0}' não encontrada")]
    CollectionNotFound(String),
    #[error("requisição '{0}' não encontrada na coleção")]
    RequestNotFound(String),
}

pub type Result<T> = std::result::Result<T, CollectionsError>;

fn collection_path(id: &str) -> PathBuf {
    Path::new(COLLECTIONS_DIR).join(format!("{}.json", id))
}

/// Cria uma nova coleção com o nome informado e a persiste imediatamente.
pub fn create_collection(app: &AppHandle, name: String) -> Result<Collection> {
    let collection = Collection {
        id: Uuid::new_v4().to_string(),
        name,
        requests: Vec::new(),
        environments: EnvironmentRef::default(),
    };

    persistence::write_json(app, &collection_path(&collection.id), &collection)?;

    Ok(collection)
}

/// Lista todas as coleções salvas, em nenhuma ordem específica.
pub fn list_collections(app: &AppHandle) -> Result<Vec<Collection>> {
    let ids = persistence::list_json_ids(app, Path::new(COLLECTIONS_DIR))?;

    let mut collections = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(collection) = persistence::read_json(app, &collection_path(&id))? {
            collections.push(collection);
        }
    }

    Ok(collections)
}

/// Busca uma coleção específica pelo id.
pub fn get_collection(app: &AppHandle, id: &str) -> Result<Collection> {
    persistence::read_json(app, &collection_path(id))?
        .ok_or_else(|| CollectionsError::CollectionNotFound(id.to_string()))
}

/// Persiste uma coleção já carregada (ex.: após alterar `environments` a
/// partir do módulo de ambientes, atividade 6), sobrescrevendo o arquivo
/// existente.
pub fn save_collection(app: &AppHandle, collection: &Collection) -> Result<()> {
    persistence::write_json(app, &collection_path(&collection.id), collection)?;
    Ok(())
}

/// Renomeia uma coleção existente.
pub fn rename_collection(app: &AppHandle, id: &str, name: String) -> Result<Collection> {
    let mut collection = get_collection(app, id)?;
    collection.name = name;
    persistence::write_json(app, &collection_path(id), &collection)?;
    Ok(collection)
}

/// Remove uma coleção (e, por consequência, todas as requisições nela salvas).
pub fn delete_collection(app: &AppHandle, id: &str) -> Result<()> {
    persistence::remove_json(app, &collection_path(id))?;
    Ok(())
}

/// Parâmetros para criação/edição de uma requisição salva. Reutilizado nos
/// dois casos para evitar duplicar a lista de campos.
pub struct SavedRequestInput {
    pub name: String,
    pub method: crate::http_engine::HttpMethod,
    pub url: String,
    pub query_params: Vec<(String, String)>,
    pub path_params: Vec<(String, String)>,
    pub headers: Vec<(String, String)>,
    pub body: crate::http_engine::RequestBody,
}

/// Cria uma nova requisição dentro de uma coleção existente.
pub fn create_request(
    app: &AppHandle,
    collection_id: &str,
    input: SavedRequestInput,
) -> Result<SavedRequest> {
    let mut collection = get_collection(app, collection_id)?;

    let request = SavedRequest {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        method: input.method,
        url: input.url,
        query_params: input.query_params,
        path_params: input.path_params,
        headers: input.headers,
        body: input.body,
    };

    collection.requests.push(request.clone());
    persistence::write_json(app, &collection_path(collection_id), &collection)?;

    Ok(request)
}

/// Lista as requisições salvas em uma coleção.
pub fn list_requests(app: &AppHandle, collection_id: &str) -> Result<Vec<SavedRequest>> {
    let collection = get_collection(app, collection_id)?;
    Ok(collection.requests)
}

/// Atualiza uma requisição existente dentro de uma coleção.
pub fn update_request(
    app: &AppHandle,
    collection_id: &str,
    request_id: &str,
    input: SavedRequestInput,
) -> Result<SavedRequest> {
    let mut collection = get_collection(app, collection_id)?;

    let existing = collection
        .requests
        .iter_mut()
        .find(|r| r.id == request_id)
        .ok_or_else(|| CollectionsError::RequestNotFound(request_id.to_string()))?;

    existing.name = input.name;
    existing.method = input.method;
    existing.url = input.url;
    existing.query_params = input.query_params;
    existing.path_params = input.path_params;
    existing.headers = input.headers;
    existing.body = input.body;

    let updated = existing.clone();
    persistence::write_json(app, &collection_path(collection_id), &collection)?;

    Ok(updated)
}

/// Remove uma requisição de dentro de uma coleção.
pub fn delete_request(app: &AppHandle, collection_id: &str, request_id: &str) -> Result<()> {
    let mut collection = get_collection(app, collection_id)?;

    let original_len = collection.requests.len();
    collection.requests.retain(|r| r.id != request_id);

    if collection.requests.len() == original_len {
        return Err(CollectionsError::RequestNotFound(request_id.to_string()));
    }

    persistence::write_json(app, &collection_path(collection_id), &collection)?;

    Ok(())
}
