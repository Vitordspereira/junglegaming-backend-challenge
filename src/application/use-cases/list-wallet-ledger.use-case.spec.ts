import { describe, expect, it } from 'bun:test';

import { Money } from '../../domain/shared/value-objects/money.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

import type { WalletLedgerEntryRepository } from '../ports/wallet-ledger-entry.repository.js';
import { ListWalletLedgerUseCase } from './list-wallet-ledger.use-case.js';

describe('ListWalletLedgerUseCase', () => {
  it('should return the first ledger page for a wallet', async () => {
    const first = WalletLedgerEntry.rehydrate({
      id: '11111111-1111-1111-1111-111111111111',
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      transactionId:
        'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',
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
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      transactionId:
        'cccccccc-1111-2222-3333-cccccccccccc',
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

    const ledgerRepository = {
      findPageByWallet: async () => ({
        entries: [second, first],
        hasMore: false,
      }),
    } as unknown as WalletLedgerEntryRepository;

    const useCase = new ListWalletLedgerUseCase(
      ledgerRepository,
    );

    const result = await useCase.execute({
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      limit: 50,
    });

    expect(result).toEqual({
      items: [
        {
          id: second.id,
          transactionId: second.transactionId,
          direction: LedgerDirection.Debit,
          amount: '25.00',
          currency: 'BRL',
          balanceBefore: '100.00',
          balanceAfter: '75.00',
          createdAt:
            '2026-10-28T12:05:00.000Z',
        },
        {
          id: first.id,
          transactionId: first.transactionId,
          direction: LedgerDirection.Credit,
          amount: '100.00',
          currency: 'BRL',
          balanceBefore: '0.00',
          balanceAfter: '100.00',
          createdAt:
            '2026-10-28T12:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });
  });

  it('should return a nextCursor when the repository indicates that there are more entries', async () => {
    const newest = WalletLedgerEntry.rehydrate({
      id: '33333333-3333-3333-3333-333333333333',
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      transactionId:
        'dddddddd-1111-2222-3333-dddddddddddd',
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

    const oldestInPage =
      WalletLedgerEntry.rehydrate({
        id: '22222222-2222-2222-2222-222222222222',
        walletId:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
        transactionId:
          'cccccccc-1111-2222-3333-cccccccccccc',
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

    const ledgerRepository = {
      findPageByWallet: async () => ({
        entries: [newest, oldestInPage],
        hasMore: true,
      }),
    } as unknown as WalletLedgerEntryRepository;

    const useCase = new ListWalletLedgerUseCase(
      ledgerRepository,
    );

    const result = await useCase.execute({
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      limit: 2,
    });

    expect(result.nextCursor).toBeDefined();

    const decodedCursor = JSON.parse(
      Buffer.from(
        result.nextCursor!,
        'base64url',
      ).toString('utf8'),
    );

    expect(decodedCursor).toEqual({
      createdAt:
        '2026-10-28T12:05:00.000Z',
      id: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('should decode the input cursor and pass it to the repository', async () => {
    const walletId =
      'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa';

    const cursorPayload = {
      createdAt:
        '2026-10-28T12:05:00.000Z',
      id: '22222222-2222-2222-2222-222222222222',
    };

    const cursor = Buffer.from(
      JSON.stringify(cursorPayload),
      'utf8',
    ).toString('base64url');

    let receivedCursor:
      | {
          createdAt: Date;
          id: string;
        }
      | undefined;

    const ledgerRepository = {
      findPageByWallet: async (
        receivedWalletId: string,
        receivedLimit: number,
        repositoryCursor?: {
          createdAt: Date;
          id: string;
        },
      ) => {
        expect(receivedWalletId).toBe(walletId);
        expect(receivedLimit).toBe(2);

        receivedCursor = repositoryCursor;

        return {
          entries: [],
          hasMore: false,
        };
      },
    } as unknown as WalletLedgerEntryRepository;

    const useCase = new ListWalletLedgerUseCase(
      ledgerRepository,
    );

    await useCase.execute({
      walletId,
      limit: 2,
      cursor,
    });

    expect(receivedCursor).toBeDefined();

    expect(receivedCursor?.id).toBe(
      cursorPayload.id,
    );

    expect(
      receivedCursor?.createdAt.toISOString(),
    ).toBe(cursorPayload.createdAt);
  });

  it('should reject an invalid cursor', async () => {
    const ledgerRepository = {
      findPageByWallet: async () => ({
        entries: [],
        hasMore: false,
      }),
    } as unknown as WalletLedgerEntryRepository;

    const useCase = new ListWalletLedgerUseCase(
      ledgerRepository,
    );

    expect(
      useCase.execute({
        walletId:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
        limit: 2,
        cursor: 'not-a-valid-cursor',
      }),
    ).rejects.toThrow('Invalid cursor');
  });
});