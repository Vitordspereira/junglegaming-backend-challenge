import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  Money,
} from '../../domain/shared/value-objects/money.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
  type WagerTransaction,
} from '../../domain/wagering/wager-transaction.js';

import {
  Wallet,
} from '../../domain/wallet/wallet.js';

import type {
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

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
  'ProcessWagerUseCase - LOSS Outbox',
  () => {
    it(
      'should process LOSS without changing balance or ledger and enqueue WagerTransactionProcessed in the same transaction',
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

        let savedOutbox:
          OutboxMessage |
          undefined;

        let walletSaveCalls =
          0;

        let ledgerAppendCalls =
          0;

        let insideTransaction =
          false;

        let outboxSavedInsideTransaction =
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
            savedOutbox =
              message;

            outboxSavedInsideTransaction =
              insideTransaction;
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
              'external-loss-1',

            idempotencyKey:
              'loss-key-1',

            payloadHash:
              'loss-hash-1',

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

            amount:
              '0.00',

            currency:
              'BRL',

            correlationId:
              'correlation-loss-1',

            causationId:
              'message-loss-1',
          });

        /*
         * LOSS é processado normalmente.
         */
        expect(
          result.status,
        ).toBe(
          WagerTransactionStatus.Processed,
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
         * LOSS não altera saldo.
         */
        expect(
          wallet.balance.toString(),
        ).toBe(
          '100.00',
        );

        /*
         * LOSS não salva wallet porque
         * não houve mudança financeira.
         */
        expect(
          walletSaveCalls,
        ).toBe(0);

        /*
         * LOSS também não gera ledger.
         */
        expect(
          ledgerAppendCalls,
        ).toBe(0);

        /*
         * A wager transaction foi persistida
         * como PROCESSED.
         */
        expect(
          savedTransaction,
        ).toBeDefined();

        expect(
          savedTransaction?.status,
        ).toBe(
          WagerTransactionStatus.Processed,
        );

        /*
         * Um evento foi colocado na Outbox.
         */
        expect(
          savedOutbox,
        ).toBeDefined();

        expect(
          savedOutbox?.eventType,
        ).toBe(
          'WagerTransactionProcessed',
        );

        expect(
          savedOutbox?.aggregateId,
        ).toBe(
          '44444444-4444-4444-8444-444444444444',
        );

        expect(
          savedOutbox?.isPending(),
        ).toBe(true);

        /*
         * Prova que o save da Outbox aconteceu
         * enquanto o TransactionManager ainda
         * estava executando o callback.
         */
        expect(
          outboxSavedInsideTransaction,
        ).toBe(true);

        /*
         * Confere o envelope do evento.
         */
        expect(
          savedOutbox?.payload.eventType,
        ).toBe(
          'WagerTransactionProcessed',
        );

        expect(
          savedOutbox?.payload.aggregateId,
        ).toBe(
          '44444444-4444-4444-8444-444444444444',
        );

        expect(
          savedOutbox?.payload.correlationId,
        ).toBe(
          'correlation-loss-1',
        );

        expect(
          savedOutbox?.payload.causationId,
        ).toBe(
          'message-loss-1',
        );

        const eventData =
          savedOutbox?.payload.data as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          eventData?.transactionId,
        ).toBe(
          '44444444-4444-4444-8444-444444444444',
        );

        expect(
          eventData?.providerId,
        ).toBe(
          'provider-1',
        );

        expect(
          eventData?.externalTransactionId,
        ).toBe(
          'external-loss-1',
        );

        expect(
          eventData?.kind,
        ).toBe(
          WagerTransactionKind.Loss,
        );
      },
    );
  },
);