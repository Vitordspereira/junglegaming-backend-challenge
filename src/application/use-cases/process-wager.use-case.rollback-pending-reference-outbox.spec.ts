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
  'ProcessWagerUseCase - ROLLBACK PendingReference Outbox',
  () => {
    it(
      'should mark ROLLBACK as pending reference and enqueue WagerTransactionPendingReference',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '11111111-aaaa-4aaa-8aaa-111111111111',

            playerId:
              '22222222-bbbb-4bbb-8bbb-222222222222',

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
              '33333333-cccc-4ccc-8ccc-333333333333',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-rollback-pending-1',

            idempotencyKey:
              'rollback-pending-key-1',

            payloadHash:
              'rollback-pending-hash-1',

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
              'external-reference-not-arrived-yet',

            correlationId:
              'correlation-rollback-pending-1',

            causationId:
              'message-rollback-pending-1',
          });

        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.PendingReference,
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
          WagerTransactionStatus.PendingReference,
        );

        expect(
          savedOutboxes.length,
        ).toBe(1);

        const pendingEvent =
          savedOutboxes[0];

        expect(
          pendingEvent?.eventType,
        ).toBe(
          'WagerTransactionPendingReference',
        );

        expect(
          pendingEvent?.aggregateId,
        ).toBe(
          '33333333-cccc-4ccc-8ccc-333333333333',
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
          pendingEvent
            ?.payload
            .correlationId,
        ).toBe(
          'correlation-rollback-pending-1',
        );

        expect(
          pendingEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-rollback-pending-1',
        );

        const pendingData =
          pendingEvent
            ?.payload
            .data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          pendingData
            ?.transactionId,
        ).toBe(
          '33333333-cccc-4ccc-8ccc-333333333333',
        );

        expect(
          pendingData?.kind,
        ).toBe(
          WagerTransactionKind.Rollback,
        );

        expect(
          pendingData
            ?.referenceExternalTransactionId,
        ).toBe(
          'external-reference-not-arrived-yet',
        );

        expect(
          pendingData?.money,
        ).toEqual({
          amount:
            '25.00',

          currency:
            'BRL',
        });
      },
    );
  },
);
