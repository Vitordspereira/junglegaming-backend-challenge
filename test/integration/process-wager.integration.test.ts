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
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const walletRepository =
        new MikroOrmWalletRepository(entityManager);

      const wagerTransactionRepository =
        new MikroOrmWagerTransactionRepository(entityManager);

      const transactionManager =
        new MikroOrmTransactionManager(entityManager);

      const failingLedgerRepository = {
        async findById() {
          return null;
        },

        async findByWalletAndTransaction() {
          return null;
        },

        async append() {
          throw new Error('Simulated ledger failure');
        },
      };

      const useCase = new ProcessWagerUseCase(
        walletRepository,
        wagerTransactionRepository,
        failingLedgerRepository,
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

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(walletId);

      const persistedTransaction =
        await wagerTransactionRepository.findById(
          transactionId,
        );

      expect(persistedWallet).not.toBeNull();

      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');

      expect(persistedWallet?.version).toBe(1);

      expect(persistedTransaction).toBeNull();
    } finally {
      await entityManager.rollback();
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
});