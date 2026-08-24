---
name: nova-fase
description: Cria a estrutura de planejamento de uma nova fase do projeto em `.claude/fases/` — pasta incremental (fase-N), entrada pendente em PROGRESSO.md e o PLAN.md correspondente (descrição direta ou orquestrador com plan/ fragmentado, conforme o tamanho do escopo). Use quando o usuário pedir para criar/iniciar/planejar uma nova fase do projeto.
user-invocable: true
---

# Nova Fase

Skill para iniciar o **planejamento** de uma nova fase de desenvolvimento do projeto, seguindo a convenção já estabelecida em `.claude/fases/` (usar `fase-1` e `fase-2` como referência de formato). Esta skill só gera a estrutura e o(s) plano(s) — a implementação em si é um passo posterior, disparado a partir do PLAN.md gerado aqui.

## Passo 1 — Descobrir o número da fase

Listar as pastas `.claude/fases/fase-*` existentes e pegar o maior N. A nova fase é `fase-(N+1)`. Nunca reaproveitar ou pular números, mesmo que uma fase antiga tenha sido abandonada.

## Passo 2 — Entender o escopo

Se o objetivo da fase não estiver claro pelo pedido do usuário, perguntar antes de prosseguir: qual o objetivo, quais as principais entregas, e o que fica explicitamente fora de escopo. Não presumir escopo por conta própria — cada fase tem trade-offs próprios (ver o "Fora de escopo" da fase 2 como exemplo do nível de precisão esperado).

## Passo 3 — Criar a pasta da fase

Criar `.claude/fases/fase-N/`.

## Passo 4 — Registrar em PROGRESSO.md

Adicionar uma linha ao final de `.claude/fases/PROGRESSO.md`:

```
- Fase N - Pendente
```

Nunca marcar como "Concluída" neste momento — esse status só é atualizado manualmente depois da fase ser de fato executada e validada.

## Passo 5 — Escolher o formato do PLAN.md

Critério: a fase é pequena o bastante para ser executada por um único agente, sem se dividir em atividades independentes? Use o **Formato A**. Caso contrário — múltiplas atividades que podem/devem ser feitas por agentes separados, com dependências entre si — use o **Formato B**.

### Formato A — PLAN.md direto

Modelo: `fase-2/PLAN.md`. Um único arquivo, escrito para ser seguido por um agente executor sozinho, contendo:

- Contexto/motivação da fase e o que ela não amplia do escopo geral do projeto.
- Objetivo.
- Fora de escopo (explícito, não implícito).
- Detalhes de implementação, arquivo por arquivo quando fizer sentido.
- Critérios de aceite.
- Entregáveis.

### Formato B — PLAN.md orquestrador + plan/

Modelo: `fase-1/PLAN.md` + `fase-1/plan/`. O PLAN.md **não implementa nada**, só orquestra; os arquivos de detalhe em `plan/NN-nome-curto.md` (dois dígitos, kebab-case) é que descrevem cada atividade — e não são criados neste momento, apenas referenciados pelo nome. Cada um só é escrito quando a atividade correspondente for de fato disparada para execução.

O PLAN.md orquestrador deve conter, nesta ordem:

1. **Contexto** — o que a fase cobre e não cobre em relação ao escopo geral do projeto.
2. **Quebra de atividades** — lista numerada; cada item com nome curto, descrição de uma frase, "Depende de: `<números ou "nenhuma">`" e o caminho do arquivo de detalhe (`plan/NN-nome-curto.md`).
3. **Dependências e paralelismo** — em prosa, quais atividades formam cadeias sequenciais e quais são independentes entre si.
4. **Ondas de execução** — lista "Onda N: `<atividades>`", agrupando em cada onda as atividades cujas dependências já foram resolvidas nas ondas anteriores (logo, executáveis em paralelo entre si dentro da mesma onda). Deixar explícito quando uma atividade deve rodar de forma contínua/incremental acompanhando outras ondas, em vez de numa onda fixa (caso da atividade "comandos Tauri" na fase 1, que absorve o resultado de várias outras conforme elas terminam).
5. **Forma de execução dos agentes** — declarar explicitamente como cada atividade é disparada: agentes de uma mesma onda rodam em paralelo (uma chamada de Task/Agent por atividade, no mesmo turno); uma onda só começa depois que todas as atividades das quais ela depende, nas ondas anteriores, tiverem concluído; o arquivo `plan/NN-*.md` de cada atividade é escrito imediatamente antes de disparar aquele agente específico — não todos de uma vez no início da fase.
6. **Observações** — ressalvas relevantes, incluindo sempre que "a numeração reflete dependência lógica, não ordem obrigatória de execução" e que nenhum arquivo de detalhamento foi criado nesta etapa de planejamento.

## Passo 6 — Confirmar com o usuário

Depois de criar a pasta, a entrada em PROGRESSO.md e o PLAN.md, resumir o que foi criado (número da fase, formato escolhido e por quê, lista de atividades se Formato B) e perguntar se o escopo e a quebra de atividades estão de acordo antes de partir para a criação dos arquivos de `plan/` individuais ou para a execução.
