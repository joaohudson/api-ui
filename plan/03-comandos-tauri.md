# 03 — Comandos Tauri (ponte Rust ↔ JS)

## Objetivo
Expor as funcionalidades do backend Rust para o frontend JS via comandos Tauri.

## Dependências
2 (motor de requisições HTTP), 5 (gerenciamento de coleções), 6 (variáveis de ambiente), 7 (exportação em JSON).

## Escopo
- Comando Tauri para execução de requisição HTTP, usando o motor da atividade 2.
- Comandos Tauri para CRUD de coleções e requisições, usando a atividade 5.
- Comandos Tauri para leitura e escrita de ambientes/variáveis por coleção, usando a atividade 6.
- Comando Tauri para exportação de coleção em JSON, usando a atividade 7.
- Padronização do formato de entrada e saída dos comandos (serialização via serde).
- Registro dos comandos no builder do Tauri.

## Fora de escopo
Lógica de negócio em si — implementada nas atividades 2, 5, 6 e 7. Esta atividade cobre apenas a exposição/ponte para o frontend.

## Observação de execução
Implementação incremental: cada comando é adicionado assim que a funcionalidade correspondente (2, 5, 6 ou 7) fica pronta, sem esperar todas prontas simultaneamente.

## Entregáveis
Conjunto de comandos Tauri registrados e prontos para chamada via `invoke` no frontend.
