import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import {
  MikroORM,
} from '@mikro-orm/postgresql';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

import {
  OutboxMessage,
} from '../../src/domain/messaging/outbox-message.js';

import {
  OutboxMessageEntity,
} from '../../src/infrastructure/database/entities/outbox-message.entity.js';

import {
  MikroOrmOutboxMessageRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-outbox-message.repository.js';

describe(
  'MikroOrmOutboxMessageRepository integration',
  () => {
    let orm: MikroORM;

    const messageId =
      '11111111-1111-1111-1111-111111111111';

    beforeAll(async () => {
      orm =
        await MikroORM.init(
          mikroOrmConfig,
        );

      await orm.em
        .fork()
        .nativeDelete(
          OutboxMessageEntity,
          {
            id:
              messageId,
          },
        );
    });

    afterAll(async () => {
      await orm.em
        .fork()
        .nativeDelete(
          OutboxMessageEntity,
          {
            id:
              messageId,
          },
        );

      await orm.close(true);
    });

    it(
      'should persist and retrieve a pending outbox message',
      async () => {
        const repository =
          new MikroOrmOutboxMessageRepository(
            orm.em.fork(),
          );

        const occurredAt =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        const message =
          OutboxMessage.create({
            id:
              messageId,

            aggregateId:
              'transaction-1',

            eventType:
              'WagerTransactionProcessed',

            occurredAt,

            payload: {
              eventId:
                'event-1',

              eventType:
                'WagerTransactionProcessed',

              aggregateId:
                'transaction-1',

              correlationId:
                'correlation-1',

              occurredAt:
                occurredAt.toISOString(),

              version:
                1,

              data: {
                transactionId:
                  'transaction-1',

                money: {
                  amount:
                    '10.00',

                  currency:
                    'BRL',
                },
              },
            },
          });

        await repository.save(
          message,
        );

        const found =
          await repository.findById(
            messageId,
          );

        expect(
          found,
        ).not.toBeNull();

        expect(
          found?.aggregateId,
        ).toBe(
          'transaction-1',
        );

        expect(
          found?.eventType,
        ).toBe(
          'WagerTransactionProcessed',
        );

        expect(
          found?.attempts,
        ).toBe(0);

        expect(
          found?.nextAttemptAt,
        ).toBeUndefined();

        expect(
          found?.isPublished(),
        ).toBe(false);
      },
    );

    it(
      'should persist retry state',
      async () => {
        const repository =
          new MikroOrmOutboxMessageRepository(
            orm.em.fork(),
          );

        const existing =
          await repository.findById(
            messageId,
          );

        expect(
          existing,
        ).not.toBeNull();

        const retryAt =
          new Date(
            '2026-10-29T04:00:00.000Z',
          );

        const scheduled =
          existing!.scheduleRetry(
            retryAt,
          );

        await repository.save(
          scheduled,
        );

        const found =
          await repository.findById(
            messageId,
          );

        expect(
          found?.attempts,
        ).toBe(1);

        expect(
          found?.nextAttemptAt,
        ).toEqual(
          new Date(
            '2026-10-29T04:00:05.000Z',
          ),
        );
      },
    );

    it(
      'should persist publishedAt when marked as published',
      async () => {
        const repository =
          new MikroOrmOutboxMessageRepository(
            orm.em.fork(),
          );

        const existing =
          await repository.findById(
            messageId,
          );

        expect(
          existing,
        ).not.toBeNull();

        const publishedAt =
          new Date(
            '2026-10-29T05:00:00.000Z',
          );

        const published =
          existing!.markPublished(
            publishedAt,
          );

        await repository.save(
          published,
        );

        const found =
          await repository.findById(
            messageId,
          );

        expect(
          found?.isPublished(),
        ).toBe(true);

        expect(
          found?.publishedAt,
        ).toEqual(
          publishedAt,
        );

        expect(
          found?.nextAttemptAt,
        ).toBeUndefined();

        expect(
          found?.attempts,
        ).toBe(1);
      },
    );
  },
);