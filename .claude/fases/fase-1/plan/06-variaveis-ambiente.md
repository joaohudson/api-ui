# 06 — Variáveis de ambiente

## Objetivo
Implementar variáveis de ambiente configuráveis por coleção.

## Dependências
5 (gerenciamento de coleções).

## Escopo
- Modelo de dados de ambiente (nome do ambiente, conjunto de variáveis chave/valor) associado a uma coleção.
- Suporte a múltiplos ambientes por coleção, com apenas um ativo por vez.
- Função de resolução de variáveis: substituição de `{{variavel}}` pelo valor correspondente no ambiente ativo, aplicada a URL, headers e body antes do envio da requisição.
- CRUD de ambientes e variáveis dentro de uma coleção.
- Uso da camada de persistência (atividade 4) para gravar e ler os dados.

## Fora de escopo
Variáveis globais fora do escopo de coleção, variáveis dinâmicas ou geradas por script.

## Entregáveis
Módulo Rust com funções de CRUD de ambientes/variáveis e função de resolução de variáveis em texto.
