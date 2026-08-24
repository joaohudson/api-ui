# Especificação do Projeto

Alternativa ao Postman, totalmente offline, sem dependência de conta, nuvem ou sincronização remota. Todos os dados ficam armazenados localmente na máquina do usuário.

## Stack

- Aplicação desktop em Tauri.
- Backend/core em Rust.
- Frontend em JavaScript vanilla, HTML e CSS vanilla (sem frameworks de UI).

## Funcionalidades incluídas nesta fase

### Requisições HTTP
- Suporte aos verbos: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- Definição de URL com parâmetros de query (query params).
- Definição de path parâmetros.
- Definição de headers customizados.
- Definição de body da requisição, com os tipos:
  - none
  - raw (texto plano ou JSON)
  - x-www-form-urlencoded
  - form-data
- Exibição da resposta: status code, headers e corpo (texto/JSON).

### Coleções
- Criação, edição, remoção e organização de requisições em coleções.
- Cada requisição pertence a uma coleção.

### Variáveis de ambiente
- Variáveis de ambiente configuráveis por coleção (chave/valor).
- Uso das variáveis via sintaxe `{{variavel}}` em URL, headers e body.
- Cada coleção pode ter múltiplos ambientes (ex.: dev, staging, prod), com apenas um ativo por vez.

### Persistência e exportação
- Salvamento local de coleções, requisições e variáveis de ambiente (sem sincronização externa).
- Exportação de coleção para arquivo JSON.

## Fora de escopo nesta fase

- Scripts de pré-requisição e testes (pre-request/test scripts).
- Visualização avançada de resposta (PDF, imagem, HTML renderizado, etc.).
- Sincronização em nuvem, contas de usuário e colaboração em equipe.
- Mock servers e monitoramento de APIs.
- Geração de documentação de API.
- Suporte a GraphQL e WebSocket.
- Geração de snippets de código em outras linguagens.
- Importação de coleções de outras ferramentas (Postman, Insomnia, etc.).
- Autenticação avançada (OAuth, AWS Signature, etc.) — apenas headers manuais nesta fase.
