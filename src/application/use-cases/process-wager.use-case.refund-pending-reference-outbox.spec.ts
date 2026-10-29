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
  'ProcessWagerUseCase - REFUND PendingReference Outbox',
  () => {
    it(
      'should mark REFUND as pending reference and enqueue WagerTransactionPendingReference',
      async () => {
        const wallet =
          Wallet.open({
            id:
              '11111111-2222-4222-8222-111111111111',

            playerId:
              '33333333-4444-4444-8444-333333333333',

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
            /*
             * A referência ainda não chegou.
             */
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
              '55555555-6666-4666-8666-555555555555',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-refund-pending-1',

            idempotencyKey:
              'refund-pending-key-1',

            payloadHash:
              'refund-pending-hash-1',

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
              'external-bet-not-arrived-yet',

            correlationId:
              'correlation-refund-pending-1',

            causationId:
              'message-refund-pending-1',
          });

        /*
         * Resultado.
         */
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

        /*
         * Wallet não pode mudar.
         */
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

        /*
         * PendingReference não gera ledger.
         */
        expect(
          ledgerAppendCalls,
        ).toBe(0);

        /*
         * Transaction.
         */
        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.PendingReference,
        );

        /*
         * Apenas um evento deve ser criado.
         */
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
          '55555555-6666-4666-8666-555555555555',
        );

        /*
         * Não houve alteração financeira.
         */
        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        /*
         * O evento precisa ser persistido
         * dentro da mesma transação.
         */
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
          'correlation-refund-pending-1',
        );

        expect(
          pendingEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-refund-pending-1',
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
          '55555555-6666-4666-8666-555555555555',
        );

        expect(
          pendingData?.kind,
        ).toBe(
          WagerTransactionKind.Refund,
        );

        expect(
          pendingData
            ?.referenceExternalTransactionId,
        ).toBe(
          'external-bet-not-arrived-yet',
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