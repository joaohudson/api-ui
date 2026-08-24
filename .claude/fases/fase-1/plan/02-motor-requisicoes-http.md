# 02 — Motor de requisições HTTP

## Objetivo
Implementar em Rust a lógica de execução de requisições HTTP.

## Dependências
1 (estrutura base do projeto).

## Escopo
- Suporte aos verbos: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- Montagem da URL com parâmetros de query.
- Suporte a path parameters (substituição de placeholders na URL).
- Envio de headers customizados.
- Envio de body nos formatos: none, raw (texto plano ou JSON), x-www-form-urlencoded, form-data.
- Execução da requisição via cliente HTTP Rust e captura da resposta.
- Retorno estruturado da resposta: status code, headers e corpo.
- Tratamento de erros de rede e timeout, retornados de forma estruturada, sem lançar exceções não tratadas.

## Fora de escopo
Scripting ou pré-processamento de requisição, autenticação avançada (OAuth, AWS Signature, etc.), mock servers.

## Entregáveis
Módulo Rust com função(ões) de execução de requisição, testável de forma isolada, sem depender da interface.
