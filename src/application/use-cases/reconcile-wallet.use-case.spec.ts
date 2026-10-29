import {
  describe,
  expect,
  it,
} from 'bun:test';

import { Money } from '../../domain/shared/value-objects/money.js';

import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

import { Wallet } from '../../domain/wallet/wallet.js';

import type { WalletRepository } from '../ports/wallet.repository.js';

import type { WalletLedgerEntryRepository } from '../ports/wallet-ledger-entry.repository.js';

import { ReconcileWalletUseCase } from './reconcile-wallet.use-case.js';

describe('ReconcileWalletUseCase', () => {
  it('should report a wallet as consistent when stored balance matches the ledger', async () => {
    const wallet =
      Wallet.rehydrate({
        id:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        playerId:
          'player-1',

        balance:
          Money.from({
            amount:
              '75.00',

            currency:
              'BRL',
          }),

        version:
          3,
      });

    const opening =
      WalletLedgerEntry.rehydrate({
        id:
          'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',

        walletId:
          wallet.id,

        transactionId:
          'opening-transaction',

        direction:
          LedgerDirection.Credit,

        money:
          Money.from({
            amount:
              '100.00',

            currency:
              'BRL',
          }),

        balanceBefore:
          Money.from({
            amount:
              '0.00',

            currency:
              'BRL',
          }),

        balanceAfter:
          Money.from({
            amount:
              '100.00',

            currency:
              'BRL',
          }),

        createdAt:
          new Date(
            '2026-10-28T12:00:00.000Z',
          ),
      });

    const bet =
      WalletLedgerEntry.rehydrate({
        id:
          'cccccccc-1111-2222-3333-cccccccccccc',

        walletId:
          wallet.id,

        transactionId:
          'bet-transaction',

        direction:
          LedgerDirection.Debit,

        money:
          Money.from({
            amount:
              '25.00',

            currency:
              'BRL',
          }),

        balanceBefore:
          Money.from({
            amount:
              '100.00',

            currency:
              'BRL',
          }),

        balanceAfter:
          Money.from({
            amount:
              '75.00',

            currency:
              'BRL',
          }),

        createdAt:
          new Date(
            '2026-10-28T12:01:00.000Z',
          ),
      });

    const walletRepository = {
      findById:
        async () =>
          wallet,
    } as unknown as WalletRepository;

    const ledgerRepository = {
      findPageByWallet:
        async () => ({
          entries: [
            bet,
            opening,
          ],

          hasMore:
            false,
        }),
    } as unknown as WalletLedgerEntryRepository;

    const useCase =
      new ReconcileWalletUseCase(
        walletRepository,
        ledgerRepository,
      );

    const result =
      await useCase.execute({
        walletId:
          wallet.id,
      });

    expect(result).toEqual({
      walletId:
        wallet.id,

      storedBalance: {
        amount:
          '75.00',

        currency:
          'BRL',
      },

      calculatedBalance: {
        amount:
          '75.00',

        currency:
          'BRL',
      },

      difference: {
        amount:
          '0.00',

        currency:
          'BRL',
      },

      consistent:
        true,

      checkedEntries:
        2,
    });
  });

    it('should report a wallet as inconsistent when stored balance differs from the ledger', async () => {
      const wallet =
        Wallet.rehydrate({
          id:
            'dddddddd-1111-2222-3333-dddddddddddd',

          playerId:
            'player-2',

          balance:
            Money.from({
              amount:
                '80.00',

              currency:
                'BRL',
            }),

          version:
            3,
        });

      const opening =
        WalletLedgerEntry.rehydrate({
          id:
            'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

          walletId:
            wallet.id,

          transactionId:
            'opening-transaction',

          direction:
            LedgerDirection.Credit,

          money:
            Money.from({
              amount:
                '100.00',

              currency:
                'BRL',
            }),

          balanceBefore:
            Money.from({
              amount:
                '0.00',

              currency:
                'BRL',
            }),

          balanceAfter:
            Money.from({
              amount:
                '100.00',

              currency:
                'BRL',
            }),

          createdAt:
            new Date(
              '2026-10-28T12:00:00.000Z',
            ),
        });

      const bet =
        WalletLedgerEntry.rehydrate({
          id:
            'ffffffff-1111-2222-3333-ffffffffffff',

          walletId:
            wallet.id,

          transactionId:
            'bet-transaction',

          direction:
            LedgerDirection.Debit,

          money:
            Money.from({
              amount:
                '25.00',

              currency:
                'BRL',
            }),

          balanceBefore:
            Money.from({
              amount:
                '100.00',

              currency:
                'BRL',
            }),

          balanceAfter:
            Money.from({
              amount:
                '75.00',

              currency:
                'BRL',
            }),

          createdAt:
            new Date(
              '2026-10-28T12:01:00.000Z',
            ),
        });

      let saveCalled = false;

      const walletRepository = {
        findById:
          async () =>
            wallet,

        save:
          async () => {
            saveCalled = true;
          },
      } as unknown as WalletRepository;

      const ledgerRepository = {
        findPageByWallet:
          async () => ({
            entries: [
              bet,
              opening,
            ],

            hasMore:
              false,
          }),
      } as unknown as WalletLedgerEntryRepository;

      const useCase =
        new ReconcileWalletUseCase(
          walletRepository,
          ledgerRepository,
        );

      const result =
        await useCase.execute({
          walletId:
            wallet.id,
        });

      expect(result).toEqual({
        walletId:
          wallet.id,

        storedBalance: {
          amount:
            '80.00',

          currency:
            'BRL',
        },

        calculatedBalance: {
          amount:
            '75.00',

          currency:
            'BRL',
        },

        difference: {
          amount:
            '5.00',

          currency:
            'BRL',
        },

        consistent:
          false,

        checkedEntries:
          2,
      });

      expect(saveCalled).toBe(false);

      expect(
        wallet.balance.toString(),
      ).toBe(
        '80.00',
      );
    });

    it('should reject when the wallet does not exist', async () => {
      const walletRepository = {
        findById:
          async () =>
            null,
      } as unknown as WalletRepository;

      const ledgerRepository = {
        findPageByWallet:
          async () => ({
            entries: [],
            hasMore: false,
          }),
      } as unknown as WalletLedgerEntryRepository;

      const useCase =
        new ReconcileWalletUseCase(
          walletRepository,
          ledgerRepository,
        );

      expect(
        useCase.execute({
          walletId:
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
        }),
      ).rejects.toThrow(
        'Wallet not found',
      );
    });
});