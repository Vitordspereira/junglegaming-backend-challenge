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
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';
import { Wallet } from '../../src/domain/wallet/wallet.js';
import { LedgerDirection } from '../../src/domain/wallet/wallet-ledger-entry.js';

import { MikroOrmTransactionManager } from '../../src/infrastructure/database/mikro-orm-transaction-manager.js';
import { MikroOrmWagerTransactionRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletLedgerEntryRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';
import { MikroOrmWalletRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet.repository.js';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('ProcessWagerUseCase integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('processes a BET atomically in PostgreSQL', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();
      const transactionId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const result = await useCase.execute({
        id: transactionId,
        providerId: 'integration-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        walletId,
        playerId,
        roundId: 'round-integration',
        gameId: 'game-integration',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      });

      expect(result.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(result.balance).toBe('75.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedTransaction =
        await wagerTransactionRepository.findById(
          transactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          transactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('75.00');

      expect(persistedWallet?.version).toBe(2);

      expect(persistedTransaction).not.toBeNull();

      expect(persistedTransaction?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        persistedTransaction?.resultBalance?.toString(),
      ).toBe('75.00');

      expect(ledgerEntry).not.toBeNull();

      expect(ledgerEntry?.direction).toBe(
        LedgerDirection.Debit,
      );

      expect(
        ledgerEntry?.balanceBefore.toString(),
      ).toBe('100.00');

      expect(
        ledgerEntry?.balanceAfter.toString(),
      ).toBe('75.00');
    } finally {
      await entityManager.rollback();
    }
  });

  it('rolls back the whole transaction when ledger persistence fails', async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    const transactionId = randomUUID();

    /*
     * Primeiro persistimos a wallet inicial
     * em uma transacao independente e
     * confirmada.
     *
     * Assim ela representa o estado existente
     * antes do processamento da aposta.
     */
    const setupEntityManager =
      orm.em.fork();

    await setupEntityManager.begin();

    try {
      const setupWalletRepository =
        new MikroOrmWalletRepository(
          setupEntityManager,
        );

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await setupWalletRepository.save(
        wallet,
      );

      await setupEntityManager.commit();
    } catch (error) {
      await setupEntityManager.rollback();
      throw error;
    }

    /*
     * Nova EntityManager.
     *
     * Nao abrimos transaction manualmente.
     * Agora o MikroOrmTransactionManager e
     * realmente o dono da transacao do
     * ProcessWagerUseCase.
     */
    const processingEntityManager =
      orm.em.fork({
        useContext: true,
      });

    const walletRepository =
      new MikroOrmWalletRepository(
        processingEntityManager,
      );

    const wagerTransactionRepository =
      new MikroOrmWagerTransactionRepository(
        processingEntityManager,
      );

    const transactionManager =
      new MikroOrmTransactionManager(
        processingEntityManager,
      );

    const failingLedgerRepository = {
      async findById() {
        return null;
      },

      async findByWalletAndTransaction() {
        return null;
      },

      async append() {
        throw new Error(
          'Simulated ledger failure',
        );
      },
    };

    const useCase =
      new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        failingLedgerRepository,
        transactionManager,
      );

    try {
      await expect(
        useCase.execute({
          id: transactionId,
          providerId: 'rollback-provider',
          externalTransactionId: randomUUID(),
          idempotencyKey: randomUUID(),
          payloadHash:
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          walletId,
          playerId,
          roundId: 'round-rollback',
          gameId: 'game-rollback',
          kind: WagerTransactionKind.Bet,
          amount: '25.00',
          currency: 'BRL',
        }),
      ).rejects.toThrow(
        'Simulated ledger failure',
      );

      /*
       * Outra EntityManager garante que
       * estamos lendo o estado realmente
       * persistido depois do rollback.
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

      const persistedWallet =
        await verificationWalletRepository.findById(
          walletId,
        );

      const persistedTransaction =
        await verificationWagerRepository.findById(
          transactionId,
        );

      /*
       * O debito precisa ter sido revertido.
       */
      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      expect(
        persistedWallet?.version,
      ).toBe(1);

      /*
       * A WagerTransaction tambem nao pode
       * sobreviver ao rollback.
       */
      expect(
        persistedTransaction,
      ).toBeNull();
    } finally {
      /*
       * Como a wallet inicial foi realmente
       * commitada, limpamos o dado criado
       * pelo teste.
       */
      const cleanupEntityManager =
        orm.em.fork();

      await cleanupEntityManager
        .getConnection()
        .execute(
          `
            DELETE FROM wager_transactions
            WHERE id = ?
          `,
          [
            transactionId,
          ],
        );

      await cleanupEntityManager
        .getConnection()
        .execute(
          `
            DELETE FROM wallets
            WHERE id = ?
          `,
          [
            walletId,
          ],
        );
    }
  });

  it('processes a WIN atomically in PostgreSQL', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();
      const transactionId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const result = await useCase.execute({
        id: transactionId,
        providerId: 'integration-win-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        walletId,
        playerId,
        roundId: 'round-win',
        gameId: 'game-win',
        kind: WagerTransactionKind.Win,
        amount: '40.00',
        currency: 'BRL',
      });

      expect(result.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(result.balance).toBe('140.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedTransaction =
        await wagerTransactionRepository.findById(
          transactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          transactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('140.00');

      expect(persistedWallet?.version).toBe(2);

      expect(persistedTransaction).not.toBeNull();

      expect(persistedTransaction?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        persistedTransaction?.resultBalance?.toString(),
      ).toBe('140.00');

      expect(ledgerEntry).not.toBeNull();

      expect(ledgerEntry?.direction).toBe(
        LedgerDirection.Credit,
      );

      expect(
        ledgerEntry?.balanceBefore.toString(),
      ).toBe('100.00');

      expect(
        ledgerEntry?.balanceAfter.toString(),
      ).toBe('140.00');
    } finally {
      await entityManager.rollback();
    }
  });

  it('processes a LOSS without changing the wallet or creating ledger', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();
      const transactionId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const result = await useCase.execute({
        id: transactionId,
        providerId: 'integration-loss-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        walletId,
        playerId,
        roundId: 'round-loss',
        gameId: 'game-loss',
        kind: WagerTransactionKind.Loss,
        amount: '0.00',
        currency: 'BRL',
      });

      expect(result.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(result.balance).toBe('100.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedTransaction =
        await wagerTransactionRepository.findById(
          transactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          transactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      expect(persistedWallet?.version).toBe(1);

      expect(persistedTransaction).not.toBeNull();

      expect(persistedTransaction?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        persistedTransaction?.resultBalance?.toString(),
      ).toBe('100.00');

      expect(ledgerEntry).toBeNull();
    } finally {
      await entityManager.rollback();
    }
  });

  it('processes a REFUND of a processed BET atomically in PostgreSQL', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();

      const betTransactionId = randomUUID();
      const refundTransactionId = randomUUID();

      const betExternalTransactionId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const referencedBet = WagerTransaction.create({
        id: betTransactionId,
        providerId: 'integration-refund-provider',
        externalTransactionId:
          betExternalTransactionId,
        idempotencyKey: randomUUID(),
        payloadHash:
          '1111111111111111111111111111111111111111111111111111111111111111',
        walletId,
        playerId,
        roundId: 'round-refund',
        gameId: 'game-refund',
        kind: WagerTransactionKind.Bet,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

      referencedBet.markProcessed(
        undefined,
        new Date(),
        Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      );

      await wagerTransactionRepository.save(
        referencedBet,
      );

      const result = await useCase.execute({
        id: refundTransactionId,
        providerId: 'integration-refund-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          '2222222222222222222222222222222222222222222222222222222222222222',
        walletId,
        playerId,
        roundId: 'round-refund',
        gameId: 'game-refund',
        kind: WagerTransactionKind.Refund,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          betExternalTransactionId,
      });

      expect(result.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(result.balance).toBe('100.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedRefund =
        await wagerTransactionRepository.findById(
          refundTransactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          refundTransactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      expect(persistedWallet?.version).toBe(2);

      expect(persistedRefund).not.toBeNull();

      expect(persistedRefund?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        persistedRefund?.referenceTransactionId,
      ).toBe(betTransactionId);

      expect(
        persistedRefund?.resultBalance?.toString(),
      ).toBe('100.00');

      expect(ledgerEntry).not.toBeNull();

      expect(ledgerEntry?.direction).toBe(
        LedgerDirection.Credit,
      );

      expect(
        ledgerEntry?.balanceBefore.toString(),
      ).toBe('75.00');

      expect(
        ledgerEntry?.balanceAfter.toString(),
      ).toBe('100.00');
    } finally {
      await entityManager.rollback();
    }
  });

  it('persists a REFUND as PENDING_REFERENCE when the referenced BET does not exist', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();
      const refundTransactionId = randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const missingReferenceExternalTransactionId =
        randomUUID();

      const result = await useCase.execute({
        id: refundTransactionId,
        providerId:
          'integration-pending-reference-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          '3333333333333333333333333333333333333333333333333333333333333333',
        walletId,
        playerId,
        roundId: 'round-pending-reference',
        gameId: 'game-pending-reference',
        kind: WagerTransactionKind.Refund,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          missingReferenceExternalTransactionId,
      });

      expect(result.status).toBe(
        WagerTransactionStatus.PendingReference,
      );

      expect(result.balance).toBe('75.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedRefund =
        await wagerTransactionRepository.findById(
          refundTransactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          refundTransactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('75.00');

      expect(persistedWallet?.version).toBe(1);

      expect(persistedRefund).not.toBeNull();

      expect(persistedRefund?.status).toBe(
        WagerTransactionStatus.PendingReference,
      );

      expect(
        persistedRefund?.referenceExternalTransactionId,
      ).toBe(
        missingReferenceExternalTransactionId,
      );

      expect(
        persistedRefund?.referenceTransactionId,
      ).toBeUndefined();

      expect(
        persistedRefund?.resultBalance,
      ).toBeUndefined();

      expect(ledgerEntry).toBeNull();
    } finally {
      await entityManager.rollback();
    }
  });

  it('persists a REFUND as REJECTED when the referenced transaction is not a processed BET', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const walletId = randomUUID();
      const playerId = randomUUID();

      const referencedTransactionId = randomUUID();
      const refundTransactionId = randomUUID();
      const referencedExternalTransactionId =
        randomUUID();

      const wallet = Wallet.open({
        id: walletId,
        playerId,
        initialBalance: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const referencedWin = WagerTransaction.create({
        id: referencedTransactionId,
        providerId:
          'integration-invalid-refund-provider',
        externalTransactionId:
          referencedExternalTransactionId,
        idempotencyKey: randomUUID(),
        payloadHash:
          '4444444444444444444444444444444444444444444444444444444444444444',
        walletId,
        playerId,
        roundId: 'round-invalid-refund',
        gameId: 'game-invalid-refund',
        kind: WagerTransactionKind.Win,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

      referencedWin.markProcessed(
        undefined,
        new Date(),
        Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      );

      await wagerTransactionRepository.save(
        referencedWin,
      );

      const result = await useCase.execute({
        id: refundTransactionId,
        providerId:
          'integration-invalid-refund-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash:
          '5555555555555555555555555555555555555555555555555555555555555555',
        walletId,
        playerId,
        roundId: 'round-invalid-refund',
        gameId: 'game-invalid-refund',
        kind: WagerTransactionKind.Refund,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          referencedExternalTransactionId,
      });

      expect(result.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(result.failureCode).toBe(
        FailureCode.InvalidReference,
      );

      expect(result.balance).toBe('75.00');
      expect(result.idempotentReplay).toBe(false);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedRefund =
        await wagerTransactionRepository.findById(
          refundTransactionId,
        );

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          walletId,
          refundTransactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('75.00');

      expect(persistedWallet?.version).toBe(1);

      expect(persistedRefund).not.toBeNull();

      expect(persistedRefund?.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(persistedRefund?.failureCode).toBe(
        FailureCode.InvalidReference,
      );

      expect(
        persistedRefund?.resultBalance?.toString(),
      ).toBe('75.00');

      expect(
        persistedRefund?.referenceTransactionId,
      ).toBeUndefined();

      expect(ledgerEntry).toBeNull();
    } finally {
      await entityManager.rollback();
    }
  });

  it('should reject a second REFUND for the same processed BET', async () => {
    const em = orm.em.fork();

    await em.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(em);

      const wagerRepository =
        new MikroOrmWagerTransactionRepository(em);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(em);

      const transactionManager =
        new MikroOrmTransactionManager(em);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerRepository,
        ledgerRepository,
        transactionManager,
      );

      const wallet = Wallet.open({
        id: '21212121-2121-2121-2121-212121212121',
        playerId: '31313131-3131-3131-3131-313131313131',
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const bet = await useCase.execute({
        id: '41414141-4141-4141-4141-414141414141',
        providerId: 'provider-integration-duplicate-refund',
        externalTransactionId:
          'external-bet-integration-duplicate-refund',
        idempotencyKey:
          'key-bet-integration-duplicate-refund',
        payloadHash:
          'hash-bet-integration-duplicate-refund',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-refund',
        gameId: 'game-integration-duplicate-refund',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      });

      expect(bet.status).toBe(
        WagerTransactionStatus.Processed,
      );
      expect(bet.balance).toBe('75.00');

      const firstRefund = await useCase.execute({
        id: '51515151-5151-5151-5151-515151515151',
        providerId: 'provider-integration-duplicate-refund',
        externalTransactionId:
          'external-refund-integration-duplicate-refund-1',
        idempotencyKey:
          'key-refund-integration-duplicate-refund-1',
        payloadHash:
          'hash-refund-integration-duplicate-refund-1',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-refund',
        gameId: 'game-integration-duplicate-refund',
        kind: WagerTransactionKind.Refund,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          'external-bet-integration-duplicate-refund',
      });

      expect(firstRefund.status).toBe(
        WagerTransactionStatus.Processed,
      );
      expect(firstRefund.balance).toBe('100.00');

      const secondRefund = await useCase.execute({
        id: '61616161-6161-6161-6161-616161616161',
        providerId: 'provider-integration-duplicate-refund',
        externalTransactionId:
          'external-refund-integration-duplicate-refund-2',
        idempotencyKey:
          'key-refund-integration-duplicate-refund-2',
        payloadHash:
          'hash-refund-integration-duplicate-refund-2',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-refund',
        gameId: 'game-integration-duplicate-refund',
        kind: WagerTransactionKind.Refund,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          'external-bet-integration-duplicate-refund',
      });

      expect(secondRefund.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(secondRefund.failureCode).toBe(
        FailureCode.DuplicateReversal,
      );

      expect(secondRefund.balance).toBe('100.00');

      const persistedWallet =
        await walletRepository.findById(wallet.id);

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      const firstRefundTransaction =
        await wagerRepository.findByProviderAndExternalTransactionId(
          'provider-integration-duplicate-refund',
          'external-refund-integration-duplicate-refund-1',
        );

      expect(firstRefundTransaction).not.toBeNull();

      expect(firstRefundTransaction?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        firstRefundTransaction?.referenceTransactionId,
      ).toBe(
        '41414141-4141-4141-4141-414141414141',
      );

      const secondRefundTransaction =
        await wagerRepository.findByProviderAndExternalTransactionId(
          'provider-integration-duplicate-refund',
          'external-refund-integration-duplicate-refund-2',
        );

      expect(secondRefundTransaction).not.toBeNull();

      expect(secondRefundTransaction?.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(
        secondRefundTransaction?.failureCode,
      ).toBe(
        FailureCode.DuplicateReversal,
      );

      const firstRefundLedger =
        await ledgerRepository.findByWalletAndTransaction(
          wallet.id,
          '51515151-5151-5151-5151-515151515151',
        );

      expect(firstRefundLedger).not.toBeNull();

      const secondRefundLedger =
        await ledgerRepository.findByWalletAndTransaction(
          wallet.id,
          '61616161-6161-6161-6161-616161616161',
        );

      expect(secondRefundLedger).toBeNull();
    } finally {
      await em.rollback();
    }
  });

  it('processes a ROLLBACK of a processed BET atomically in PostgreSQL', async () => {
    const em = orm.em.fork();

    await em.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(em);

      const wagerRepository =
        new MikroOrmWagerTransactionRepository(em);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(em);

      const transactionManager =
        new MikroOrmTransactionManager(em);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerRepository,
        ledgerRepository,
        transactionManager,
      );

      const wallet = Wallet.open({
        id: '71717171-1111-2222-3333-717171717171',
        playerId: '81818181-1111-2222-3333-818181818181',
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const bet = await useCase.execute({
        id: '91919191-1111-2222-3333-919191919191',
        providerId: 'provider-integration-rollback-bet',
        externalTransactionId:
          'external-bet-integration-rollback-bet',
        idempotencyKey:
          'key-bet-integration-rollback-bet',
        payloadHash:
          'hash-bet-integration-rollback-bet',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-rollback-bet',
        gameId: 'game-integration-rollback-bet',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      });

      expect(bet.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(bet.balance).toBe('75.00');

      const rollback = await useCase.execute({
        id: 'a1a1a1a1-1111-2222-3333-a1a1a1a1a1a1',
        providerId: 'provider-integration-rollback-bet',
        externalTransactionId:
          'external-rollback-integration-bet',
        idempotencyKey:
          'key-rollback-integration-bet',
        payloadHash:
          'hash-rollback-integration-bet',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-rollback-bet',
        gameId: 'game-integration-rollback-bet',
        kind: WagerTransactionKind.Rollback,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          'external-bet-integration-rollback-bet',
      });

      expect(rollback.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(rollback.balance).toBe('100.00');
      expect(rollback.failureCode).toBeUndefined();

      const persistedWallet =
        await walletRepository.findById(wallet.id);

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      const persistedRollback =
        await wagerRepository.findByProviderAndExternalTransactionId(
          'provider-integration-rollback-bet',
          'external-rollback-integration-bet',
        );

      expect(persistedRollback).not.toBeNull();

      expect(persistedRollback?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        persistedRollback?.referenceTransactionId,
      ).toBe(
        '91919191-1111-2222-3333-919191919191',
      );

      expect(
        persistedRollback?.resultBalance?.toString(),
      ).toBe('100.00');

      const rollbackLedger =
        await ledgerRepository.findByWalletAndTransaction(
          wallet.id,
          'a1a1a1a1-1111-2222-3333-a1a1a1a1a1a1',
        );

      expect(rollbackLedger).not.toBeNull();

      expect(rollbackLedger?.direction).toBe(
        LedgerDirection.Credit,
      );

      expect(
        rollbackLedger?.money.toString(),
      ).toBe('25.00');

      expect(
        rollbackLedger?.balanceBefore.toString(),
      ).toBe('75.00');

      expect(
        rollbackLedger?.balanceAfter.toString(),
      ).toBe('100.00');
    } finally {
      await em.rollback();
    }
  });

  it('rejects a second ROLLBACK for the same processed transaction in PostgreSQL', async () => {
    const em = orm.em.fork();

    await em.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(em);

      const wagerRepository =
        new MikroOrmWagerTransactionRepository(em);

      const ledgerRepository =
        new MikroOrmWalletLedgerEntryRepository(em);

      const transactionManager =
        new MikroOrmTransactionManager(em);

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerRepository,
        ledgerRepository,
        transactionManager,
      );

      const wallet = Wallet.open({
        id: 'b1b1b1b1-1111-2222-3333-b1b1b1b1b1b1',
        playerId: 'c1c1c1c1-1111-2222-3333-c1c1c1c1c1c1',
        initialBalance: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
      });

      await walletRepository.save(wallet);

      const bet = await useCase.execute({
        id: 'd1d1d1d1-1111-2222-3333-d1d1d1d1d1d1',
        providerId: 'provider-integration-duplicate-rollback',
        externalTransactionId:
          'external-bet-integration-duplicate-rollback',
        idempotencyKey:
          'key-bet-integration-duplicate-rollback',
        payloadHash:
          'hash-bet-integration-duplicate-rollback',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-rollback',
        gameId: 'game-integration-duplicate-rollback',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      });

      expect(bet.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(bet.balance).toBe('75.00');

      const firstRollback = await useCase.execute({
        id: 'e1e1e1e1-1111-2222-3333-e1e1e1e1e1e1',
        providerId: 'provider-integration-duplicate-rollback',
        externalTransactionId:
          'external-rollback-integration-duplicate-1',
        idempotencyKey:
          'key-rollback-integration-duplicate-1',
        payloadHash:
          'hash-rollback-integration-duplicate-1',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-rollback',
        gameId: 'game-integration-duplicate-rollback',
        kind: WagerTransactionKind.Rollback,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          'external-bet-integration-duplicate-rollback',
      });

      expect(firstRollback.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(firstRollback.balance).toBe('100.00');

      const secondRollback = await useCase.execute({
        id: 'f1f1f1f1-1111-2222-3333-f1f1f1f1f1f1',
        providerId: 'provider-integration-duplicate-rollback',
        externalTransactionId:
          'external-rollback-integration-duplicate-2',
        idempotencyKey:
          'key-rollback-integration-duplicate-2',
        payloadHash:
          'hash-rollback-integration-duplicate-2',
        walletId: wallet.id,
        playerId: wallet.playerId,
        roundId: 'round-integration-duplicate-rollback',
        gameId: 'game-integration-duplicate-rollback',
        kind: WagerTransactionKind.Rollback,
        amount: '25.00',
        currency: 'BRL',
        referenceExternalTransactionId:
          'external-bet-integration-duplicate-rollback',
      });

      expect(secondRollback.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(secondRollback.failureCode).toBe(
        FailureCode.DuplicateReversal,
      );

      expect(secondRollback.balance).toBe('100.00');

      const persistedWallet =
        await walletRepository.findById(wallet.id);

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      const firstRollbackTransaction =
        await wagerRepository.findByProviderAndExternalTransactionId(
          'provider-integration-duplicate-rollback',
          'external-rollback-integration-duplicate-1',
        );

      expect(firstRollbackTransaction).not.toBeNull();

      expect(firstRollbackTransaction?.status).toBe(
        WagerTransactionStatus.Processed,
      );

      expect(
        firstRollbackTransaction?.referenceTransactionId,
      ).toBe(
        'd1d1d1d1-1111-2222-3333-d1d1d1d1d1d1',
      );

      const secondRollbackTransaction =
        await wagerRepository.findByProviderAndExternalTransactionId(
          'provider-integration-duplicate-rollback',
          'external-rollback-integration-duplicate-2',
        );

      expect(secondRollbackTransaction).not.toBeNull();

      expect(secondRollbackTransaction?.status).toBe(
        WagerTransactionStatus.Rejected,
      );

      expect(
        secondRollbackTransaction?.failureCode,
      ).toBe(
        FailureCode.DuplicateReversal,
      );

      const firstRollbackLedger =
        await ledgerRepository.findByWalletAndTransaction(
          wallet.id,
          'e1e1e1e1-1111-2222-3333-e1e1e1e1e1e1',
        );

      expect(firstRollbackLedger).not.toBeNull();

      const secondRollbackLedger =
        await ledgerRepository.findByWalletAndTransaction(
          wallet.id,
          'f1f1f1f1-1111-2222-3333-f1f1f1f1f1f1',
        );

      expect(secondRollbackLedger).toBeNull();
    } finally {
      await em.rollback();
    }
  });
});