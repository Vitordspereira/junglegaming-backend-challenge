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
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import {
  Wallet,
} from '../../domain/wallet/wallet.js';

import type {
  OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

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
  ProcessWagerUseCase,
} from './process-wager.use-case.js';

describe(
  'ProcessWagerUseCase - ROLLBACK rejected Outbox',
  () => {
    it(
      'should reject ROLLBACK with invalid reference and enqueue only WagerTransactionRejected inside the transaction',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '21212121-2121-4212-8212-212121212121',

            playerId:
              '31313131-3131-4313-8313-313131313131',

            initialBalance:
              Money.from({
                amount:
                  '100.00',

                currency:
                  'BRL',
              }),
          });

        const referencedLoss =
          WagerTransaction.create({
            id:
              '41414141-4141-4414-8414-414141414141',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-loss-invalid-rollback-1',

            idempotencyKey:
              'loss-invalid-rollback-key-1',

            payloadHash:
              'loss-invalid-rollback-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Loss,

            money:
              Money.from({
                amount:
                  '0.00',

                currency:
                  'BRL',
              }),
          });

        referencedLoss.markProcessed(
          undefined,
          new Date(
            '2026-10-29T12:00:00.000Z',
          ),
          wallet.balance,
        );

        let savedTransaction:
          WagerTransaction |
          undefined;

        let walletSaveCalls =
          0;

        let ledgerAppendCalls =
          0;

        let insideTransaction =
          false;

        const savedOutboxes:
          OutboxMessage[] = [];

        const outboxTransactionStates:
          boolean[] = [];

        const walletRepository:
          WalletRepository = {
          async findByIdForUpdate() {
            return wallet;
          },

          async save() {
            walletSaveCalls +=
              1;
          },
        } as WalletRepository;

        const wagerRepository:
          WagerTransactionRepository = {
          async findByProviderAndIdempotencyKey() {
            return null;
          },

          async findByProviderAndExternalTransactionId(
            providerId,
            externalTransactionId,
          ) {
            if (
              providerId ===
                'provider-1' &&
              externalTransactionId ===
                'external-loss-invalid-rollback-1'
            ) {
              return referencedLoss;
            }

            return null;
          },

          async findProcessedByReferenceTransactionIdAndKind() {
            return null;
          },

          async save(
            transaction,
          ) {
            savedTransaction =
              transaction;
          },
        } as WagerTransactionRepository;

        const ledgerRepository:
          WalletLedgerEntryRepository = {
          async append() {
            ledgerAppendCalls +=
              1;
          },
        } as WalletLedgerEntryRepository;

        const outboxRepository:
          OutboxMessageRepository = {
          async save(
            message,
          ) {
            savedOutboxes.push(
              message,
            );

            outboxTransactionStates.push(
              insideTransaction,
            );
          },

          async findById() {
            return null;
          },

          async findDueForPublishing() {
            return [];
          },
        };

        const transactionManager:
          TransactionManager = {
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
        };

        const useCase =
          new ProcessWagerUseCase(
            walletRepository,
            wagerRepository,
            ledgerRepository,
            transactionManager,
            outboxRepository,
          );

        const result =
          await useCase.execute({
            id:
              '51515151-5151-4515-8515-515151515151',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-rollback-invalid-1',

            idempotencyKey:
              'rollback-invalid-key-1',

            payloadHash:
              'rollback-invalid-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Rollback,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-loss-invalid-rollback-1',

            correlationId:
              'correlation-rollback-invalid-1',

            causationId:
              'message-rollback-invalid-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          result.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          result.balance,
        ).toBe(
          '100.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        expect(
          wallet.version,
        ).toBe(1);

        expect(
          walletSaveCalls,
        ).toBe(0);

        expect(
          ledgerAppendCalls,
        ).toBe(0);

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          savedOutboxes.length,
        ).toBe(1);

        const rejectedEvent =
          savedOutboxes[0];

        expect(
          rejectedEvent?.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        expect(
          rejectedEvent?.aggregateId,
        ).toBe(
          '51515151-5151-4515-8515-515151515151',
        );

        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        expect(
          outboxTransactionStates,
        ).toEqual([
          true,
        ]);

        expect(
          rejectedEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-rollback-invalid-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-rollback-invalid-1',
        );

        const rejectedData =
          rejectedEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          rejectedData
            ?.transactionId,
        ).toBe(
          '51515151-5151-4515-8515-515151515151',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Rollback,
        );

        expect(
          rejectedData?.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          rejectedData?.balance,
        ).toEqual({
          amount:
            '100.00',

          currency:
            'BRL',
        });
      },
    );

    it(
      'should reject ROLLBACK when data differs from referenced transaction and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '61616161-6161-4616-8616-616161616161',

            playerId:
              '71717171-7171-4717-8717-717171717171',

            initialBalance:
              Money.from({
                amount:
                  '100.00',

                currency:
                  'BRL',
              }),
          });

        const referencedBet =
          WagerTransaction.create({
            id:
              '81818181-8181-4818-8818-818181818181',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-rollback-mismatch-1',

            idempotencyKey:
              'bet-rollback-mismatch-key-1',

            payloadHash:
              'bet-rollback-mismatch-hash-1',

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

        referencedBet.markProcessed(
          undefined,
          new Date(
            '2026-10-29T12:00:00.000Z',
          ),
          Money.from({
            amount:
              '75.00',

            currency:
              'BRL',
          }),
        );

        let savedTransaction:
          WagerTransaction |
          undefined;

        let walletSaveCalls =
          0;

        let ledgerAppendCalls =
          0;

        let insideTransaction =
          false;

        const savedOutboxes:
          OutboxMessage[] = [];

        const outboxTransactionStates:
          boolean[] = [];

        const walletRepository:
          WalletRepository = {
          async findByIdForUpdate() {
            return wallet;
          },

          async save() {
            walletSaveCalls +=
              1;
          },
        } as WalletRepository;

        const wagerRepository:
          WagerTransactionRepository = {
          async findByProviderAndIdempotencyKey() {
            return null;
          },

          async findByProviderAndExternalTransactionId(
            providerId,
            externalTransactionId,
          ) {
            if (
              providerId ===
                'provider-1' &&
              externalTransactionId ===
                'external-bet-rollback-mismatch-1'
            ) {
              return referencedBet;
            }

            return null;
          },

          async findProcessedByReferenceTransactionIdAndKind() {
            return null;
          },

          async save(
            transaction,
          ) {
            savedTransaction =
              transaction;
          },
        } as WagerTransactionRepository;

        const ledgerRepository:
          WalletLedgerEntryRepository = {
          async append() {
            ledgerAppendCalls +=
              1;
          },
        } as WalletLedgerEntryRepository;

        const outboxRepository:
          OutboxMessageRepository = {
          async save(
            message,
          ) {
            savedOutboxes.push(
              message,
            );

            outboxTransactionStates.push(
              insideTransaction,
            );
          },

          async findById() {
            return null;
          },

          async findDueForPublishing() {
            return [];
          },
        };

        const transactionManager:
          TransactionManager = {
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
        };

        const useCase =
          new ProcessWagerUseCase(
            walletRepository,
            wagerRepository,
            ledgerRepository,
            transactionManager,
            outboxRepository,
          );

        const result =
          await useCase.execute({
            id:
              '91919191-9191-4919-8919-919191919191',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-rollback-mismatch-1',

            idempotencyKey:
              'rollback-mismatch-key-1',

            payloadHash:
              'rollback-mismatch-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Rollback,

            /*
             * Referência original = 25.00 BRL.
             * ROLLBACK pede 30.00 BRL.
             */
            amount:
              '30.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-rollback-mismatch-1',

            correlationId:
              'correlation-rollback-mismatch-1',

            causationId:
              'message-rollback-mismatch-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          result.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          result.balance,
        ).toBe(
          '100.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        expect(
          wallet.version,
        ).toBe(1);

        expect(
          walletSaveCalls,
        ).toBe(0);

        expect(
          ledgerAppendCalls,
        ).toBe(0);

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          savedOutboxes.length,
        ).toBe(1);

        const rejectedEvent =
          savedOutboxes[0];

        expect(
          rejectedEvent?.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        expect(
          rejectedEvent?.aggregateId,
        ).toBe(
          '91919191-9191-4919-8919-919191919191',
        );

        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        expect(
          outboxTransactionStates,
        ).toEqual([
          true,
        ]);

        expect(
          rejectedEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-rollback-mismatch-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-rollback-mismatch-1',
        );

        const rejectedData =
          rejectedEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          rejectedData
            ?.transactionId,
        ).toBe(
          '91919191-9191-4919-8919-919191919191',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Rollback,
        );

        expect(
          rejectedData?.failureCode,
        ).toBe(
          FailureCode.InvalidReference,
        );

        expect(
          rejectedData?.money,
        ).toEqual({
          amount:
            '30.00',

          currency:
            'BRL',
        });

        expect(
          rejectedData?.balance,
        ).toEqual({
          amount:
            '100.00',

          currency:
            'BRL',
        });
      },
    );

    it(
      'should reject duplicate ROLLBACK and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',

            playerId:
              'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',

            initialBalance:
              Money.from({
                amount:
                  '100.00',

                currency:
                  'BRL',
              }),
          });

        const referencedBet =
          WagerTransaction.create({
            id:
              'cccccccc-3333-4333-8333-cccccccccccc',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-rollback-duplicate-1',

            idempotencyKey:
              'bet-rollback-duplicate-key-1',

            payloadHash:
              'bet-rollback-duplicate-hash-1',

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

        referencedBet.markProcessed(
          undefined,
          new Date(
            '2026-10-29T12:00:00.000Z',
          ),
          Money.from({
            amount:
              '75.00',

            currency:
              'BRL',
          }),
        );

        const previousRollback =
          WagerTransaction.create({
            id:
              'dddddddd-4444-4444-8444-dddddddddddd',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-previous-rollback-1',

            idempotencyKey:
              'previous-rollback-key-1',

            payloadHash:
              'previous-rollback-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

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
              referencedBet.externalTransactionId,
          });

        previousRollback.markProcessed(
          referencedBet.id,
          new Date(
            '2026-10-29T12:05:00.000Z',
          ),
          Money.from({
            amount:
              '100.00',

            currency:
              'BRL',
          }),
        );

        let savedTransaction:
          WagerTransaction |
          undefined;

        let walletSaveCalls =
          0;

        let ledgerAppendCalls =
          0;

        let insideTransaction =
          false;

        const savedOutboxes:
          OutboxMessage[] = [];

        const outboxTransactionStates:
          boolean[] = [];

        const walletRepository:
          WalletRepository = {
          async findByIdForUpdate() {
            return wallet;
          },

          async save() {
            walletSaveCalls +=
              1;
          },
        } as WalletRepository;

        const wagerRepository:
          WagerTransactionRepository = {
          async findByProviderAndIdempotencyKey() {
            return null;
          },

          async findByProviderAndExternalTransactionId(
            providerId,
            externalTransactionId,
          ) {
            if (
              providerId ===
                'provider-1' &&
              externalTransactionId ===
                'external-bet-rollback-duplicate-1'
            ) {
              return referencedBet;
            }

            return null;
          },

          async findProcessedByReferenceTransactionIdAndKind(
            referenceTransactionId,
            kind,
          ) {
            if (
              referenceTransactionId ===
                referencedBet.id &&
              kind ===
                WagerTransactionKind.Rollback
            ) {
              return previousRollback;
            }

            return null;
          },

          async save(
            transaction,
          ) {
            savedTransaction =
              transaction;
          },
        } as WagerTransactionRepository;

        const ledgerRepository:
          WalletLedgerEntryRepository = {
          async append() {
            ledgerAppendCalls +=
              1;
          },
        } as WalletLedgerEntryRepository;

        const outboxRepository:
          OutboxMessageRepository = {
          async save(
            message,
          ) {
            savedOutboxes.push(
              message,
            );

            outboxTransactionStates.push(
              insideTransaction,
            );
          },

          async findById() {
            return null;
          },

          async findDueForPublishing() {
            return [];
          },
        };

        const transactionManager:
          TransactionManager = {
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
        };

        const useCase =
          new ProcessWagerUseCase(
            walletRepository,
            wagerRepository,
            ledgerRepository,
            transactionManager,
            outboxRepository,
          );

        const result =
          await useCase.execute({
            id:
              'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-rollback-duplicate-1',

            idempotencyKey:
              'rollback-duplicate-key-1',

            payloadHash:
              'rollback-duplicate-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Rollback,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-rollback-duplicate-1',

            correlationId:
              'correlation-rollback-duplicate-1',

            causationId:
              'message-rollback-duplicate-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          result.failureCode,
        ).toBe(
          FailureCode.DuplicateReversal,
        );

        expect(
          result.balance,
        ).toBe(
          '100.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        expect(
          wallet.version,
        ).toBe(1);

        expect(
          walletSaveCalls,
        ).toBe(0);

        expect(
          ledgerAppendCalls,
        ).toBe(0);

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          FailureCode.DuplicateReversal,
        );

        expect(
          savedOutboxes.length,
        ).toBe(1);

        const rejectedEvent =
          savedOutboxes[0];

        expect(
          rejectedEvent?.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        expect(
          rejectedEvent?.aggregateId,
        ).toBe(
          'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
        );

        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        expect(
          outboxTransactionStates,
        ).toEqual([
          true,
        ]);

        expect(
          rejectedEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-rollback-duplicate-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-rollback-duplicate-1',
        );

        const rejectedData =
          rejectedEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          rejectedData
            ?.transactionId,
        ).toBe(
          'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Rollback,
        );

        expect(
          rejectedData?.failureCode,
        ).toBe(
          FailureCode.DuplicateReversal,
        );

        expect(
          rejectedData?.money,
        ).toEqual({
          amount:
            '25.00',

          currency:
            'BRL',
        });

        expect(
          rejectedData?.balance,
        ).toEqual({
          amount:
            '100.00',

          currency:
            'BRL',
        });
      },
    );


    it(
      'should reject ROLLBACK with insufficient funds and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              'abababab-1111-4111-8111-abababababab',

            playerId:
              'cdcdcdcd-2222-4222-8222-cdcdcdcdcdcd',

            initialBalance:
              Money.from({
                amount:
                  '10.00',

                currency:
                  'BRL',
              }),
          });

        /*
         * ROLLBACK de WIN precisa debitar
         * o valor anteriormente creditado.
         * Como a wallet tem apenas 10.00,
         * a reversão de 25.00 deve falhar.
         */
        const referencedWin =
          WagerTransaction.create({
            id:
              'efefefef-3333-4333-8333-efefefefefef',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-win-rollback-insufficient-1',

            idempotencyKey:
              'win-rollback-insufficient-key-1',

            payloadHash:
              'win-rollback-insufficient-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

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

        referencedWin.markProcessed(
          undefined,
          new Date(
            '2026-10-29T12:00:00.000Z',
          ),
          Money.from({
            amount:
              '35.00',

            currency:
              'BRL',
          }),
        );

        let savedTransaction:
          WagerTransaction |
          undefined;

        let walletSaveCalls =
          0;

        let ledgerAppendCalls =
          0;

        let insideTransaction =
          false;

        const savedOutboxes:
          OutboxMessage[] = [];

        const outboxTransactionStates:
          boolean[] = [];

        const walletRepository:
          WalletRepository = {
          async findByIdForUpdate() {
            return wallet;
          },

          async save() {
            walletSaveCalls +=
              1;
          },
        } as WalletRepository;

        const wagerRepository:
          WagerTransactionRepository = {
          async findByProviderAndIdempotencyKey() {
            return null;
          },

          async findByProviderAndExternalTransactionId(
            providerId,
            externalTransactionId,
          ) {
            if (
              providerId ===
                'provider-1' &&
              externalTransactionId ===
                'external-win-rollback-insufficient-1'
            ) {
              return referencedWin;
            }

            return null;
          },

          async findProcessedByReferenceTransactionIdAndKind() {
            return null;
          },

          async save(
            transaction,
          ) {
            savedTransaction =
              transaction;
          },
        } as WagerTransactionRepository;

        const ledgerRepository:
          WalletLedgerEntryRepository = {
          async append() {
            ledgerAppendCalls +=
              1;
          },
        } as WalletLedgerEntryRepository;

        const outboxRepository:
          OutboxMessageRepository = {
          async save(
            message,
          ) {
            savedOutboxes.push(
              message,
            );

            outboxTransactionStates.push(
              insideTransaction,
            );
          },

          async findById() {
            return null;
          },

          async findDueForPublishing() {
            return [];
          },
        };

        const transactionManager:
          TransactionManager = {
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
        };

        const useCase =
          new ProcessWagerUseCase(
            walletRepository,
            wagerRepository,
            ledgerRepository,
            transactionManager,
            outboxRepository,
          );

        const result =
          await useCase.execute({
            id:
              '12121212-4444-4444-8444-121212121212',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-rollback-insufficient-1',

            idempotencyKey:
              'rollback-insufficient-key-1',

            payloadHash:
              'rollback-insufficient-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Rollback,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-win-rollback-insufficient-1',

            correlationId:
              'correlation-rollback-insufficient-1',

            causationId:
              'message-rollback-insufficient-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          result.failureCode,
        ).toBe(
          FailureCode.ReversalInsufficientFunds,
        );

        expect(
          result.balance,
        ).toBe(
          '10.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(
          wallet.balance.toString(),
        ).toBe(
          '10.00',
        );

        expect(
          wallet.version,
        ).toBe(1);

        expect(
          walletSaveCalls,
        ).toBe(0);

        expect(
          ledgerAppendCalls,
        ).toBe(0);

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          FailureCode.ReversalInsufficientFunds,
        );

        expect(
          savedOutboxes.length,
        ).toBe(1);

        const rejectedEvent =
          savedOutboxes[0];

        expect(
          rejectedEvent?.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        expect(
          rejectedEvent?.aggregateId,
        ).toBe(
          '12121212-4444-4444-8444-121212121212',
        );

        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        expect(
          outboxTransactionStates,
        ).toEqual([
          true,
        ]);

        expect(
          rejectedEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-rollback-insufficient-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-rollback-insufficient-1',
        );

        const rejectedData =
          rejectedEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          rejectedData
            ?.transactionId,
        ).toBe(
          '12121212-4444-4444-8444-121212121212',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Rollback,
        );

        expect(
          rejectedData?.failureCode,
        ).toBe(
          FailureCode.ReversalInsufficientFunds,
        );

        expect(
          rejectedData?.money,
        ).toEqual({
          amount:
            '25.00',

          currency:
            'BRL',
        });

        expect(
          rejectedData?.balance,
        ).toEqual({
          amount:
            '10.00',

          currency:
            'BRL',
        });
      },
    );

  },
);
