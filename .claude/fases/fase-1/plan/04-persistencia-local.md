# 04 — Persistência local

## Objetivo
Implementar a camada de armazenamento local dos dados da aplicação.

## Dependências
1 (estrutura base do projeto).

## Escopo
- Definição do formato de armazenamento local (arquivos JSON em diretório de dados da aplicação, via API de path do Tauri).
- Estrutura de dados para: coleções, requisições dentro de cada coleção, ambientes e variáveis por coleção.
- Operações de leitura e escrita no armazenamento.
- Garantia de persistência entre sessões — dados sobrevivem ao fechamento da aplicação.

## Fora de escopo
Sincronização remota, backup em nuvem, banco de dados externo.

## Entregáveis
Módulo Rust de persistência com funções de leitura e escrita, utilizáveis pelas atividades 5, 6 e 7.
