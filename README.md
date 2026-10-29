# Jungle Backend Challenge

Projeto desenvolvido para o desafio de Backend da Jungle.

A ideia principal foi criar uma API para trabalhar com carteiras e transações de apostas, tentando garantir que as operações financeiras fossem seguras e consistentes.

Durante o desenvolvimento, trabalhei principalmente com:

- wallets;
- transações de apostas;
- ledger de movimentações;
- idempotência;
- PostgreSQL;
- AWS SQS;
- retries;
- processamento assíncrono;
- testes unitários, de integração e E2E.

---

## Tecnologias

O projeto foi desenvolvido utilizando:

- TypeScript
- NestJS
- Bun
- PostgreSQL
- MikroORM
- AWS SQS
- Decimal.js
- Supertest
- Oxlint

---

# Funcionalidades

## Wallets

A aplicação permite:

- criar uma wallet;
- consultar uma wallet;
- consultar as movimentações do ledger;
- reconciliar o saldo da wallet com o histórico de movimentações.

As alterações de saldo ficam registradas no ledger para manter um histórico das operações realizadas.

---

# Transações

O sistema suporta os seguintes tipos de transação:

```text id="7xgka1"
BET
WIN
LOSS
REFUND
ROLLBACK
```

## BET

Uma BET realiza um débito na wallet.

Antes de processar, o sistema verifica pontos como:

- existência da wallet;
- saldo disponível;
- moeda;
- idempotência.

Caso a operação seja válida, o saldo é atualizado e a movimentação é registrada no ledger.

---

## WIN

Uma WIN adiciona saldo na wallet.

Também é criada uma movimentação de crédito no ledger.

---

## LOSS

Uma LOSS representa uma aposta que foi perdida.

Nesse caso, o saldo não é alterado novamente porque o valor da aposta já foi debitado anteriormente através do `BET`.

---

## REFUND

Um REFUND devolve o valor de uma aposta.

Antes de processar, algumas informações da transação original são validadas, como:

- wallet;
- player;
- round;
- currency;
- valor;
- tipo da transação.

Também é evitado que o mesmo BET seja reembolsado duas vezes.

---

## ROLLBACK

O ROLLBACK serve para desfazer uma transação anterior.

Por exemplo:

```text id="mw35h3"
BET
DEBIT 25.00

ROLLBACK
CREDIT 25.00
```

No caso de uma transação que originalmente realizou crédito:

```text id="61zk31"
WIN
CREDIT 25.00

ROLLBACK
DEBIT 25.00
```

O sistema também verifica se o rollback já foi realizado e se a operação deixaria o saldo da wallet inválido.

---

# Idempotência

O endpoint de processamento de transações utiliza o header:

```text id="xk0bvk"
Idempotency-Key
```

Isso evita que a mesma operação seja processada duas vezes.

Caso uma requisição seja enviada novamente com a mesma chave e o mesmo conteúdo, o resultado anterior pode ser retornado.

Se a mesma chave for utilizada com dados diferentes, a API retorna:

```text id="fe7ikv"
HTTP 409 Conflict
```

---

# Ledger

As alterações financeiras são registradas no ledger.

Exemplo:

```text id="otssz1"
balanceBefore: 100.00
direction: DEBIT
amount: 25.00
balanceAfter: 75.00
```

Com isso é possível acompanhar como o saldo foi alterado ao longo das transações.

---

# Reconciliação

Foi criado também um endpoint de reconciliação.

Ele compara:

```text id="6dhz2x"
saldo atual da wallet
        x
saldo calculado pelo ledger
```

O resultado informa se os valores estão consistentes ou se existe alguma diferença.

---

# PENDING_REFERENCE

Durante o desenvolvimento também foi tratado o caso em que um REFUND ou ROLLBACK chega antes da transação que ele referencia.

Exemplo:

```text id="gxf6g8"
REFUND chega
     |
     v
BET ainda não existe
```

Nesse caso, a transação não é rejeitada imediatamente.

Ela recebe o status:

```text id="rhf8yy"
PENDING_REFERENCE
```

e fica aguardando uma nova tentativa de processamento.

---

# Retry de referências pendentes

Os retries são persistidos no PostgreSQL.

Foi criada uma estrutura que mantém informações como:

```text id="rc4d6h"
transaction_id
attempts
next_attempt_at
created_at
```

O intervalo entre as tentativas aumenta utilizando exponential backoff.

Fluxo simplificado:

```text id="0mr1py"
PENDING_REFERENCE
        |
        v
aguarda próximo retry
        |
        v
tenta processar novamente
        |
        +--> encontrou referência -> processa
        |
        +--> não encontrou -> agenda outro retry
```

Como os dados ficam no banco, os retries não são perdidos caso a aplicação seja reiniciada.

---

# Transactional Outbox

Para evitar inconsistência entre o banco de dados e a publicação de mensagens, foi utilizado o padrão Transactional Outbox.

Durante uma operação financeira, são salvos na mesma transação:

```text id="up2d4x"
Wallet
WagerTransaction
Ledger
OutboxMessage
```

Depois do commit, as mensagens pendentes podem ser publicadas no SQS.

Assim, caso o SQS esteja temporariamente indisponível, a operação financeira não perde o evento que precisa ser enviado.

---

# Inbox

Também foi implementado um mecanismo de Inbox para evitar que a mesma mensagem recebida seja processada mais de uma vez.

A identificação considera:

```text id="0wt8cz"
consumerName
+
messageId
```

---

# AWS SQS

O projeto utiliza AWS SQS para comunicação assíncrona.

Foram implementados cenários de:

- envio de mensagens;
- recebimento;
- acknowledgement;
- retry;
- tratamento de falhas;
- Dead Letter Queue.

Também existem testes de integração utilizando SQS.

---

# Concorrência

Um dos cenários testados foi o processamento de duas apostas ao mesmo tempo.

Exemplo:

```text id="20hk1n"
Saldo: 100

BET A: 80
BET B: 80
```

As duas operações não podem ser aprovadas, porque isso deixaria o saldo negativo.

O teste verifica que apenas uma delas consegue utilizar o saldo disponível.

---

# Health Check

A aplicação possui verificação de:

## Liveness

Indica se a aplicação está funcionando.

## Readiness

Verifica se as dependências principais estão disponíveis.

Atualmente são verificadas:

```text id="i017qz"
PostgreSQL
SQS
```

---

# Estrutura do projeto

O projeto está organizado da seguinte forma:

```text id="xq1z73"
src/
├── application/
├── domain/
├── infrastructure/
├── migrations/
└── presentation/
```

## Domain

Contém as entidades e regras de negócio.

Exemplos:

```text id="8rswhu"
Wallet
WalletLedgerEntry
WagerTransaction
Money
PendingReferenceRetry
OutboxMessage
InboxMessage
```

## Application

Contém os casos de uso da aplicação.

Exemplos:

```text id="mt6mz7"
CreateWalletUseCase
GetWalletUseCase
ListWalletLedgerUseCase
ProcessWagerUseCase
ReconcileWalletUseCase
ProcessPendingReferenceRetriesUseCase
PublishOutboxUseCase
```

## Infrastructure

Contém implementações relacionadas a:

- PostgreSQL;
- MikroORM;
- repositories;
- SQS;
- workers;
- health checks.

## Presentation

Contém os controllers HTTP.

---

# Endpoints principais

## Criar wallet

```http id="7efsbq"
POST /wallets
```

## Consultar wallet

```http id="pn2ycm"
GET /wallets/:walletId
```

## Consultar ledger

```http id="f5hyv8"
GET /wallets/:walletId/ledger
```

## Reconciliação

```http id="lysi19"
POST /wallets/:walletId/reconciliation
```

## Processar transação

```http id="3eggbg"
POST /wagering/transactions
```

Esse endpoint utiliza o header:

```text id="zkiawl"
Idempotency-Key
```

---

# Instalação

Instale as dependências:

```bash id="u9sa5e"
bun install
```

---

# Banco de dados

O projeto utiliza PostgreSQL com MikroORM.

Para executar as migrations:

```bash id="6p36yd"
bunx mikro-orm migration:up
```

---

# Executando o projeto

Modo de desenvolvimento:

```bash id="6vw9as"
bun run start:dev
```

Build:

```bash id="dmd05r"
bun run build
```

Produção:

```bash id="mzx5py"
bun run start:prod
```

---

# Testes

Para executar todos os testes:

```bash id="3081dm"
bun run test
```

Resultado atual:

```text id="v8v46o"
213 testes
213 passaram
0 falharam
```

---

## Testes E2E

```bash id="k6fdrm"
bun run test:e2e
```

Resultado:

```text id="qrb1ac"
20 testes
20 passaram
0 falharam
```

---

## Cobertura

Para executar os testes com cobertura:

```bash id="c480in"
bun run test:cov
```

Cobertura atual:

```text id="x7r7aj"
Functions: 97.22%
Lines: 96.62%
```

---

# Lint

Para verificar o código:

```bash id="uckzns"
bun run lint
```

Resultado atual:

```text id="mnc2ne"
0 warnings
0 errors
```

---

# Alguns cenários testados

Durante o desenvolvimento foram criados testes para situações como:

- criação de wallet;
- saldo insuficiente;
- BET;
- WIN;
- LOSS;
- REFUND;
- ROLLBACK;
- REFUND duplicado;
- ROLLBACK duplicado;
- idempotência;
- conflito de idempotência;
- concorrência;
- rollback da transação em caso de erro;
- PostgreSQL;
- SQS;
- Outbox;
- Inbox;
- retry de PENDING_REFERENCE;
- recuperação depois de reiniciar a aplicação.

---

# Decisões que tomei no projeto

Algumas decisões que considerei importantes durante o desenvolvimento foram:

- utilizar ledger para manter o histórico das movimentações;
- utilizar transações do PostgreSQL para evitar alterações parciais;
- utilizar Idempotency-Key para evitar duplicidade;
- utilizar Transactional Outbox para não perder eventos;
- utilizar Inbox para evitar processamento repetido;
- persistir os retries de PENDING_REFERENCE;
- utilizar exponential backoff;
- testar concorrência diretamente com PostgreSQL;
- criar health checks para PostgreSQL e SQS.

---

# Autor

**Vitor da Silva Pereira**

Projeto desenvolvido para o desafio de Backend da Jungle.
