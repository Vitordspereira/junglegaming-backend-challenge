import { randomUUID } from 'node:crypto';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import { ProcessWagerUseCase } from '../../src/application/use-cases/process-wager.use-case.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';
import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';
import { Wallet } from '../../src/domain/wallet/wallet.js';

import { MikroOrmTransactionManager } from '../../src/infrastructure/database/mikro-orm-transaction-manager.js';
import { MikroOrmWagerTransactionRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletLedgerEntryRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';
import { MikroOrmWalletRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet.repository.js';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('ProcessWagerUseCase concurrency integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('allows only one BET when two concurrent debits would exceed the wallet balance', async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();

    const transactionAId = randomUUID();
    const transactionBId = randomUUID();

    /*
     * Primeiro criei a wallet.
     *
     * Ela precisa estar COMMITADA antes das duas operações concorrentes,
     * porque cada BET usará sua própria transação PostgreSQL.
     */
    const setupEntityManager = orm.em.fork();

    const setupWalletRepository =
      new MikroOrmWalletRepository(setupEntityManager);

    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    await setupWalletRepository.save(wallet);

    /*
     * BET A possui seu próprio EntityManager.
     *
     * useContext: true permite que esse fork reconheça
     * o contexto criado pelo transactional().
     */
    const entityManagerA = orm.em.fork({
      useContext: true,
    });

    const walletRepositoryA =
      new MikroOrmWalletRepository(entityManagerA);

    const wagerRepositoryA =
      new MikroOrmWagerTransactionRepository(entityManagerA);

    const ledgerRepositoryA =
      new MikroOrmWalletLedgerEntryRepository(entityManagerA);

    const transactionManagerA =
      new MikroOrmTransactionManager(entityManagerA);

    const useCaseA = new ProcessWagerUseCase(
      walletRepositoryA,
      wagerRepositoryA,
      ledgerRepositoryA,
      transactionManagerA,
    );

    /*
     * BET B possui outro EntityManager independente.
     *
     * Também usei useContext: true para que sua transação
     * seja reconhecida corretamente pelo repository.
     */
    const entityManagerB = orm.em.fork({
      useContext: true,
    });

    const walletRepositoryB =
      new MikroOrmWalletRepository(entityManagerB);

    const wagerRepositoryB =
      new MikroOrmWagerTransactionRepository(entityManagerB);

    const ledgerRepositoryB =
      new MikroOrmWalletLedgerEntryRepository(entityManagerB);

    const transactionManagerB =
      new MikroOrmTransactionManager(entityManagerB);

    const useCaseB = new ProcessWagerUseCase(
      walletRepositoryB,
      wagerRepositoryB,
      ledgerRepositoryB,
      transactionManagerB,
    );

    /*
     * As duas BETs tentam retirar 80.00 ao mesmo tempo
     * de uma wallet com apenas 100.00.
     */
    const [resultA, resultB] = await Promise.all([
      useCaseA.execute({
        id: transactionAId,
        providerId: 'concurrency-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        walletId,
        playerId,
        roundId: 'round-concurrency',
        gameId: 'game-concurrency',
        kind: WagerTransactionKind.Bet,
        amount: '80.00',
        currency: 'BRL',
      }),

      useCaseB.execute({
        id: transactionBId,
        providerId: 'concurrency-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        walletId,
        playerId,
        roundId: 'round-concurrency',
        gameId: 'game-concurrency',
        kind: WagerTransactionKind.Bet,
        amount: '80.00',
        currency: 'BRL',
      }),
    ]);

    /*
     * Não importa qual BET ganha a corrida.
     *
     * Preciso de:
     *
     * 1 PROCESSED
     * 1 REJECTED
     */
    const results = [resultA, resultB];

    const processedResults = results.filter(
      (result) =>
        result.status === WagerTransactionStatus.Processed,
    );

    const rejectedResults = results.filter(
      (result) =>
        result.status === WagerTransactionStatus.Rejected,
    );

    expect(processedResults).toHaveLength(1);

    expect(rejectedResults).toHaveLength(1);

    expect(
      processedResults[0]?.balance,
    ).toBe('20.00');

    expect(
      rejectedResults[0]?.balance,
    ).toBe('20.00');

    expect(
      rejectedResults[0]?.failureCode,
    ).toBe(FailureCode.InsufficientFunds);

    /*
     * Um terceiro EntityManager consulta o estado final
     * realmente persistido no PostgreSQL.
     */
    const verificationEntityManager =
      orm.em.fork();

    const verificationWalletRepository =
      new MikroOrmWalletRepository(
        verificationEntityManager,
      );

    const verificationWagerRepository =
      new MikroOrmWagerTransactionRepository(
        verificationEntityManager,
      );

    const verificationLedgerRepository =
      new MikroOrmWalletLedgerEntryRepository(
        verificationEntityManager,
      );

    const persistedWallet =
      await verificationWalletRepository.findById(
        walletId,
      );

    expect(persistedWallet).not.toBeNull();

    expect(
      persistedWallet?.balance.toString(),
    ).toBe('20.00');

    expect(persistedWallet?.version).toBe(2);

    const persistedTransactionA =
      await verificationWagerRepository.findById(
        transactionAId,
      );

    const persistedTransactionB =
      await verificationWagerRepository.findById(
        transactionBId,
      );

    expect(persistedTransactionA).not.toBeNull();

    expect(persistedTransactionB).not.toBeNull();

    const persistedTransactions = [
      persistedTransactionA,
      persistedTransactionB,
    ];

    const processedTransactions =
      persistedTransactions.filter(
        (transaction) =>
          transaction?.status ===
          WagerTransactionStatus.Processed,
      );

    const rejectedTransactions =
      persistedTransactions.filter(
        (transaction) =>
          transaction?.status ===
          WagerTransactionStatus.Rejected,
      );

    expect(processedTransactions).toHaveLength(1);

    expect(rejectedTransactions).toHaveLength(1);

    expect(
      rejectedTransactions[0]?.failureCode,
    ).toBe(FailureCode.InsufficientFunds);

    /*
     * Somente a BET vencedora pode gerar uma entrada
     * no ledger.
     */
    const ledgerA =
      await verificationLedgerRepository.findByWalletAndTransaction(
        walletId,
        transactionAId,
      );

    const ledgerB =
      await verificationLedgerRepository.findByWalletAndTransaction(
        walletId,
        transactionBId,
      );

    const ledgers = [
      ledgerA,
      ledgerB,
    ].filter(
      (ledger) => ledger !== null,
    );

    expect(ledgers).toHaveLength(1);

    expect(
      ledgers[0]?.balanceBefore.toString(),
    ).toBe('100.00');

    expect(
      ledgers[0]?.balanceAfter.toString(),
    ).toBe('20.00');
  });
});