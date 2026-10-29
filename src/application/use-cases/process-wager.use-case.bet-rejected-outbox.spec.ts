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
  WagerTransactionKind,
  WagerTransactionStatus,
  type WagerTransaction,
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
  'ProcessWagerUseCase - BET rejected Outbox',
  () => {
    it(
      'should reject BET with insufficient funds and enqueue only WagerTransactionRejected inside the transaction',
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
                  '10.00',

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
              '44444444-4444-4444-8444-444444444444',

            providerId:
              'provider-1',

            externalTransactionId:
              'external-bet-rejected-1',

            idempotencyKey:
              'bet-rejected-key-1',

            payloadHash:
              'bet-rejected-hash-1',

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

            amount:
              '25.00',

            currency:
              'BRL',

            correlationId:
              'correlation-bet-rejected-1',

            causationId:
              'message-bet-rejected-1',
          });

        /*
         * Resultado.
         */
        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Rejected,
        );

        expect(
          result.failureCode,
        ).toBe(
          FailureCode.InsufficientFunds,
        );

        expect(
          result.balance,
        ).toBe(
          '10.00',
        );

        expect(
          result.idempotentReplay,
        ).toBe(false);

        /*
         * Wallet não muda.
         */
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

        /*
         * Rejeição não gera ledger.
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
          WagerTransactionStatus.Rejected,
        );

        expect(
          savedTransaction?.failureCode,
        ).toBe(
          FailureCode.InsufficientFunds,
        );

        /*
         * Apenas um evento.
         */
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

        /*
         * Nenhum evento de alteração
         * de saldo deve existir.
         */
        expect(
          savedOutboxes.some(
            (message) =>
              message.eventType ===
              'WalletBalanceChanged',
          ),
        ).toBe(false);

        /*
         * Outbox salva dentro
         * da transação.
         */
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
          'correlation-bet-rejected-1',
        );

        expect(
          rejectedEvent
            ?.payload
            .causationId,
        ).toBe(
          'message-bet-rejected-1',
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
          WagerTransactionKind.Bet,
        );

        expect(
          rejectedData?.failureCode,
        ).toBe(
          FailureCode.InsufficientFunds,
        );

        expect(
          rejectedData?.balance,
        ).toEqual({
          amount:
            '10.00',

          currency:
            'BRL',
        });

        expect(
          rejectedData?.money,
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