# 07 — Exportação de coleção em JSON

## Objetivo
Implementar a exportação de uma coleção — com requisições, ambientes e variáveis — para um arquivo JSON.

## Dependências
5 (gerenciamento de coleções), 6 (variáveis de ambiente).

## Escopo
- Definição do formato JSON de exportação (estrutura da coleção, requisições, ambientes e variáveis).
- Serialização da coleção selecionada para esse formato.
- Escrita do arquivo JSON em local escolhido pelo usuário, via diálogo de salvar arquivo do Tauri.

## Fora de escopo
Importação de coleções (de volta ou de outras ferramentas), exportação parcial/seletiva de itens dentro da coleção.

## Entregáveis
Módulo Rust com função de exportação de coleção para JSON.
