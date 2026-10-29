import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

import {
  Money,
} from '../../domain/shared/value-objects/money.js';

import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import {
  PendingReferenceRetry,
} from '../../domain/wagering/pending-reference-retry.js';

import {
  Wallet,
} from '../../domain/wallet/wallet.js';

import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

import type {
  OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

import type {
  PendingReferenceRetryRepository,
} from '../ports/pending-reference-retry.repository.js';

import type {
  TransactionManager,
} from '../ports/transaction-manager.js';

import type {
  WagerTransactionRepository,
} from '../ports/wager-transaction.repository.js';

import type {
  WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';

import type {
  WalletRepository,
} from '../ports/wallet.repository.js';

import {
  ProcessPendingReferenceRetriesUseCase,
} from './process-pending-reference-retries.use-case.js';

describe(
  'ProcessPendingReferenceRetriesUseCase ROLLBACK',
  () => {
    it(
      'processes pending ROLLBACK when referenced WIN finally exists',
      async () => {
        const now =
          new Date(
            '2026-10-29T18:30:00.000Z',
          );

        /*
         * A WIN original havia creditado 25.
         *
         * Portanto o saldo atual é 125.
         */
        const wallet =
          Wallet.open({
            id:
              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',

            playerId:
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',

            initialBalance:
              Money.from({
                amount:
                  '125.00',

                currency:
                  'BRL',
              }),
          });

        const win =
          WagerTransaction.create({
            id:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',

            providerId:
              'provider-1',

            externalTransactionId:
              'win-original',

            idempotencyKey:
              'win-original-key',

            payloadHash:
              'win-original-hash',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-rollback',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Win,

            money:
              Money.from({
                amount:
                  '25.00',

                currency:
                  'BRL',
              }),
          });

        win.markProcessed(
          undefined,

          new Date(
            '2026-10-29T17:30:00.000Z',
          ),

          Money.from({
            amount:
              '125.00',

            currency:
              'BRL',
          }),
        );

        /*
         * ROLLBACK chegou antes de a WIN
         * estar disponível e ficou pendente.
         */
        const rollback =
          WagerTransaction.create({
            id:
              'dddddddd-dddd-4ddd-8ddd-dddddddddddd',

            providerId:
              'provider-1',

            externalTransactionId:
              'rollback-before-win',

            idempotencyKey:
              'rollback-before-win-key',

            payloadHash:
              'rollback-before-win-hash',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-rollback',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Rollback,

            money:
              Money.from({
                amount:
                  '25.00',

                currency:
                  'BRL',
              }),

            referenceExternalTransactionId:
              'win-original',
          });

        rollback.markPendingReference();

        const retry =
          PendingReferenceRetry
            .rehydrate({
              transactionId:
                rollback.id,

              attempts:
                2,

              nextAttemptAt:
                new Date(
                  '2026-10-29T18:29:59.000Z',
                ),

              createdAt:
                new Date(
                  '2026-10-29T18:25:00.000Z',
                ),
            });

        let deletedRetry =
          false;

        let savedWalletCalls =
          0;

        let savedTransaction:
          WagerTransaction |
          undefined;

        const ledgerEntries:
          WalletLedgerEntry[] = [];

        const outboxes:
          OutboxMessage[] = [];

        let insideTransaction =
          false;

        const retryRepository =
          {
            async ensureForPendingReferences() {},

            async findByTransactionId() {
              return retry;
            },

            async findDueForProcessing() {
              return [
                retry,
              ];
            },

            async save() {
              throw new Error(
                'Retry must not be rescheduled',
              );
            },

            async delete(
              transactionId:
                string,
            ) {
              expect(
                transactionId,
              ).toBe(
                rollback.id,
              );

              deletedRetry =
                true;
            },
          } as PendingReferenceRetryRepository;

        const wagerRepository =
          {
            async findById(
              transactionId:
                string,
            ) {
              if (
                transactionId ===
                rollback.id
              ) {
                return rollback;
              }

              return null;
            },

            async findByProviderAndExternalTransactionId(
              providerId:
                string,

              externalTransactionId:
                string,
            ) {
              if (
                providerId ===
                  'provider-1' &&
                externalTransactionId ===
                  'win-original'
              ) {
                return win;
              }

              return null;
            },

            async findByProviderAndIdempotencyKey() {
              return null;
            },

            async findProcessedByReferenceTransactionIdAndKind() {
              /*
               * Ainda não existe ROLLBACK
               * processado para essa WIN.
               */
              return null;
            },

            async save(
              transaction:
                WagerTransaction,
            ) {
              savedTransaction =
                transaction;
            },
          } as WagerTransactionRepository;

        const walletRepository =
          {
            async findByIdForUpdate(
              walletId:
                string,
            ) {
              expect(
                insideTransaction,
              ).toBe(true);

              expect(
                walletId,
              ).toBe(
                wallet.id,
              );

              return wallet;
            },

            async save() {
              expect(
                insideTransaction,
              ).toBe(true);

              savedWalletCalls +=
                1;
            },
          } as WalletRepository;

        const ledgerRepository =
          {
            async append(
              entry:
                WalletLedgerEntry,
            ) {
              expect(
                insideTransaction,
              ).toBe(true);

              ledgerEntries.push(
                entry,
              );
            },
          } as WalletLedgerEntryRepository;

        const outboxRepository =
          {
            async save(
              message:
                OutboxMessage,
            ) {
              expect(
                insideTransaction,
              ).toBe(true);

              outboxes.push(
                message,
              );
            },

            async findById() {
              return null;
            },

            async findDueForPublishing() {
              return [];
            },
          } as OutboxMessageRepository;

        const transactionManager =
          {
            async execute<T>(
              work:
                () => Promise<T>,
            ): Promise<T> {
              insideTransaction =
                true;

              try {
                return await work();
              } finally {
                insideTransaction =
                  false;
              }
            },
          } as TransactionManager;

        const useCase =
          new ProcessPendingReferenceRetriesUseCase(
            retryRepository,
            wagerRepository,
            walletRepository,
            outboxRepository,
            transactionManager,
            ledgerRepository,
          );

        const result =
          await useCase.execute({
            now,
            limit:
              10,
          });

        expect(
          result,
        ).toEqual({
          found:
            1,

          rescheduled:
            0,

          referenceFound:
            1,

          exhausted:
            0,

          cleaned:
            0,
        });

        /*
         * WIN creditou 25.
         *
         * ROLLBACK precisa fazer o inverso:
         * DEBIT de 25.
         */
        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        expect(
          savedWalletCalls,
        ).toBe(1);

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus
            .Processed,
        );

        expect(
          savedTransaction
            ?.referenceTransactionId,
        ).toBe(
          win.id,
        );

        /*
         * Exatamente um ledger DEBIT.
         */
        expect(
          ledgerEntries.length,
        ).toBe(1);

        expect(
          ledgerEntries[0]
            ?.direction,
        ).toBe(
          LedgerDirection.Debit,
        );

        expect(
          ledgerEntries[0]
            ?.money
            .toString(),
        ).toBe(
          '25.00',
        );

        expect(
          ledgerEntries[0]
            ?.balanceBefore
            .toString(),
        ).toBe(
          '125.00',
        );

        expect(
          ledgerEntries[0]
            ?.balanceAfter
            .toString(),
        ).toBe(
          '100.00',
        );

        /*
         * Dois eventos:
         *
         * WagerTransactionProcessed
         * WalletBalanceChanged
         */
        expect(
          outboxes.length,
        ).toBe(2);

        expect(
          outboxes.some(
            (message) =>
              message.eventType ===
              'WagerTransactionProcessed',
          ),
        ).toBe(true);

        expect(
          outboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(true);

        const balanceEvent =
          outboxes.find(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          );

        const balanceData =
          balanceEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          balanceData?.direction,
        ).toBe(
          LedgerDirection.Debit,
        );

        expect(
          deletedRetry,
        ).toBe(true);
      },
    );
  },
);