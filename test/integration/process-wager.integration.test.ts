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
      expect(persistedWallet?.balance.toString()).toBe('75.00');
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
      expect(ledgerEntry?.balanceBefore.toString()).toBe(
        '100.00',
      );
      expect(ledgerEntry?.balanceAfter.toString()).toBe(
        '75.00',
      );
    } finally {
      await entityManager.rollback();
    }
  });
});