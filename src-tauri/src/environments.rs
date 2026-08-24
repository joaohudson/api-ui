//! Variáveis de ambiente configuráveis por coleção.
//! Implementado na atividade 6 (variáveis de ambiente).
//!
//! Cada ambiente é persistido como um arquivo JSON isolado em
//! `environments/<id>.json` (via `crate::persistence`). A coleção (atividade 5)
//! guarda apenas os ids dos ambientes conhecidos e qual está ativo
//! (`Collection::environments`, do tipo `EnvironmentRef`); os dados completos
//! de cada ambiente (nome e variáveis chave/valor) vivem nos arquivos desta
//! atividade.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::collections;
use crate::persistence::{self, PersistenceError};

const ENVIRONMENTS_DIR: &str = "environments";

/// Erros das operações de gerenciamento de ambientes/variáveis.
#[derive(Debug, thiserror::Error)]
pub enum EnvironmentsError {
    #[error(transparent)]
    Persistence(#[from] PersistenceError),
    #[error(transparent)]
    Collections(#[from] collections::CollectionsError),
    #[error("ambiente '{0}' não encontrado")]
    EnvironmentNotFound(String),
    #[error("ambiente '{0}' não pertence à coleção '{1}'")]
    EnvironmentNotInCollection(String, String),
}

pub type Result<T> = std::result::Result<T, EnvironmentsError>;

/// Um ambiente: um conjunto nomeado de variáveis chave/valor, associado a uma
/// coleção específica.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    #[serde(default)]
    pub variables: Vec<(String, String)>,
}

fn environment_path(id: &str) -> PathBuf {
    Path::new(ENVIRONMENTS_DIR).join(format!("{}.json", id))
}

fn read_environment(app: &AppHandle, id: &str) -> Result<Environment> {
    persistence::read_json(app, &environment_path(id))?
        .ok_or_else(|| EnvironmentsError::EnvironmentNotFound(id.to_string()))
}

/// Garante que o ambiente com o id informado pertence à coleção informada.
fn ensure_belongs_to_collection(environment: &Environment, collection_id: &str) -> Result<()> {
    if environment.collection_id != collection_id {
        return Err(EnvironmentsError::EnvironmentNotInCollection(
            environment.id.clone(),
            collection_id.to_string(),
        ));
    }
    Ok(())
}

/// Cria um novo ambiente dentro de uma coleção existente e o persiste,
/// atualizando a referência de ambientes conhecidos da coleção.
pub fn create_environment(
    app: &AppHandle,
    collection_id: &str,
    name: String,
    variables: Vec<(String, String)>,
) -> Result<Environment> {
    let mut collection = collections::get_collection(app, collection_id)?;

    let environment = Environment {
        id: Uuid::new_v4().to_string(),
        collection_id: collection_id.to_string(),
        name,
        variables,
    };

    persistence::write_json(app, &environment_path(&environment.id), &environment)?;

    collection
        .environments
        .environment_ids
        .push(environment.id.clone());
    collections::save_collection(app, &collection)?;

    Ok(environment)
}

/// Lista todos os ambientes de uma coleção.
pub fn list_environments(app: &AppHandle, collection_id: &str) -> Result<Vec<Environment>> {
    let collection = collections::get_collection(app, collection_id)?;

    let mut environments = Vec::with_capacity(collection.environments.environment_ids.len());
    for id in &collection.environments.environment_ids {
        if let Some(environment) = persistence::read_json(app, &environment_path(id))? {
            environments.push(environment);
        }
    }

    Ok(environments)
}

/// Busca um ambiente específico, garantindo que ele pertence à coleção
/// informada.
pub fn get_environment(
    app: &AppHandle,
    collection_id: &str,
    environment_id: &str,
) -> Result<Environment> {
    let environment = read_environment(app, environment_id)?;
    ensure_belongs_to_collection(&environment, collection_id)?;
    Ok(environment)
}

/// Atualiza o nome e/ou as variáveis de um ambiente existente.
pub fn update_environment(
    app: &AppHandle,
    collection_id: &str,
    environment_id: &str,
    name: String,
    variables: Vec<(String, String)>,
) -> Result<Environment> {
    let mut environment = get_environment(app, collection_id, environment_id)?;

    environment.name = name;
    environment.variables = variables;

    persistence::write_json(app, &environment_path(environment_id), &environment)?;

    Ok(environment)
}

/// Remove um ambiente de uma coleção, removendo também a referência na
/// coleção (incluindo desmarcá-lo como ativo, se for o caso).
pub fn delete_environment(
    app: &AppHandle,
    collection_id: &str,
    environment_id: &str,
) -> Result<()> {
    // Garante que o ambiente pertence à coleção antes de removê-lo.
    get_environment(app, collection_id, environment_id)?;

    let mut collection = collections::get_collection(app, collection_id)?;
    collection
        .environments
        .environment_ids
        .retain(|id| id != environment_id);

    if collection.environments.active_environment_id.as_deref() == Some(environment_id) {
        collection.environments.active_environment_id = None;
    }

    collections::save_collection(app, &collection)?;
    persistence::remove_json(app, &environment_path(environment_id))?;

    Ok(())
}

/// Define qual ambiente da coleção está ativo (no máximo um por vez). Passar
/// `None` desativa qualquer ambiente ativo.
pub fn set_active_environment(
    app: &AppHandle,
    collection_id: &str,
    environment_id: Option<&str>,
) -> Result<()> {
    let mut collection = collections::get_collection(app, collection_id)?;

    if let Some(environment_id) = environment_id {
        if !collection
            .environments
            .environment_ids
            .iter()
            .any(|id| id == environment_id)
        {
            return Err(EnvironmentsError::EnvironmentNotInCollection(
                environment_id.to_string(),
                collection_id.to_string(),
            ));
        }
        collection.environments.active_environment_id = Some(environment_id.to_string());
    } else {
        collection.environments.active_environment_id = None;
    }

    collections::save_collection(app, &collection)?;

    Ok(())
}

/// Busca o ambiente atualmente ativo de uma coleção, se houver um definido.
pub fn get_active_environment(
    app: &AppHandle,
    collection_id: &str,
) -> Result<Option<Environment>> {
    let collection = collections::get_collection(app, collection_id)?;

    match &collection.environments.active_environment_id {
        Some(id) => Ok(Some(read_environment(app, id)?)),
        None => Ok(None),
    }
}

/// Substitui todas as ocorrências de `{{variavel}}` em `text` pelo valor
/// correspondente nas variáveis informadas. Placeholders sem variável
/// correspondente são deixados como estão (sem substituição), para deixar
/// visível ao usuário qual variável não foi resolvida.
pub fn resolve_variables_in_text(text: &str, variables: &[(String, String)]) -> String {
    let mut result = text.to_string();
    for (key, value) in variables {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

/// Aplica a resolução de variáveis do ambiente ativo (quando houver) sobre a
/// URL, headers e body (quando textual) de uma requisição, retornando novas
/// cópias já resolvidas — não modifica os dados salvos da requisição.
pub fn resolve_request_with_active_environment(
    app: &AppHandle,
    collection_id: &str,
    url: &str,
    headers: &[(String, String)],
    body: &str,
) -> Result<(String, Vec<(String, String)>, String)> {
    let variables = match get_active_environment(app, collection_id)? {
        Some(environment) => environment.variables,
        None => Vec::new(),
    };

    let resolved_url = resolve_variables_in_text(url, &variables);
    let resolved_headers = headers
        .iter()
        .map(|(key, value)| {
            (
                resolve_variables_in_text(key, &variables),
                resolve_variables_in_text(value, &variables),
            )
        })
        .collect();
    let resolved_body = resolve_variables_in_text(body, &variables);

    Ok((resolved_url, resolved_headers, resolved_body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitui_variavel_unica() {
        let vars = vec![("host".to_string(), "api.exemplo.com".to_string())];
        assert_eq!(
            resolve_variables_in_text("https://{{host}}/users", &vars),
            "https://api.exemplo.com/users"
        );
    }

    #[test]
    fn substitui_multiplas_variaveis_e_ocorrencias_repetidas() {
        let vars = vec![
            ("token".to_string(), "abc123".to_string()),
            ("host".to_string(), "api.exemplo.com".to_string()),
        ];
        assert_eq!(
            resolve_variables_in_text(
                "https://{{host}}/users?token={{token}}&again={{token}}",
                &vars
            ),
            "https://api.exemplo.com/users?token=abc123&again=abc123"
        );
    }

    #[test]
    fn mantem_placeholder_sem_variavel_correspondente() {
        let vars = vec![("host".to_string(), "api.exemplo.com".to_string())];
        assert_eq!(
            resolve_variables_in_text("https://{{host}}/{{nao_existe}}", &vars),
            "https://api.exemplo.com/{{nao_existe}}"
        );
    }

    #[test]
    fn texto_sem_placeholders_permanece_igual() {
        let vars = vec![("host".to_string(), "api.exemplo.com".to_string())];
        assert_eq!(
            resolve_variables_in_text("sem variaveis aqui", &vars),
            "sem variaveis aqui"
        );
    }
}
