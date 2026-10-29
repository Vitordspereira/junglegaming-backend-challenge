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
  WalletRepository,
} from '../ports/wallet.repository.js';

import {
  ProcessPendingReferenceRetriesUseCase,
  REFERENCE_NOT_FOUND_FAILURE_CODE,
} from './process-pending-reference-retries.use-case.js';

describe(
  'ProcessPendingReferenceRetriesUseCase',
  () => {
    it(
      'reschedules with exponential backoff when reference is still missing',
      async () => {
        const now =
          new Date(
            '2026-10-29T17:30:00.000Z',
          );

        const retry =
          PendingReferenceRetry
            .rehydrate({
              transactionId:
                '11111111-1111-4111-8111-111111111111',

              attempts:
                0,

              nextAttemptAt:
                new Date(
                  '2026-10-29T17:29:59.000Z',
                ),

              createdAt:
                new Date(
                  '2026-10-29T17:29:55.000Z',
                ),
            });

        const pendingTransaction =
          WagerTransaction.create({
            id:
              retry.transactionId,

            providerId:
              'provider-1',

            externalTransactionId:
              'refund-before-bet',

            idempotencyKey:
              'refund-before-bet-key',

            payloadHash:
              'refund-before-bet-hash',

            walletId:
              '22222222-2222-4222-8222-222222222222',

            playerId:
              '33333333-3333-4333-8333-333333333333',

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
              'bet-that-has-not-arrived',
          });

        pendingTransaction
          .markPendingReference();

        const wallet =
          Wallet.open({
            id:
              pendingTransaction.walletId,

            playerId:
              pendingTransaction.playerId,

            initialBalance:
              Money.from({
                amount:
                  '75.00',

                currency:
                  'BRL',
              }),
          });

        let savedRetry:
          PendingReferenceRetry |
          undefined;

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

            async save(
              value:
                PendingReferenceRetry,
            ) {
              savedRetry =
                value;
            },

            async delete() {
              throw new Error(
                'Retry should not be deleted',
              );
            },
          } as PendingReferenceRetryRepository;

        const wagerRepository =
          {
            async findById() {
              return pendingTransaction;
            },

            async findByProviderAndExternalTransactionId() {
              return null;
            },

            async findByProviderAndIdempotencyKey() {
              return null;
            },

            async findProcessedByReferenceTransactionIdAndKind() {
              return null;
            },

            async save() {
              throw new Error(
                'Wager should not be modified',
              );
            },
          } as WagerTransactionRepository;

        const walletRepository =
          {
            async findByIdForUpdate() {
              return wallet;
            },

            async save() {},
          } as WalletRepository;

        const outboxRepository =
          {
            async save() {
              throw new Error(
                'Outbox should not be used',
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
              return work();
            },
          } as TransactionManager;

        const useCase =
          new ProcessPendingReferenceRetriesUseCase(
            retryRepository,
            wagerRepository,
            walletRepository,
            outboxRepository,
            transactionManager,
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
            1,

          referenceFound:
            0,

          exhausted:
            0,

          cleaned:
            0,
        });

        expect(
          savedRetry?.attempts,
        ).toBe(1);

        expect(
          savedRetry?.nextAttemptAt
            .toISOString(),
        ).toBe(
          '2026-10-29T17:30:10.000Z',
        );
      },
    );

    it(
      'rejects and removes retry when missing reference exhausts retry policy',
      async () => {
        const now =
          new Date(
            '2026-10-29T17:40:00.000Z',
          );

        /*
         * attempts = 5 já atingiu o
         * limite definido pela política.
         */
        const retry =
          PendingReferenceRetry
            .rehydrate({
              transactionId:
                '44444444-4444-4444-8444-444444444444',

              attempts:
                5,

              nextAttemptAt:
                new Date(
                  '2026-10-29T17:39:00.000Z',
                ),

              createdAt:
                new Date(
                  '2026-10-29T17:35:00.000Z',
                ),
            });

        const transaction =
          WagerTransaction.create({
            id:
              retry.transactionId,

            providerId:
              'provider-1',

            externalTransactionId:
              'refund-with-missing-reference',

            idempotencyKey:
              'refund-missing-reference-key',

            payloadHash:
              'refund-missing-reference-hash',

            walletId:
              '55555555-5555-4555-8555-555555555555',

            playerId:
              '66666666-6666-4666-8666-666666666666',

            roundId:
              'round-missing',

            gameId:
              'game-missing',

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
              'bet-that-never-arrived',
          });

        transaction
          .markPendingReference();

        const wallet =
          Wallet.open({
            id:
              transaction.walletId,

            playerId:
              transaction.playerId,

            initialBalance:
              Money.from({
                amount:
                  '75.00',

                currency:
                  'BRL',
              }),
          });

        let retryDeleted =
          false;

        let savedTransaction:
          WagerTransaction |
          undefined;

        const savedOutboxes:
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
                'Exhausted retry should not be rescheduled',
              );
            },

            async delete(
              transactionId:
                string,
            ) {
              expect(
                transactionId,
              ).toBe(
                retry.transactionId,
              );

              retryDeleted =
                true;
            },
          } as PendingReferenceRetryRepository;

        const wagerRepository =
          {
            async findById() {
              return transaction;
            },

            async findByProviderAndExternalTransactionId() {
              /*
               * A referência nunca chegou.
               */
              return null;
            },

            async findByProviderAndIdempotencyKey() {
              return null;
            },

            async findProcessedByReferenceTransactionIdAndKind() {
              return null;
            },

            async save(
              value:
                WagerTransaction,
            ) {
              savedTransaction =
                value;
            },
          } as WagerTransactionRepository;

        const walletRepository =
          {
            async findByIdForUpdate() {
              return wallet;
            },

            async save() {
              throw new Error(
                'Rejected retry must not change wallet',
              );
            },
          } as WalletRepository;

        const outboxRepository =
          {
            async save(
              message:
                OutboxMessage,
            ) {
              expect(
                insideTransaction,
              ).toBe(true);

              savedOutboxes.push(
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
            0,

          exhausted:
            1,

          cleaned:
            0,
        });

        expect(
          retryDeleted,
        ).toBe(true);

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus
            .Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          REFERENCE_NOT_FOUND_FAILURE_CODE,
        );

        /*
         * REJECTED não movimenta saldo.
         */
        expect(
          wallet.balance.toString(),
        ).toBe(
          '75.00',
        );

        expect(
          wallet.version,
        ).toBe(1);

        /*
         * Exatamente um evento:
         * WagerTransactionRejected.
         */
        expect(
          savedOutboxes.length,
        ).toBe(1);

        expect(
          savedOutboxes[0]
            ?.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        const data =
          savedOutboxes[0]
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          data?.failureCode,
        ).toBe(
          'REFERENCE_NOT_FOUND',
        );

        expect(
          data?.transactionId,
        ).toBe(
          transaction.id,
        );
      },
    );
  },
);