import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import { Money } from '../../src/domain/shared/value-objects/money.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../src/domain/wallet/wallet-ledger-entry.js';
import { MikroOrmWalletLedgerEntryRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';
import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('MikroOrmWalletLedgerEntryRepository integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('appends and finds a ledger entry in PostgreSQL', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const repository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const entry = WalletLedgerEntry.create({
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        walletId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        transactionId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        direction: LedgerDirection.Debit,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      });

      await repository.append(entry);

      const savedEntry = await repository.findById(entry.id);

      expect(savedEntry).not.toBeNull();
      expect(savedEntry?.id).toBe(entry.id);
      expect(savedEntry?.walletId).toBe(entry.walletId);
      expect(savedEntry?.transactionId).toBe(entry.transactionId);
      expect(savedEntry?.direction).toBe(LedgerDirection.Debit);
      expect(savedEntry?.money.toString()).toBe('25.00');
      expect(savedEntry?.balanceBefore.toString()).toBe('100.00');
      expect(savedEntry?.balanceAfter.toString()).toBe('75.00');

      const byWalletAndTransaction =
        await repository.findByWalletAndTransaction(
          entry.walletId,
          entry.transactionId,
        );

      expect(byWalletAndTransaction).not.toBeNull();
      expect(byWalletAndTransaction?.id).toBe(entry.id);
    } finally {
      await entityManager.rollback();
    }
  });
});