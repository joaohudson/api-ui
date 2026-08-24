# 01 — Estrutura base do projeto

## Objetivo
Configurar a base do projeto Tauri, com Rust no backend e JS/HTML/CSS vanilla no frontend, pronta para receber as demais funcionalidades.

## Dependências
Nenhuma.

## Escopo
- Inicialização do projeto Tauri (`tauri.conf.json`, estrutura `src-tauri/` para o backend e diretório próprio para o frontend).
- Configuração do crate Rust principal (`Cargo.toml`, ponto de entrada da aplicação).
- Estrutura de pastas do frontend (HTML, CSS, JS), sem framework.
- Configuração de build e execução em modo desenvolvimento.
- Definição da estrutura de módulos Rust que abrigará as demais funcionalidades: requisições HTTP, persistência, coleções, variáveis de ambiente, exportação e comandos Tauri.

## Fora de escopo
Qualquer lógica de negócio das demais atividades.

## Entregáveis
Projeto Tauri buildável e executável, com tela inicial vazia.
