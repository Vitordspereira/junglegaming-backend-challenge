import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

import type {
  IntegrationEventPublisher,
} from '../ports/integration-event-publisher.js';

import type {
  OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

import type {
  TransactionManager,
} from '../ports/transaction-manager.js';

import {
  PublishOutboxUseCase,
} from './publish-outbox.use-case.js';

describe(
  'PublishOutboxUseCase',
  () => {
    it(
      'should mark a successfully published event as published',
      async () => {
        let stored =
          OutboxMessage.create({
            id:
              '11111111-1111-1111-1111-111111111111',

            aggregateId:
              'transaction-1',

            eventType:
              'WagerTransactionProcessed',

            payload: {
              eventId:
                'event-1',

              eventType:
                'WagerTransactionProcessed',
            },
          });

        let publishCalls =
          0;

        const repository:
          OutboxMessageRepository = {
          async findById() {
            return stored;
          },

          async findDueForPublishing() {
            return [
              stored,
            ];
          },

          async save(
            message,
          ) {
            stored =
              message;
          },
        };

        const publisher:
          IntegrationEventPublisher = {
          async publish() {
            publishCalls +=
              1;
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

        const useCase =
          new PublishOutboxUseCase(
            repository,
            publisher,
            transactionManager,
          );

        const result =
          await useCase.execute(
            new Date(
              '2026-10-29T03:00:00.000Z',
            ),
          );

        expect(
          result,
        ).toEqual({
          selected:
            1,

          published:
            1,

          failed:
            0,
        });

        expect(
          publishCalls,
        ).toBe(1);

        expect(
          stored.isPublished(),
        ).toBe(true);
      },
    );

    it(
      'should schedule retry when publication fails',
      async () => {
        let stored =
          OutboxMessage.create({
            id:
              '22222222-2222-2222-2222-222222222222',

            aggregateId:
              'transaction-2',

            eventType:
              'WagerTransactionProcessed',

            payload: {
              eventId:
                'event-2',
            },
          });

        const repository:
          OutboxMessageRepository = {
          async findById() {
            return stored;
          },

          async findDueForPublishing() {
            return [
              stored,
            ];
          },

          async save(
            message,
          ) {
            stored =
              message;
          },
        };

        const publisher:
          IntegrationEventPublisher = {
          async publish() {
            throw new Error(
              'SQS unavailable',
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

        const useCase =
          new PublishOutboxUseCase(
            repository,
            publisher,
            transactionManager,
          );

        const now =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        const result =
          await useCase.execute(
            now,
          );

        expect(
          result,
        ).toEqual({
          selected:
            1,

          published:
            0,

          failed:
            1,
        });

        expect(
          stored.isPublished(),
        ).toBe(false);

        expect(
          stored.attempts,
        ).toBe(1);

        expect(
          stored.nextAttemptAt,
        ).toEqual(
          new Date(
            '2026-10-29T03:00:05.000Z',
          ),
        );
      },
    );
  },
);