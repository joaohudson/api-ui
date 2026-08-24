//! Persistência local genérica: leitura e escrita de dados em arquivos JSON.
//!
//! Onde os dados são salvos:
//! - Todos os arquivos ficam dentro do diretório de dados do app, resolvido em
//!   tempo de execução via `tauri::Manager::path().app_data_dir()` (ex.:
//!   `~/.local/share/com.apiclient.app` no Linux, `%APPDATA%\com.apiclient.app`
//!   no Windows, `~/Library/Application Support/com.apiclient.app` no macOS).
//! - Não há sincronização remota nem banco de dados externo: cada "entidade"
//!   (coleção, ambiente, etc.) é serializada como um arquivo `.json` isolado,
//!   permitindo que os dados sobrevivam ao fechamento da aplicação.
//!
//! Padrão de nomenclatura dos arquivos:
//! - Os arquivos são organizados em subdiretórios lógicos dentro do diretório
//!   de dados do app (ex.: `collections/<id>.json`, `environments/<id>.json`).
//!   O nome do subdiretório e o `id` de cada arquivo são definidos pelos
//!   módulos que consomem esta camada (atividades 5, 6 e 7) — este módulo
//!   apenas resolve caminhos relativos ao diretório de dados e faz a
//!   serialização/deserialização genérica em JSON.
//!
//! Este módulo não define nenhum modelo de domínio (Coleção, Ambiente, etc.),
//! apenas as operações de I/O genéricas reutilizadas pelos módulos que os
//! definem.

use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Erros que podem ocorrer nas operações de leitura/escrita local.
#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("falha ao resolver o diretório de dados do app: {0}")]
    AppDataDirUnavailable(String),
    #[error("falha ao acessar o sistema de arquivos em {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("falha ao (des)serializar JSON em {path}: {source}")]
    Serde {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

pub type Result<T> = std::result::Result<T, PersistenceError>;

/// Resolve o diretório raiz de dados da aplicação (criando-o se necessário).
///
/// Todas as demais funções deste módulo recebem caminhos relativos a este
/// diretório, para que os módulos consumidores não precisem lidar com a API
/// de path do Tauri diretamente.
pub fn app_data_root(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| PersistenceError::AppDataDirUnavailable(e.to_string()))?;

    fs::create_dir_all(&dir).map_err(|source| PersistenceError::Io {
        path: dir.clone(),
        source,
    })?;

    Ok(dir)
}

/// Resolve um caminho relativo dentro do diretório de dados do app, garantindo
/// que os diretórios intermediários existam.
fn resolve_path(app: &AppHandle, relative_path: &Path) -> Result<PathBuf> {
    let root = app_data_root(app)?;
    let full_path = root.join(relative_path);

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PersistenceError::Io {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    Ok(full_path)
}

/// Lê e desserializa um arquivo JSON localizado em `relative_path` (relativo
/// ao diretório de dados do app). Retorna `Ok(None)` se o arquivo ainda não
/// existir, para que os chamadores possam distinguir "vazio" de "erro".
pub fn read_json<T>(app: &AppHandle, relative_path: &Path) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let full_path = resolve_path(app, relative_path)?;

    if !full_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&full_path).map_err(|source| PersistenceError::Io {
        path: full_path.clone(),
        source,
    })?;

    let value = serde_json::from_str(&contents).map_err(|source| PersistenceError::Serde {
        path: full_path.clone(),
        source,
    })?;

    Ok(Some(value))
}

/// Serializa `value` como JSON (formatado) e grava em `relative_path`
/// (relativo ao diretório de dados do app), sobrescrevendo o conteúdo
/// anterior. A escrita é feita em um arquivo temporário e depois renomeada
/// para o destino final, para reduzir o risco de corromper dados existentes
/// em caso de falha no meio da escrita.
pub fn write_json<T>(app: &AppHandle, relative_path: &Path, value: &T) -> Result<()>
where
    T: Serialize,
{
    let full_path = resolve_path(app, relative_path)?;

    let json = serde_json::to_string_pretty(value).map_err(|source| PersistenceError::Serde {
        path: full_path.clone(),
        source,
    })?;

    let tmp_path = full_path.with_extension("json.tmp");

    fs::write(&tmp_path, json).map_err(|source| PersistenceError::Io {
        path: tmp_path.clone(),
        source,
    })?;

    fs::rename(&tmp_path, &full_path).map_err(|source| PersistenceError::Io {
        path: full_path.clone(),
        source,
    })?;

    Ok(())
}

/// Remove o arquivo em `relative_path`, se existir. Não é erro remover um
/// arquivo inexistente.
pub fn remove_json(app: &AppHandle, relative_path: &Path) -> Result<()> {
    let full_path = resolve_path(app, relative_path)?;

    if !full_path.exists() {
        return Ok(());
    }

    fs::remove_file(&full_path).map_err(|source| PersistenceError::Io {
        path: full_path,
        source,
    })
}

/// Lista os ids (nome do arquivo sem a extensão `.json`) de todos os arquivos
/// JSON presentes no subdiretório `relative_dir` (relativo ao diretório de
/// dados do app). Retorna uma lista vazia se o diretório ainda não existir.
pub fn list_json_ids(app: &AppHandle, relative_dir: &Path) -> Result<Vec<String>> {
    let full_dir = resolve_path(app, relative_dir)?;

    if !full_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&full_dir).map_err(|source| PersistenceError::Io {
        path: full_dir.clone(),
        source,
    })?;

    let mut ids = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|source| PersistenceError::Io {
            path: full_dir.clone(),
            source,
        })?;
        let path = entry.path();

        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                ids.push(stem.to_string());
            }
        }
    }

    Ok(ids)
}
