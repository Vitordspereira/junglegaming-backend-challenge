import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  IntegrationEvent,
} from './integration-event.js';

import {
  OutboxMessage,
} from './outbox-message.js';

describe(
  'OutboxMessage',
  () => {
    const createMessage = () =>
      OutboxMessage.create({
        id:
          '11111111-1111-1111-1111-111111111111',

        aggregateId:
          'transaction-1',

        eventType:
          'WagerTransactionProcessed',

        payload: {
          transactionId:
            'transaction-1',
        },
      });

    it(
      'should create a pending outbox message',
      () => {
        const message =
          createMessage();

        expect(
          message.aggregateId,
        ).toBe(
          'transaction-1',
        );

        expect(
          message.attempts,
        ).toBe(0);

        expect(
          message.nextAttemptAt,
        ).toBeUndefined();

        expect(
          message.isPending(),
        ).toBe(true);

        expect(
          message.isPublished(),
        ).toBe(false);

        expect(
          message.isDue(
            new Date(),
          ),
        ).toBe(true);
      },
    );

    it(
      'should mark an outbox message as published',
      () => {
        const message =
          createMessage();

        const publishedAt =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        const published =
          message.markPublished(
            publishedAt,
          );

        expect(
          published.isPublished(),
        ).toBe(true);

        expect(
          published.isPending(),
        ).toBe(false);

        expect(
          published.publishedAt,
        ).toEqual(
          publishedAt,
        );

        expect(
          published.isDue(
            new Date(
              '2026-10-29T04:00:00.000Z',
            ),
          ),
        ).toBe(false);
      },
    );

    it(
      'should schedule retries with exponential backoff',
      () => {
        const now =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        const first =
          createMessage()
            .scheduleRetry(
              now,
            );

        expect(
          first.attempts,
        ).toBe(1);

        expect(
          first.nextAttemptAt,
        ).toEqual(
          new Date(
            '2026-10-29T03:00:05.000Z',
          ),
        );

        expect(
          first.isDue(
            new Date(
              '2026-10-29T03:00:04.000Z',
            ),
          ),
        ).toBe(false);

        expect(
          first.isDue(
            new Date(
              '2026-10-29T03:00:05.000Z',
            ),
          ),
        ).toBe(true);

        const second =
          first.scheduleRetry(
            new Date(
              '2026-10-29T03:00:05.000Z',
            ),
          );

        expect(
          second.attempts,
        ).toBe(2);

        expect(
          second.nextAttemptAt,
        ).toEqual(
          new Date(
            '2026-10-29T03:00:15.000Z',
          ),
        );
      },
    );

    it(
      'should cap retry backoff at 300 seconds',
      () => {
        let message =
          createMessage();

        const now =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        for (
          let attempt = 0;
          attempt < 10;
          attempt += 1
        ) {
          message =
            message.scheduleRetry(
              now,
            );
        }

        expect(
          message.attempts,
        ).toBe(10);

        expect(
          message.nextAttemptAt,
        ).toEqual(
          new Date(
            '2026-10-29T03:05:00.000Z',
          ),
        );
      },
    );

    it(
      'should keep the original publication date when marked as published twice',
      () => {
        const firstDate =
          new Date(
            '2026-10-29T03:00:00.000Z',
          );

        const secondDate =
          new Date(
            '2026-10-29T04:00:00.000Z',
          );

        const first =
          createMessage()
            .markPublished(
              firstDate,
            );

        const second =
          first.markPublished(
            secondDate,
          );

        expect(
          second.publishedAt,
        ).toEqual(
          firstDate,
        );
      },
    );

    it(
      'should reject an empty aggregate id',
      () => {
        expect(() =>
          OutboxMessage.create({
            id:
              '11111111-1111-1111-1111-111111111111',

            aggregateId:
              '   ',

            eventType:
              'WagerTransactionProcessed',

            payload: {},
          }),
        ).toThrow(
          'Outbox aggregate id is required',
        );
      },
    );

    it(
      'should reject an empty event type',
      () => {
        expect(() =>
          OutboxMessage.create({
            id:
              '11111111-1111-1111-1111-111111111111',

            aggregateId:
              'transaction-1',

            eventType:
              '   ',

            payload: {},
          }),
        ).toThrow(
          'Outbox event type is required',
        );
      },
    );

    it(
      'should enqueue an integration event preserving its envelope',
      () => {
        class TestEvent extends IntegrationEvent<
          {
            transactionId: string;
          }
        > {
          readonly eventType =
            'TestEvent';

          readonly version =
            1;

          constructor() {
            super({
              eventId:
                '33333333-3333-4333-8333-333333333333',

              aggregateId:
                'transaction-3',

              correlationId:
                'correlation-3',

              occurredAt:
                new Date(
                  '2026-10-29T04:00:00.000Z',
                ),

              data: {
                transactionId:
                  'transaction-3',
              },
            });
          }
        }

        const event =
          new TestEvent();

        const outbox =
          OutboxMessage.enqueue(
            event,
          );

        expect(
          outbox.id,
        ).toBe(
          event.eventId,
        );

        expect(
          outbox.aggregateId,
        ).toBe(
          event.aggregateId,
        );

        expect(
          outbox.eventType,
        ).toBe(
          'TestEvent',
        );

        expect(
          outbox.payload,
        ).toEqual(
          event.toJSON(),
        );

        expect(
          outbox.occurredAt,
        ).toEqual(
          event.occurredAt,
        );

        expect(
          outbox.attempts,
        ).toBe(0);

        expect(
          outbox.isPending(),
        ).toBe(true);
      },
    );
  },
);