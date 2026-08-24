# 09 — Editor de requisição

## Objetivo
Construir o formulário de montagem de requisição na interface.

## Dependências
8 (interface de usuário).

## Escopo
- Campo de seleção de verbo HTTP (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
- Campo de URL.
- Seção de parâmetros de query (chave/valor, com adicionar/remover linhas).
- Seção de path parameters.
- Seção de headers customizados (chave/valor, com adicionar/remover linhas).
- Seção de body com seleção de tipo (none, raw, x-www-form-urlencoded, form-data) e campos correspondentes.
- Botão de envio da requisição, acionando o comando Tauri de execução (atividade 3).
- Indicação visual de variáveis (`{{variavel}}`) usadas nos campos, resolvidas pelo ambiente ativo da coleção.

## Fora de escopo
Scripts de pré-requisição, autenticação avançada.

## Entregáveis
Formulário funcional de requisição, integrado ao comando Tauri de execução.
