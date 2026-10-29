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
  'Concurrent outbox publishers integration',
  () => {
    let orm: MikroORM;

    const firstMessageId =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const secondMessageId =
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    beforeAll(async () => {
      orm =
        await MikroORM.init(
          mikroOrmConfig,
        );

      const cleanupEm =
        orm.em.fork();

      await cleanupEm.nativeDelete(
        OutboxMessageEntity,
        {
          id: {
            $in: [
              firstMessageId,
              secondMessageId,
            ],
          },
        },
      );

      const repository =
        new MikroOrmOutboxMessageRepository(
          orm.em.fork(),
        );

      /*
       * Datas antigas garantem que estes dois
       * eventos apareçam primeiro na ordenação
       * por occurredAt durante o teste.
       */
      const firstMessage =
        OutboxMessage.create({
          id:
            firstMessageId,

          aggregateId:
            'concurrency-transaction-1',

          eventType:
            'WagerTransactionProcessed',

          occurredAt:
            new Date(
              '1970-01-01T00:00:01.000Z',
            ),

          payload: {
            eventId:
              firstMessageId,

            eventType:
              'WagerTransactionProcessed',

            aggregateId:
              'concurrency-transaction-1',

            correlationId:
              'correlation-1',

            occurredAt:
              '1970-01-01T00:00:01.000Z',

            version:
              1,

            data: {
              transactionId:
                'concurrency-transaction-1',
            },
          },
        });

      const secondMessage =
        OutboxMessage.create({
          id:
            secondMessageId,

          aggregateId:
            'concurrency-transaction-2',

          eventType:
            'WagerTransactionProcessed',

          occurredAt:
            new Date(
              '1970-01-01T00:00:02.000Z',
            ),

          payload: {
            eventId:
              secondMessageId,

            eventType:
              'WagerTransactionProcessed',

            aggregateId:
              'concurrency-transaction-2',

            correlationId:
              'correlation-2',

            occurredAt:
              '1970-01-01T00:00:02.000Z',

            version:
              1,

            data: {
              transactionId:
                'concurrency-transaction-2',
            },
          },
        });

      await repository.save(
        firstMessage,
      );

      await repository.save(
        secondMessage,
      );
    });

    afterAll(async () => {
      await orm.em
        .fork()
        .nativeDelete(
          OutboxMessageEntity,
          {
            id: {
              $in: [
                firstMessageId,
                secondMessageId,
              ],
            },
          },
        );

      await orm.close(true);
    });

    it(
      'should let concurrent publishers claim different outbox messages using SKIP LOCKED',
      async () => {
        const now =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        let notifyPublisherALocked:
          () => void =
          () => {};

        const publisherALocked =
          new Promise<void>(
            (resolve) => {
              notifyPublisherALocked =
                resolve;
            },
          );

        let releasePublisherA:
          () => void =
          () => {};

        const publisherACanFinish =
          new Promise<void>(
            (resolve) => {
              releasePublisherA =
                resolve;
            },
          );

        const publisherAPromise =
          orm.em
            .fork()
            .transactional(
              async (
                transactionEm,
              ) => {
                const repository =
                  new MikroOrmOutboxMessageRepository(
                    transactionEm,
                  );

                const messages =
                  await repository
                    .findDueForPublishing(
                      1,
                      now,
                    );

                expect(
                  messages.length,
                ).toBe(1);

                expect(
                  messages[0]?.id,
                ).toBe(
                  firstMessageId,
                );

                notifyPublisherALocked();

                await publisherACanFinish;

                return messages;
              },
            );
        await publisherALocked;
        const publisherBMessages =
          await orm.em
            .fork()
            .transactional(
              async (
                transactionEm,
              ) => {
                const repository =
                  new MikroOrmOutboxMessageRepository(
                    transactionEm,
                  );

                return repository
                  .findDueForPublishing(
                    1,
                    now,
                  );
              },
            );

        expect(
          publisherBMessages.length,
        ).toBe(1);

        expect(
          publisherBMessages[0]?.id,
        ).toBe(
          secondMessageId,
        );

        expect(
          publisherBMessages[0]?.id,
        ).not.toBe(
          firstMessageId,
        );

        /*
         * Agora A pode terminar e liberar
         * o lock.
         */
        releasePublisherA();

        const publisherAMessages =
          await publisherAPromise;

        expect(
          publisherAMessages[0]?.id,
        ).toBe(
          firstMessageId,
        );
      },
    );
  },
);