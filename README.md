# API UI

Um cliente de API leve, rápido e **totalmente offline** — uma alternativa ao Postman para quem só precisa testar requisições HTTP sem depender de conta, nuvem ou sincronização remota.

## Proposta

Ferramentas como Postman cresceram muito além do que a maioria dos desenvolvedores realmente usa no dia a dia: contas obrigatórias, sincronização em nuvem, telemetria, planos pagos. O **API UI** parte do princípio oposto — um cliente de API desktop simples, direto, que roda inteiramente na sua máquina.

Sem login. Sem nuvem. Sem coleta de dados. Tudo o que você cria fica salvo localmente, do seu jeito.

## Diferenciais

- **100% offline** — nenhuma dependência de conta, servidor remoto ou sincronização. Os dados não saem da sua máquina.
- **Leve e nativo** — construído com Tauri, o app roda como um binário nativo compacto, sem o peso de rodar um navegador Chromium embutido (como em soluções baseadas em Electron).
- **Simples por design** — sem excesso de funcionalidades. O foco é o essencial de um cliente de API: montar requisições, organizá-las em coleções e ver a resposta.
- **Dados 100% seus** — coleções, requisições e variáveis de ambiente ficam salvas localmente e podem ser exportadas e reimportadas em JSON quando quiser.

## Funcionalidades

- Requisições HTTP com os verbos GET, POST, PUT, PATCH, DELETE, HEAD e OPTIONS.
- Query params, path params e headers customizados.
- Corpo da requisição em texto puro/JSON, `x-www-form-urlencoded` ou `form-data`.
- Visualização da resposta: status, headers e corpo.
- Organização das requisições em coleções, com criação, edição e remoção.
- Variáveis de ambiente por coleção (com múltiplos ambientes, como dev/staging/prod, e apenas um ativo por vez), usadas via `{{variavel}}` na URL, headers ou body.
- Painéis redimensionáveis, com o layout preservado entre sessões.
- Exportação de uma coleção para arquivo JSON (com requisições, ambientes e variáveis) e importação de volta a partir desse mesmo arquivo, escolhendo a pasta/arquivo por um diálogo nativo.

Funcionalidades como scripts de pré-requisição, autenticação avançada (OAuth etc.), mock servers, GraphQL/WebSocket e importação de coleções de outras ferramentas (Postman, Insomnia, etc.) fazem parte de um escopo futuro, ainda não implementado.

## Tecnologias

- **[Tauri](https://tauri.app/)** — empacota o app como uma aplicação desktop nativa e leve.
- **Rust** — todo o núcleo da aplicação (execução das requisições HTTP, persistência local dos dados).
- **JavaScript, HTML e CSS puros** — interface sem frameworks, mantendo o app simples e com pouquíssimas dependências.

## Como compilar e rodar

Pré-requisitos: [Node.js](https://nodejs.org/) e o [ambiente de desenvolvimento do Tauri](https://tauri.app/start/prerequisites/) (que inclui o Rust) instalados.

```bash
# instalar as dependências do frontend
npm install

# rodar em modo desenvolvimento
npm run tauri dev

# gerar o build de produção (executável nativo)
npm run tauri build
```

O executável gerado pelo build fica em `src-tauri/target/release/`.

## Licença

Distribuído sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

© 2026 João Hudson
