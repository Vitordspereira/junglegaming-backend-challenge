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
  'ProcessPendingReferenceRetriesUseCase REFUND',
  () => {
    it(
      'processes pending REFUND when referenced BET finally exists',
      async () => {
        const now =
          new Date(
            '2026-10-29T18:00:00.000Z',
          );

        const wallet =
          Wallet.open({
            id:
              '11111111-1111-4111-8111-111111111111',

            playerId:
              '22222222-2222-4222-8222-222222222222',

            initialBalance:
              Money.from({
                amount:
                  '75.00',

                currency:
                  'BRL',
              }),
          });

        /*
         * BET original já foi processada.
         * Ela havia debitado 25.
         */
        const bet =
          WagerTransaction.create({
            id:
              '33333333-3333-4333-8333-333333333333',

            providerId:
              'provider-1',

            externalTransactionId:
              'bet-original',

            idempotencyKey:
              'bet-original-key',

            payloadHash:
              'bet-original-hash',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Bet,

            money:
              Money.from({
                amount:
                  '25.00',

                currency:
                  'BRL',
              }),
          });

        bet.markProcessed(
          undefined,

          new Date(
            '2026-10-29T17:00:00.000Z',
          ),

          Money.from({
            amount:
              '75.00',

            currency:
              'BRL',
          }),
        );

        /*
         * REFUND chegou antes da BET
         * estar disponível para consulta
         * e ficou PENDING_REFERENCE.
         */
        const refund =
          WagerTransaction.create({
            id:
              '44444444-4444-4444-8444-444444444444',

            providerId:
              'provider-1',

            externalTransactionId:
              'refund-before-bet',

            idempotencyKey:
              'refund-before-bet-key',

            payloadHash:
              'refund-before-bet-hash',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind
                .Refund,

            money:
              Money.from({
                amount:
                  '25.00',

                currency:
                  'BRL',
              }),

            referenceExternalTransactionId:
              'bet-original',
          });

        refund.markPendingReference();

        const retry =
          PendingReferenceRetry
            .rehydrate({
              transactionId:
                refund.id,

              attempts:
                1,

              nextAttemptAt:
                new Date(
                  '2026-10-29T17:59:59.000Z',
                ),

              createdAt:
                new Date(
                  '2026-10-29T17:55:00.000Z',
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
                refund.id,
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
                refund.id
              ) {
                return refund;
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
                  'bet-original'
              ) {
                return bet;
              }

              return null;
            },

            async findByProviderAndIdempotencyKey() {
              return null;
            },

            async findProcessedByReferenceTransactionIdAndKind() {
              /*
               * Ainda não existe outro
               * REFUND processado.
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
         * REFUND devolveu os 25.
         */
        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        expect(
          savedWalletCalls,
        ).toBe(1);

        /*
         * PENDING_REFERENCE virou
         * PROCESSED.
         */
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
          bet.id,
        );

        /*
         * Um lançamento CREDIT.
         */
        expect(
          ledgerEntries.length,
        ).toBe(1);

        expect(
          ledgerEntries[0]
            ?.direction,
        ).toBe(
          LedgerDirection.Credit,
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
          '75.00',
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

        /*
         * Retry concluído é removido.
         */
        expect(
          deletedRetry,
        ).toBe(true);
      },
    );
  },
);