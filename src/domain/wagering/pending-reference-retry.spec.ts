import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  PendingReferenceRetry,
} from './pending-reference-retry.js';

import {
  PendingReferenceRetryPolicy,
} from './pending-reference-retry-policy.js';

describe(
  'PendingReferenceRetry',
  () => {
    it(
      'starts with zero attempts and schedules the first retry',
      () => {
        const createdAt =
          new Date(
            '2026-10-29T16:00:00.000Z',
          );

        const retry =
          PendingReferenceRetry.create({
            transactionId:
              '11111111-1111-4111-8111-111111111111',

            createdAt,
          });

        expect(
          retry.attempts,
        ).toBe(0);

        expect(
          retry.nextAttemptAt
            .toISOString(),
        ).toBe(
          '2026-10-29T16:00:05.000Z',
        );

        expect(
          retry.isDue(
            new Date(
              '2026-10-29T16:00:04.999Z',
            ),
          ),
        ).toBe(false);

        expect(
          retry.isDue(
            new Date(
              '2026-10-29T16:00:05.000Z',
            ),
          ),
        ).toBe(true);
      },
    );

    it(
      'increments attempts and applies exponential backoff',
      () => {
        const retry =
          PendingReferenceRetry.create({
            transactionId:
              '22222222-2222-4222-8222-222222222222',

            createdAt:
              new Date(
                '2026-10-29T16:00:00.000Z',
              ),
          });

        retry.scheduleNextAttempt(
          new Date(
            '2026-10-29T16:00:05.000Z',
          ),
        );

        expect(
          retry.attempts,
        ).toBe(1);

        expect(
          retry.nextAttemptAt
            .toISOString(),
        ).toBe(
          '2026-10-29T16:00:15.000Z',
        );

        retry.scheduleNextAttempt(
          new Date(
            '2026-10-29T16:00:15.000Z',
          ),
        );

        expect(
          retry.attempts,
        ).toBe(2);

        expect(
          retry.nextAttemptAt
            .toISOString(),
        ).toBe(
          '2026-10-29T16:00:35.000Z',
        );
      },
    );

    it(
      'can be rehydrated and knows when attempts are exhausted',
      () => {
        const policy =
          new PendingReferenceRetryPolicy({
            maxAttempts: 5,
            ttlMs:
              5 * 60_000,
          });

        const retry =
          PendingReferenceRetry.rehydrate({
            transactionId:
              '33333333-3333-4333-8333-333333333333',

            attempts:
              5,

            nextAttemptAt:
              new Date(
                '2026-10-29T16:01:00.000Z',
              ),

            createdAt:
              new Date(
                '2026-10-29T16:00:00.000Z',
              ),
          });

        expect(
          retry.shouldReject(
            new Date(
              '2026-10-29T16:01:00.000Z',
            ),
            policy,
          ),
        ).toBe(true);
      },
    );
  },
);
