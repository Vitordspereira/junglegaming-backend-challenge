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
  WagerTransactionKind,
  WagerTransactionStatus,
  type WagerTransaction,
} from '../../domain/wagering/wager-transaction.js';

import {
  LedgerDirection,
  type WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

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
  'ProcessWagerUseCase - WIN Outbox',
  () => {
    it(
      'should credit wallet, append ledger and enqueue financial events inside the transaction',
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

        let savedTransaction:
          WagerTransaction |
          undefined;

        let savedLedger:
          WalletLedgerEntry |
          undefined;

        const savedOutboxes:
          OutboxMessage[] = [];

        const outboxTransactionStates:
          boolean[] = [];

        let walletSaveCalls =
          0;

        let insideTransaction =
          false;

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

          async findByProviderAndExternalTransactionId() {
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
          async append(
            ledgerEntry,
          ) {
            savedLedger =
              ledgerEntry;
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

            amount:
              '40.00',

            currency:
              'BRL',

            correlationId:
              'correlation-win-1',

            causationId:
              'message-win-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Processed,
        );

        expect(
          result.balance,
        ).toBe(
          '140.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        expect(
          wallet.balance.toString(),
        ).toBe(
          '140.00',
        );

        expect(
          wallet.version,
        ).toBe(2);

        expect(
          walletSaveCalls,
        ).toBe(1);

        expect(
          savedLedger,
        ).toBeDefined();

        expect(
          savedLedger?.direction,
        ).toBe(
          LedgerDirection.Credit,
        );

        expect(
          savedLedger?.money.toString(),
        ).toBe(
          '40.00',
        );

        expect(
          savedLedger
            ?.balanceBefore
            .toString(),
        ).toBe(
          '100.00',
        );

        expect(
          savedLedger
            ?.balanceAfter
            .toString(),
        ).toBe(
          '140.00',
        );

        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Processed,
        );

        expect(
          savedOutboxes.length,
        ).toBe(2);

        const processedEvent =
          savedOutboxes.find(
            (message) =>
              message.eventType ===
              'WagerTransactionProcessed',
          );

        const balanceChangedEvent =
          savedOutboxes.find(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          );

        expect(
          processedEvent,
        ).toBeDefined();

        expect(
          balanceChangedEvent,
        ).toBeDefined();

        expect(
          outboxTransactionStates,
        ).toEqual([
          true,
          true,
        ]);

        expect(
          processedEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-win-1',
        );

        expect(
          processedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-win-1',
        );

        const processedData =
          processedEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          processedData?.kind,
        ).toBe(
          WagerTransactionKind.Win,
        );

        expect(
          processedData?.balance,
        ).toEqual({
          amount:
            '140.00',

          currency:
            'BRL',
        });

        expect(
          balanceChangedEvent
            ?.aggregateId,
        ).toBe(
          wallet.id,
        );

        const balanceData =
          balanceChangedEvent
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
          LedgerDirection.Credit,
        );

        expect(
          balanceData?.money,
        ).toEqual({
          amount:
            '40.00',

          currency:
            'BRL',
        });

        expect(
          balanceData?.balanceBefore,
        ).toEqual({
          amount:
            '100.00',

          currency:
            'BRL',
        });

        expect(
          balanceData?.balanceAfter,
        ).toEqual({
          amount:
            '140.00',

          currency:
            'BRL',
        });

        expect(
          balanceData?.walletVersion,
        ).toBe(2);
      },
    );
  },
);