import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import type {
  InboxMessage,
} from '../../domain/messaging/inbox-message.js';

import {
  IdempotencyConflictError,
} from '../errors/idempotency-conflict.error.js';

import {
  PermanentMessageProcessingError,
} from '../errors/permanent-message-processing.error.js';

import type {
  InboxMessageRepository,
} from '../ports/inbox-message.repository.js';

import type {
  TransactionManager,
} from '../ports/transaction-manager.js';

import {
  ProcessWagerMessageUseCase,
} from './process-wager-message.use-case.js';

import type {
  ProcessWagerUseCase,
} from './process-wager.use-case.js';

describe(
  'ProcessWagerMessageUseCase',
  () => {
    it(
      'should not process the same SQS message twice',
      async () => {
        const messages =
          new Map<
            string,
            InboxMessage
          >();

        const inboxRepository:
          InboxMessageRepository = {
          async findByConsumerAndMessageId(
            consumerName:
              string,
            messageId:
              string,
          ) {
            return (
              messages.get(
                `${consumerName}:${messageId}`,
              ) ??
              null
            );
          },

          async save(
            inboxMessage:
              InboxMessage,
          ) {
            messages.set(
              `${inboxMessage.consumerName}:${inboxMessage.messageId}`,
              inboxMessage,
            );
          },
        };

        const transactionManager:
          TransactionManager = {
          async execute<T>(
            work:
              () => Promise<T>,
          ): Promise<T> {
            return work();
          },
        };

        let processCalls =
          0;

        const processWagerUseCase = {
          async execute() {
            processCalls +=
              1;

            return {
              transactionId:
                'transaction-1',

              status:
                WagerTransactionStatus.Processed,

              balance:
                '90.00',

              idempotentReplay:
                false,
            };
          },
        } as unknown as ProcessWagerUseCase;

        const useCase =
          new ProcessWagerMessageUseCase(
            inboxRepository,
            transactionManager,
            processWagerUseCase,
          );

        const message = {
          messageId:
            'message-1',

          type:
            'WagerTransactionRequested' as const,

          occurredAt:
            new Date()
              .toISOString(),

          data: {
            providerId:
              'provider-1',

            externalTransactionId:
              'external-1',

            idempotencyKey:
              'idempotency-1',

            playerId:
              '11111111-1111-1111-1111-111111111111',

            walletId:
              '22222222-2222-2222-2222-222222222222',

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Bet,

            money: {
              amount:
                '10.00',

              currency:
                'BRL',
            },
          },
        };

        const first =
          await useCase.execute(
            message,
          );

        const second =
          await useCase.execute(
            message,
          );

        expect(
          first.alreadyProcessed,
        ).toBe(false);

        expect(
          second.alreadyProcessed,
        ).toBe(true);

        expect(
          processCalls,
        ).toBe(1);
      },
    );

    it(
      'should classify idempotency conflict as a permanent message failure',
      async () => {
        const messages =
          new Map<
            string,
            InboxMessage
          >();

        const inboxRepository:
          InboxMessageRepository = {
          async findByConsumerAndMessageId(
            consumerName:
              string,
            messageId:
              string,
          ) {
            return (
              messages.get(
                `${consumerName}:${messageId}`,
              ) ??
              null
            );
          },

          async save(
            inboxMessage:
              InboxMessage,
          ) {
            messages.set(
              `${inboxMessage.consumerName}:${inboxMessage.messageId}`,
              inboxMessage,
            );
          },
        };

        const transactionManager:
          TransactionManager = {
          async execute<T>(
            work:
              () => Promise<T>,
          ): Promise<T> {
            return work();
          },
        };

        const processWagerUseCase = {
          async execute() {
            throw new IdempotencyConflictError();
          },
        } as unknown as ProcessWagerUseCase;

        const useCase =
          new ProcessWagerMessageUseCase(
            inboxRepository,
            transactionManager,
            processWagerUseCase,
          );

        const message = {
          messageId:
            'permanent-message-1',

          type:
            'WagerTransactionRequested' as const,

          occurredAt:
            new Date()
              .toISOString(),

          data: {
            providerId:
              'provider-1',

            externalTransactionId:
              'external-1',

            idempotencyKey:
              'idempotency-1',

            playerId:
              '11111111-1111-1111-1111-111111111111',

            walletId:
              '22222222-2222-2222-2222-222222222222',

            roundId:
              'round-1',

            gameId:
              'game-1',

            kind:
              WagerTransactionKind.Bet,

            money: {
              amount:
                '10.00',

              currency:
                'BRL',
            },
          },
        };

        let thrownError:
          unknown;

        try {
          await useCase.execute(
            message,
          );
        } catch (error) {
          thrownError =
            error;
        }

        expect(
          thrownError,
        ).toBeInstanceOf(
          PermanentMessageProcessingError,
        );

        expect(
          (
            thrownError as
              PermanentMessageProcessingError
          ).message,
        ).toBe(
          'Idempotency key was already used with a different payload',
        );
      },
    );
  },
);