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
  'ProcessWagerUseCase - REFUND rejected Outbox',
  () => {
    it(
      'should reject REFUND with invalid reference and enqueue only WagerTransactionRejected inside the transaction',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '22222222-2222-2222-2222-222222222222',

            playerId:
              '33333333-3333-3333-3333-333333333333',

            initialBalance:
              Money.from({
                amount:
                  '100.00',

                currency:
                  'BRL',
              }),
          });

        const referencedWin =
          WagerTransaction.create({
            id:
              '11111111-1111-4111-8111-111111111111',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-win-1',

            idempotencyKey:
              'win-key-1',

            payloadHash:
              'win-hash-1',

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
              '125.00',

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
                'external-win-1'
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
              '44444444-4444-4444-8444-444444444444',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-rejected-1',

            idempotencyKey:
              'refund-rejected-key-1',

            payloadHash:
              'refund-rejected-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-win-1',

            correlationId:
              'correlation-refund-rejected-1',

            causationId:
              'message-refund-rejected-1',
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
          '44444444-4444-4444-8444-444444444444',
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
          'correlation-refund-rejected-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-rejected-1',
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
          '44444444-4444-4444-8444-444444444444',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
      'should reject REFUND when currency differs from referenced BET and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',

            playerId:
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',

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
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-currency-1',

            idempotencyKey:
              'bet-currency-key-1',

            payloadHash:
              'bet-currency-hash-1',

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
                'external-bet-currency-1'
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
              'dddddddd-dddd-4ddd-8ddd-dddddddddddd',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-currency-1',

            idempotencyKey:
              'refund-currency-key-1',

            payloadHash:
              'refund-currency-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'USD',

            referenceExternalTransactionId:
              'external-bet-currency-1',

            correlationId:
              'correlation-refund-currency-1',

            causationId:
              'message-refund-currency-1',
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
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
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
          'correlation-refund-currency-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-currency-1',
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
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
            '25.00',

          currency:
            'USD',
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
      'should reject REFUND when amount differs from referenced BET and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',

            playerId:
              'ffffffff-ffff-4fff-8fff-ffffffffffff',

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
              '12121212-1212-4212-8212-121212121212',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-amount-1',

            idempotencyKey:
              'bet-amount-key-1',

            payloadHash:
              'bet-amount-hash-1',

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
                'external-bet-amount-1'
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
              '34343434-3434-4434-8434-343434343434',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-amount-1',

            idempotencyKey:
              'refund-amount-key-1',

            payloadHash:
              'refund-amount-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '30.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-amount-1',

            correlationId:
              'correlation-refund-amount-1',

            causationId:
              'message-refund-amount-1',
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
          '34343434-3434-4434-8434-343434343434',
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
          'correlation-refund-amount-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-amount-1',
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
          '34343434-3434-4434-8434-343434343434',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
      'should reject REFUND when referenced BET belongs to another wallet and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '56565656-5656-4656-8656-565656565656',

            playerId:
              '67676767-6767-4767-8767-676767676767',

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
              '78787878-7878-4878-8878-787878787878',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-wallet-1',

            idempotencyKey:
              'bet-wallet-key-1',

            payloadHash:
              'bet-wallet-hash-1',

            walletId:
              '99999999-9999-4999-8999-999999999999',

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
                'external-bet-wallet-1'
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
              '89898989-8989-4989-8989-898989898989',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-wallet-1',

            idempotencyKey:
              'refund-wallet-key-1',

            payloadHash:
              'refund-wallet-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-wallet-1',

            correlationId:
              'correlation-refund-wallet-1',

            causationId:
              'message-refund-wallet-1',
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
          '89898989-8989-4989-8989-898989898989',
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
          'correlation-refund-wallet-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-wallet-1',
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
          '89898989-8989-4989-8989-898989898989',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
      'should reject REFUND when referenced BET belongs to another player and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '90909090-9090-4090-8090-909090909090',

            playerId:
              'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',

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
              '11112222-3333-4444-8555-666677778888',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-player-1',

            idempotencyKey:
              'bet-player-key-1',

            payloadHash:
              'bet-player-hash-1',

            walletId:
              wallet.id,

            playerId:
              'different-player-id',

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
                'external-bet-player-1'
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
              '99998888-7777-4666-8555-444433332222',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-player-1',

            idempotencyKey:
              'refund-player-key-1',

            payloadHash:
              'refund-player-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-player-1',

            correlationId:
              'correlation-refund-player-1',

            causationId:
              'message-refund-player-1',
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
          '99998888-7777-4666-8555-444433332222',
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
          'correlation-refund-player-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-player-1',
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
          '99998888-7777-4666-8555-444433332222',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
      'should reject REFUND when referenced BET belongs to another round and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              'abababab-abab-4bab-8bab-abababababab',

            playerId:
              'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',

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
              'efefefef-efef-4fef-8fef-efefefefefef',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-round-1',

            idempotencyKey:
              'bet-round-key-1',

            payloadHash:
              'bet-round-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-original',

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
                'external-bet-round-1'
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
              '12345678-1234-4234-8234-123456789012',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-round-1',

            idempotencyKey:
              'refund-round-key-1',

            payloadHash:
              'refund-round-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-different',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-round-1',

            correlationId:
              'correlation-refund-round-1',

            causationId:
              'message-refund-round-1',
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
          '12345678-1234-4234-8234-123456789012',
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
          'correlation-refund-round-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-round-1',
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
          '12345678-1234-4234-8234-123456789012',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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
      'should reject duplicate REFUND and enqueue WagerTransactionRejected',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '10101010-1010-4010-8010-101010101010',

            playerId:
              '20202020-2020-4020-8020-202020202020',

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
              '30303030-3030-4030-8030-303030303030',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-duplicate-refund-1',

            idempotencyKey:
              'bet-duplicate-refund-key-1',

            payloadHash:
              'bet-duplicate-refund-hash-1',

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

        const previousRefund =
          WagerTransaction.create({
            id:
              '40404040-4040-4040-8040-404040404040',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-previous-refund-1',

            idempotencyKey:
              'previous-refund-key-1',

            payloadHash:
              'previous-refund-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

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

        previousRefund.markProcessed(
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
                'external-bet-duplicate-refund-1'
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
                WagerTransactionKind.Refund
            ) {
              return previousRefund;
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
              '50505050-5050-4050-8050-505050505050',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-duplicate-refund-1',

            idempotencyKey:
              'duplicate-refund-key-1',

            payloadHash:
              'duplicate-refund-hash-1',

            walletId:
              wallet.id,

            playerId:
              wallet.playerId,

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Refund,

            amount:
              '25.00',

            currency:
              'BRL',

            referenceExternalTransactionId:
              'external-bet-duplicate-refund-1',

            correlationId:
              'correlation-duplicate-refund-1',

            causationId:
              'message-duplicate-refund-1',
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
          '50505050-5050-4050-8050-505050505050',
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
          'correlation-duplicate-refund-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-duplicate-refund-1',
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
          '50505050-5050-4050-8050-505050505050',
        );

        expect(
          rejectedData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
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

  },
);
