//! Motor de execução de requisições HTTP (verbos, params, headers, body).
//!
//! CONTRATO consumido pelas atividades 3 (comandos Tauri) e 9/10 (frontend):
//! - `HttpRequestInput`: entrada com método, URL (podendo conter placeholders
//!   `{param}` substituídos por `path_params`), query params, headers e body.
//! - `RequestBody`: enum serializado por tag `type` (none/raw/form_urlencoded/
//!   form_data) representando os formatos de body suportados nesta fase.
//! - `HttpResponseOutput`: saída padronizada, sempre retornada (nunca panic),
//!   com `error` preenchido em caso de falha de rede/timeout/URL inválida.

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Verbos HTTP suportados nesta fase do projeto.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

impl HttpMethod {
    fn to_reqwest_method(self) -> reqwest::Method {
        match self {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
            HttpMethod::Put => reqwest::Method::PUT,
            HttpMethod::Patch => reqwest::Method::PATCH,
            HttpMethod::Delete => reqwest::Method::DELETE,
            HttpMethod::Head => reqwest::Method::HEAD,
            HttpMethod::Options => reqwest::Method::OPTIONS,
        }
    }
}

/// Um campo de formulário multipart (form-data). `file_path`, quando presente,
/// indica que o valor deve ser lido do disco e enviado como arquivo; caso
/// contrário o campo é tratado como texto simples.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormDataField {
    pub name: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub file_path: Option<String>,
}

/// Corpo da requisição, nos formatos suportados nesta fase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RequestBody {
    None,
    Raw { content: String },
    #[serde(rename = "form_urlencoded")]
    FormUrlEncoded { fields: Vec<(String, String)> },
    FormData { fields: Vec<FormDataField> },
}

impl Default for RequestBody {
    fn default() -> Self {
        RequestBody::None
    }
}

/// Entrada do motor de requisições HTTP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequestInput {
    pub method: HttpMethod,
    /// URL podendo conter placeholders de path, ex.: `https://api.exemplo.com/users/{id}`.
    pub url: String,
    #[serde(default)]
    pub query_params: Vec<(String, String)>,
    #[serde(default)]
    pub path_params: Vec<(String, String)>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: RequestBody,
    /// Timeout em milissegundos; quando ausente, usa o padrão do motor.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

/// Saída padronizada do motor de requisições HTTP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponseOutput {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
    pub error: Option<String>,
}

impl HttpResponseOutput {
    fn error(message: String, duration_ms: u64) -> Self {
        HttpResponseOutput {
            status: 0,
            headers: Vec::new(),
            body: String::new(),
            duration_ms,
            error: Some(message),
        }
    }
}

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

/// Substitui placeholders `{nome}` na URL pelos valores de `path_params`.
fn apply_path_params(url: &str, path_params: &[(String, String)]) -> String {
    let mut result = url.to_string();
    for (key, value) in path_params {
        let placeholder = format!("{{{}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

/// Monta a `reqwest::Url` final a partir da URL base (já com path params
/// aplicados) e dos query params informados.
fn build_url(
    base_url: &str,
    query_params: &[(String, String)],
) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(base_url).map_err(|e| format!("URL inválida: {}", e))?;
    if !query_params.is_empty() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in query_params {
            pairs.append_pair(key, value);
        }
    }
    Ok(url)
}

/// Aplica o corpo da requisição ao `RequestBuilder`, conforme o tipo escolhido.
fn apply_body(
    builder: reqwest::RequestBuilder,
    body: &RequestBody,
) -> Result<reqwest::RequestBuilder, String> {
    match body {
        RequestBody::None => Ok(builder),
        RequestBody::Raw { content } => Ok(builder.body(content.clone())),
        RequestBody::FormUrlEncoded { fields } => Ok(builder.form(fields)),
        RequestBody::FormData { fields } => {
            let mut form = reqwest::multipart::Form::new();
            for field in fields {
                form = if let Some(path) = &field.file_path {
                    let bytes = std::fs::read(path)
                        .map_err(|e| format!("Falha ao ler arquivo '{}': {}", path, e))?;
                    let file_name = std::path::Path::new(path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| field.name.clone());
                    let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
                    form.part(field.name.clone(), part)
                } else {
                    form.text(field.name.clone(), field.value.clone())
                };
            }
            Ok(builder.multipart(form))
        }
    }
}

/// Executa uma requisição HTTP descrita por `input` e retorna sempre um
/// `HttpResponseOutput` estruturado — falhas de rede/timeout/URL/IO não
/// causam panic, apenas preenchem o campo `error`.
pub async fn execute_request(input: HttpRequestInput) -> HttpResponseOutput {
    let started_at = Instant::now();

    let resolved_url = apply_path_params(&input.url, &input.path_params);
    let url = match build_url(&resolved_url, &input.query_params) {
        Ok(url) => url,
        Err(message) => {
            return HttpResponseOutput::error(message, elapsed_ms(started_at));
        }
    };

    let timeout_ms = input.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(client) => client,
        Err(e) => {
            return HttpResponseOutput::error(
                format!("Falha ao criar cliente HTTP: {}", e),
                elapsed_ms(started_at),
            );
        }
    };

    let mut builder = client.request(input.method.to_reqwest_method(), url);

    for (key, value) in &input.headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    builder = match apply_body(builder, &input.body) {
        Ok(builder) => builder,
        Err(message) => {
            return HttpResponseOutput::error(message, elapsed_ms(started_at));
        }
    };

    match builder.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let headers = response
                .headers()
                .iter()
                .map(|(name, value)| {
                    (
                        name.to_string(),
                        value.to_str().unwrap_or_default().to_string(),
                    )
                })
                .collect();

            match response.text().await {
                Ok(body) => HttpResponseOutput {
                    status,
                    headers,
                    body,
                    duration_ms: elapsed_ms(started_at),
                    error: None,
                },
                Err(e) => HttpResponseOutput {
                    status,
                    headers,
                    body: String::new(),
                    duration_ms: elapsed_ms(started_at),
                    error: Some(format!("Falha ao ler corpo da resposta: {}", e)),
                },
            }
        }
        Err(e) => {
            let message = if e.is_timeout() {
                format!("Tempo limite excedido: {}", e)
            } else if e.is_connect() {
                format!("Falha de conexão: {}", e)
            } else {
                format!("Falha na requisição: {}", e)
            };
            HttpResponseOutput::error(message, elapsed_ms(started_at))
        }
    }
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aplica_path_params_na_url() {
        let url = "https://api.exemplo.com/users/{id}/posts/{postId}";
        let params = vec![
            ("id".to_string(), "42".to_string()),
            ("postId".to_string(), "7".to_string()),
        ];
        assert_eq!(
            apply_path_params(url, &params),
            "https://api.exemplo.com/users/42/posts/7"
        );
    }

    #[test]
    fn monta_url_com_query_params() {
        let url = build_url(
            "https://api.exemplo.com/users",
            &[
                ("page".to_string(), "1".to_string()),
                ("q".to_string(), "a b".to_string()),
            ],
        )
        .expect("URL deveria ser válida");
        assert_eq!(
            url.as_str(),
            "https://api.exemplo.com/users?page=1&q=a+b"
        );
    }

    #[test]
    fn rejeita_url_invalida() {
        let result = build_url("nao-e-uma-url", &[]);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn retorna_erro_estruturado_para_url_invalida() {
        let input = HttpRequestInput {
            method: HttpMethod::Get,
            url: "isso-nao-e-url".to_string(),
            query_params: vec![],
            path_params: vec![],
            headers: vec![],
            body: RequestBody::None,
            timeout_ms: None,
        };
        let output = execute_request(input).await;
        assert!(output.error.is_some());
        assert_eq!(output.status, 0);
    }

    #[tokio::test]
    async fn executa_get_simples_contra_servico_publico() {
        let input = HttpRequestInput {
            method: HttpMethod::Get,
            url: "https://httpbin.org/get".to_string(),
            query_params: vec![("foo".to_string(), "bar".to_string())],
            path_params: vec![],
            headers: vec![("X-Teste".to_string(), "1".to_string())],
            body: RequestBody::None,
            timeout_ms: Some(10_000),
        };
        let output = execute_request(input).await;
        // Ambiente de CI pode não ter acesso à internet; nesse caso apenas
        // garantimos que o erro foi tratado de forma estruturada.
        if output.error.is_none() {
            assert_eq!(output.status, 200);
        }
    }
}
