//! Estruturas de dados compartilhadas entre os módulos do backend.
//! Preenchido pelas atividades de coleções, variáveis de ambiente e motor HTTP.

use serde::{Deserialize, Serialize};

use crate::http_engine::{HttpMethod, RequestBody};

/// Uma requisição salva dentro de uma coleção.
///
/// Os campos de verbo/URL/parâmetros/headers/body seguem os mesmos nomes e
/// formatos de `http_engine::HttpRequestInput`, para que uma `SavedRequest`
/// possa ser convertida diretamente em uma execução HTTP sem remapeamento.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedRequest {
    pub id: String,
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

/// Referência a um ambiente/conjunto de variáveis de uma coleção.
///
/// O modelo completo de ambientes (múltiplos ambientes por coleção, variáveis
/// chave/valor, ambiente ativo) é definido e persistido pela atividade 6; aqui
/// a coleção apenas guarda os ids conhecidos e qual está ativo, para que o
/// vínculo já exista no modelo de coleção desta atividade.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EnvironmentRef {
    #[serde(default)]
    pub environment_ids: Vec<String>,
    #[serde(default)]
    pub active_environment_id: Option<String>,
}

/// Uma coleção: agrupa requisições salvas e referencia os ambientes/variáveis
/// associados (preenchidos pela atividade 6).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub requests: Vec<SavedRequest>,
    #[serde(default)]
    pub environments: EnvironmentRef,
}
