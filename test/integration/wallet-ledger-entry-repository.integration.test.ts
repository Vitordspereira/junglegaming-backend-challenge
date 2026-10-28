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

  it('returns only the requested page size and indicates when there are more entries', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const repository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const walletId =
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

      const first = WalletLedgerEntry.rehydrate({
        id: '11111111-1111-1111-1111-111111111111',
        walletId,
        transactionId:
          'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '0.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        createdAt: new Date(
          '2026-10-28T12:00:00.000Z',
        ),
      });

      const second = WalletLedgerEntry.rehydrate({
        id: '22222222-2222-2222-2222-222222222222',
        walletId,
        transactionId:
          'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
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
        createdAt: new Date(
          '2026-10-28T12:05:00.000Z',
        ),
      });

      const third = WalletLedgerEntry.rehydrate({
        id: '33333333-3333-3333-3333-333333333333',
        walletId,
        transactionId:
          'cccccccc-3333-3333-3333-cccccccccccc',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '10.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '85.00',
          currency: 'BRL',
        }),
        createdAt: new Date(
          '2026-10-28T12:10:00.000Z',
        ),
      });

      await repository.append(first);
      await repository.append(second);
      await repository.append(third);

      const page = await repository.findPageByWallet(
        walletId,
        2,
      );

      expect(page.entries).toHaveLength(2);
      expect(page.hasMore).toBe(true);

      expect(page.entries[0]?.id).toBe(third.id);
      expect(page.entries[1]?.id).toBe(second.id);
    } finally {
      await entityManager.rollback();
    }
  });

  it('returns the next ledger page using the createdAt and id cursor', async () => {
    const entityManager = orm.em.fork();

    await entityManager.begin();

    try {
      const repository =
        new MikroOrmWalletLedgerEntryRepository(entityManager);

      const walletId =
        'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb';

      const first = WalletLedgerEntry.rehydrate({
        id: '11111111-aaaa-aaaa-aaaa-111111111111',
        walletId,
        transactionId:
          'aaaaaaaa-aaaa-1111-1111-aaaaaaaaaaaa',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '0.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        createdAt: new Date(
          '2026-10-28T12:00:00.000Z',
        ),
      });

      const second = WalletLedgerEntry.rehydrate({
        id: '22222222-bbbb-bbbb-bbbb-222222222222',
        walletId,
        transactionId:
          'bbbbbbbb-bbbb-2222-2222-bbbbbbbbbbbb',
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
        createdAt: new Date(
          '2026-10-28T12:05:00.000Z',
        ),
      });

      const third = WalletLedgerEntry.rehydrate({
        id: '33333333-cccc-cccc-cccc-333333333333',
        walletId,
        transactionId:
          'cccccccc-cccc-3333-3333-cccccccccccc',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '10.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '85.00',
          currency: 'BRL',
        }),
        createdAt: new Date(
          '2026-10-28T12:10:00.000Z',
        ),
      });

      await repository.append(first);
      await repository.append(second);
      await repository.append(third);

      const firstPage =
        await repository.findPageByWallet(
          walletId,
          2,
        );

      expect(firstPage.entries).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.entries[0]?.id).toBe(third.id);
      expect(firstPage.entries[1]?.id).toBe(second.id);

      const lastEntry =
        firstPage.entries[
          firstPage.entries.length - 1
        ];

      if (!lastEntry) {
        throw new Error(
          'Expected first page to contain entries',
        );
      }

      const secondPage =
        await repository.findPageByWallet(
          walletId,
          2,
          {
            createdAt: lastEntry.createdAt,
            id: lastEntry.id,
          },
        );

      expect(secondPage.entries).toHaveLength(1);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.entries[0]?.id).toBe(first.id);
    } finally {
      await entityManager.rollback();
    }
  });

});
