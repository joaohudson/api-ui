# Plano de Execução

Este plano orquestra a execução do projeto descrito em `CLAUDE.md`, quebrando o trabalho em atividades independentes. Cada atividade terá um arquivo de detalhamento próprio, destinado a um agente independente. Os arquivos de detalhamento ainda não existem — apenas seus nomes estão prescritos aqui.

## Quebra de atividades

1. **Estrutura base do projeto** — configuração inicial do Tauri, Rust e frontend (JS/HTML/CSS).
   Depende de: nenhuma.
   Arquivo de detalhe: `plan/01-estrutura-base.md`

2. **Motor de requisições HTTP** — execução das requisições (verbos, params, headers, body) no lado Rust.
   Depende de: 1.
   Arquivo de detalhe: `plan/02-motor-requisicoes-http.md`

3. **Comandos Tauri (ponte Rust ↔ JS)** — exposição das funcionalidades do backend para o frontend.
   Depende de: 2, 5, 6, 7.
   Arquivo de detalhe: `plan/03-comandos-tauri.md`

4. **Persistência local** — armazenamento local de coleções, requisições e variáveis de ambiente.
   Depende de: 1.
   Arquivo de detalhe: `plan/04-persistencia-local.md`

5. **Gerenciamento de coleções** — criação, edição, remoção e organização de coleções e requisições.
   Depende de: 4.
   Arquivo de detalhe: `plan/05-gerenciamento-colecoes.md`

6. **Variáveis de ambiente** — definição e uso de variáveis por coleção.
   Depende de: 5.
   Arquivo de detalhe: `plan/06-variaveis-ambiente.md`

7. **Exportação de coleção em JSON** — geração do arquivo de exportação a partir de uma coleção.
   Depende de: 5, 6.
   Arquivo de detalhe: `plan/07-exportacao-json.md`

8. **Interface de usuário** — layout geral, navegação e telas da aplicação.
   Depende de: 1.
   Arquivo de detalhe: `plan/08-interface-ui.md`

9. **Editor de requisição** — formulário de montagem da requisição (verbo, URL, params, headers, body).
   Depende de: 8.
   Arquivo de detalhe: `plan/09-editor-requisicao.md`

10. **Visualização de resposta** — exibição de status code, headers e corpo da resposta.
    Depende de: 8, 9.
    Arquivo de detalhe: `plan/10-visualizacao-resposta.md`

## Dependências e paralelismo

A atividade 1 é pré-requisito de todas as demais e deve ser executada primeiro, isoladamente.

A partir daí, o trabalho se divide em duas frentes independentes até certo ponto: backend (2, 4, 5, 6, 7) e frontend (8, 9, 10). Cada frente tem sua própria cadeia sequencial interna:

- Backend: 4 → 5 → 6 → 7 (sequencial; cada uma usa a estrutura definida pela anterior). A atividade 2 é independente dessa cadeia, só depende de 1.
- Frontend: 8 → 9 → 10 (sequencial; cada uma usa a tela construída pela anterior).

A atividade 3 (comandos Tauri) consome o resultado de 2, 5, 6 e 7. Para evitar que fique bloqueada até o fim de toda a cadeia de backend, deve ser implementada de forma incremental: um comando é adicionado assim que a funcionalidade correspondente (2, 5, 6 ou 7) fica pronta, em vez de esperar todas prontas ao mesmo tempo.

### Ondas de execução

- **Onda 1** (sequencial): 1
- **Onda 2** (paralelo entre si): 2, 4, 8
- **Onda 3** (paralelo entre si): 5 (depende de 4), 9 (depende de 8)
- **Onda 4**: 6 (depende de 5)
- **Onda 5**: 7 (depende de 5 e 6)
- **Onda 6**: 10 (depende de 8 e 9)
- **Integração contínua**: 3 roda em paralelo às ondas 2 a 5, incorporando cada comando assim que 2, 5, 6 ou 7 conclui. Sua conclusão total coincide com o fim da onda 5.

## Observações

- A numeração da lista reflete dependência lógica entre as atividades, não ordem obrigatória de execução.
- Nenhum arquivo de detalhamento foi criado nesta etapa.
