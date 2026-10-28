import { randomUUID } from 'node:crypto';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';
import { LedgerDirection } from '../../src/domain/wallet/wallet-ledger-entry.js';

import { MikroOrmTransactionManager } from '../../src/infrastructure/database/mikro-orm-transaction-manager.js';
import { MikroOrmWagerTransactionRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletLedgerEntryRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';
import { MikroOrmWalletRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet.repository.js';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('CreateWalletUseCase integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('creates a wallet with OPENING transaction and CREDIT ledger atomically in PostgreSQL', async () => {
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

      const useCase = new CreateWalletUseCase(
        walletRepository,
        wagerTransactionRepository,
        ledgerRepository,
        transactionManager,
      );

      const playerId = randomUUID();

      const result = await useCase.execute({
        playerId,
        initialBalance: '100.00',
        currency: 'BRL',
      });

      expect(result.playerId).toBe(playerId);
      expect(result.balance).toBe('100.00');
      expect(result.currency).toBe('BRL');
      expect(result.version).toBe(1);

      entityManager.clear();

      const persistedWallet =
        await walletRepository.findById(result.walletId);

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.playerId).toBe(playerId);
      expect(
        persistedWallet?.balance.toString(),
      ).toBe('100.00');
      expect(persistedWallet?.currency).toBe('BRL');
      expect(persistedWallet?.version).toBe(1);

      const persistedOpening =
        await wagerTransactionRepository
          .findByProviderAndExternalTransactionId(
            'internal',
            `opening:${result.walletId}`,
          );

      expect(persistedOpening).not.toBeNull();
      expect(persistedOpening?.kind).toBe(
        WagerTransactionKind.Opening,
      );
      expect(persistedOpening?.status).toBe(
        WagerTransactionStatus.Processed,
      );
      expect(persistedOpening?.walletId).toBe(
        result.walletId,
      );
      expect(persistedOpening?.playerId).toBe(playerId);
      expect(
        persistedOpening?.money.toString(),
      ).toBe('100.00');
      expect(persistedOpening?.money.currency).toBe(
        'BRL',
      );
      expect(
        persistedOpening?.resultBalance?.toString(),
      ).toBe('100.00');

      expect(persistedOpening).not.toBeNull();

      if (!persistedOpening) {
        throw new Error(
          'Expected persisted OPENING transaction',
        );
      }

      const ledgerEntry =
        await ledgerRepository.findByWalletAndTransaction(
          result.walletId,
          persistedOpening.id,
        );

      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry?.direction).toBe(
        LedgerDirection.Credit,
      );
      expect(
        ledgerEntry?.money.toString(),
      ).toBe('100.00');
      expect(
        ledgerEntry?.balanceBefore.toString(),
      ).toBe('0.00');
      expect(
        ledgerEntry?.balanceAfter.toString(),
      ).toBe('100.00');
    } finally {
      await entityManager.rollback();
    }
  });
});
