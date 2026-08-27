//! Comandos Tauri expostos ao frontend (ponte Rust <-> JS).
//! Implementado incrementalmente na atividade 3 (comandos Tauri), conforme os
//! módulos http_engine, collections, environments e export ficam prontos.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::collections::{self, CollectionsError, SavedRequestInput};
use crate::environments::{self, Environment, EnvironmentsError};
use crate::export::{self, ExportError};
use crate::http_engine::{self, HttpMethod, HttpRequestInput, HttpResponseOutput, RequestBody};
use crate::import::{self, ImportError};
use crate::models::{Collection, SavedRequest};

/// Comando Tauri que executa uma requisição HTTP a partir dos dados enviados
/// pelo frontend, delegando toda a lógica ao motor da atividade 2. A resposta
/// é sempre estruturada (erros de rede/URL/timeout vêm no campo `error`).
#[tauri::command]
pub async fn execute_http_request(request: HttpRequestInput) -> HttpResponseOutput {
    http_engine::execute_request(request).await
}

/// Contrato de erro retornado ao frontend por todos os comandos desta
/// atividade: apenas uma mensagem legível, já que o frontend em JS vanilla
/// não precisa distinguir variantes de erro por código.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
}

impl From<CollectionsError> for CommandError {
    fn from(err: CollectionsError) -> Self {
        CommandError {
            message: err.to_string(),
        }
    }
}

impl From<EnvironmentsError> for CommandError {
    fn from(err: EnvironmentsError) -> Self {
        CommandError {
            message: err.to_string(),
        }
    }
}

impl From<ExportError> for CommandError {
    fn from(err: ExportError) -> Self {
        CommandError {
            message: err.to_string(),
        }
    }
}

impl From<ImportError> for CommandError {
    fn from(err: ImportError) -> Self {
        CommandError {
            message: err.to_string(),
        }
    }
}

pub type CommandResult<T> = std::result::Result<T, CommandError>;

// ---------------------------------------------------------------------------
// Coleções (atividade 5)
// ---------------------------------------------------------------------------

/// Cria uma nova coleção com o nome informado.
#[tauri::command]
pub fn create_collection(app: AppHandle, name: String) -> CommandResult<Collection> {
    Ok(collections::create_collection(&app, name)?)
}

/// Lista todas as coleções salvas.
#[tauri::command]
pub fn list_collections(app: AppHandle) -> CommandResult<Vec<Collection>> {
    Ok(collections::list_collections(&app)?)
}

/// Busca uma coleção específica pelo id.
#[tauri::command]
pub fn get_collection(app: AppHandle, id: String) -> CommandResult<Collection> {
    Ok(collections::get_collection(&app, &id)?)
}

/// Renomeia uma coleção existente.
#[tauri::command]
pub fn rename_collection(app: AppHandle, id: String, name: String) -> CommandResult<Collection> {
    Ok(collections::rename_collection(&app, &id, name)?)
}

/// Remove uma coleção (e as requisições nela salvas).
#[tauri::command]
pub fn delete_collection(app: AppHandle, id: String) -> CommandResult<()> {
    Ok(collections::delete_collection(&app, &id)?)
}

/// Entrada padronizada para criação/edição de uma requisição salva, enviada
/// pelo frontend. Espelha `collections::SavedRequestInput`, apenas agrupando
/// os campos em uma struct nomeada para facilitar a desserialização via
/// `serde` a partir do `invoke` do Tauri.
#[derive(Debug, Deserialize)]
pub struct SavedRequestPayload {
    pub name: String,
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub query_params: Vec<(String, String)>,
    #[serde(default)]
    pub path_params: Vec<(String, String)>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: RequestBody,
}

impl From<SavedRequestPayload> for SavedRequestInput {
    fn from(payload: SavedRequestPayload) -> Self {
        SavedRequestInput {
            name: payload.name,
            method: payload.method,
            url: payload.url,
            query_params: payload.query_params,
            path_params: payload.path_params,
            headers: payload.headers,
            body: payload.body,
        }
    }
}

/// Cria uma nova requisição dentro de uma coleção existente.
#[tauri::command]
pub fn create_request(
    app: AppHandle,
    collection_id: String,
    request: SavedRequestPayload,
) -> CommandResult<SavedRequest> {
    Ok(collections::create_request(
        &app,
        &collection_id,
        request.into(),
    )?)
}

/// Lista as requisições salvas em uma coleção.
#[tauri::command]
pub fn list_requests(app: AppHandle, collection_id: String) -> CommandResult<Vec<SavedRequest>> {
    Ok(collections::list_requests(&app, &collection_id)?)
}

/// Atualiza uma requisição existente dentro de uma coleção.
#[tauri::command]
pub fn update_request(
    app: AppHandle,
    collection_id: String,
    request_id: String,
    request: SavedRequestPayload,
) -> CommandResult<SavedRequest> {
    Ok(collections::update_request(
        &app,
        &collection_id,
        &request_id,
        request.into(),
    )?)
}

/// Remove uma requisição de dentro de uma coleção.
#[tauri::command]
pub fn delete_request(
    app: AppHandle,
    collection_id: String,
    request_id: String,
) -> CommandResult<()> {
    Ok(collections::delete_request(&app, &collection_id, &request_id)?)
}

// ---------------------------------------------------------------------------
// Ambientes e variáveis (atividade 6)
// ---------------------------------------------------------------------------

/// Cria um novo ambiente dentro de uma coleção existente.
#[tauri::command]
pub fn create_environment(
    app: AppHandle,
    collection_id: String,
    name: String,
    variables: Vec<(String, String)>,
) -> CommandResult<Environment> {
    Ok(environments::create_environment(
        &app,
        &collection_id,
        name,
        variables,
    )?)
}

/// Lista todos os ambientes de uma coleção.
#[tauri::command]
pub fn list_environments(app: AppHandle, collection_id: String) -> CommandResult<Vec<Environment>> {
    Ok(environments::list_environments(&app, &collection_id)?)
}

/// Busca um ambiente específico de uma coleção.
#[tauri::command]
pub fn get_environment(
    app: AppHandle,
    collection_id: String,
    environment_id: String,
) -> CommandResult<Environment> {
    Ok(environments::get_environment(
        &app,
        &collection_id,
        &environment_id,
    )?)
}

/// Atualiza o nome e/ou as variáveis de um ambiente existente.
#[tauri::command]
pub fn update_environment(
    app: AppHandle,
    collection_id: String,
    environment_id: String,
    name: String,
    variables: Vec<(String, String)>,
) -> CommandResult<Environment> {
    Ok(environments::update_environment(
        &app,
        &collection_id,
        &environment_id,
        name,
        variables,
    )?)
}

/// Remove um ambiente de uma coleção.
#[tauri::command]
pub fn delete_environment(
    app: AppHandle,
    collection_id: String,
    environment_id: String,
) -> CommandResult<()> {
    Ok(environments::delete_environment(
        &app,
        &collection_id,
        &environment_id,
    )?)
}

/// Define qual ambiente da coleção está ativo. Passar `null`/`None` desativa
/// qualquer ambiente ativo.
#[tauri::command]
pub fn set_active_environment(
    app: AppHandle,
    collection_id: String,
    environment_id: Option<String>,
) -> CommandResult<()> {
    Ok(environments::set_active_environment(
        &app,
        &collection_id,
        environment_id.as_deref(),
    )?)
}

/// Busca o ambiente atualmente ativo de uma coleção, se houver um definido.
#[tauri::command]
pub fn get_active_environment(
    app: AppHandle,
    collection_id: String,
) -> CommandResult<Option<Environment>> {
    Ok(environments::get_active_environment(&app, &collection_id)?)
}

// ---------------------------------------------------------------------------
// Exportação (atividade 7)
// ---------------------------------------------------------------------------

/// Exporta uma coleção (requisições, ambientes e variáveis) para um arquivo
/// JSON escolhido pelo usuário via diálogo nativo. Retorna `None` se o
/// usuário cancelar o diálogo, ou o caminho do arquivo gravado em caso de
/// sucesso.
#[tauri::command]
pub async fn export_collection_to_json(
    app: AppHandle,
    collection_id: String,
) -> CommandResult<Option<String>> {
    Ok(export::export_collection_to_json(&app, &collection_id).await?)
}

/// Importa uma coleção a partir de um arquivo JSON escolhido pelo usuário via
/// diálogo nativo. Cria sempre uma coleção nova (ids regenerados). Retorna
/// `None` se o usuário cancelar o diálogo, ou a coleção criada.
#[tauri::command]
pub async fn import_collection_from_json(app: AppHandle) -> CommandResult<Option<Collection>> {
    Ok(import::import_collection_from_json(&app).await?)
}
