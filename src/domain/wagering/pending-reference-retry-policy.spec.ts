import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  PendingReferenceRetryPolicy,
} from './pending-reference-retry-policy.js';

describe(
  'PendingReferenceRetryPolicy',
  () => {
    it(
      'calculates exponential backoff with a maximum delay cap',
      () => {
        const policy =
          new PendingReferenceRetryPolicy();

        expect(
          policy.calculateDelayMs(0),
        ).toBe(5_000);

        expect(
          policy.calculateDelayMs(1),
        ).toBe(10_000);

        expect(
          policy.calculateDelayMs(2),
        ).toBe(20_000);

        expect(
          policy.calculateDelayMs(3),
        ).toBe(40_000);

        expect(
          policy.calculateDelayMs(4),
        ).toBe(60_000);

        expect(
          policy.calculateDelayMs(5),
        ).toBe(60_000);
      },
    );

    it(
      'calculates the next retry date from the current time',
      () => {
        const policy =
          new PendingReferenceRetryPolicy();

        const now =
          new Date(
            '2026-10-29T16:00:00.000Z',
          );

        expect(
          policy
            .nextAttemptAt(
              now,
              0,
            )
            .toISOString(),
        ).toBe(
          '2026-10-29T16:00:05.000Z',
        );

        expect(
          policy
            .nextAttemptAt(
              now,
              2,
            )
            .toISOString(),
        ).toBe(
          '2026-10-29T16:00:20.000Z',
        );
      },
    );

    it(
      'rejects when max attempts or TTL is reached',
      () => {
        const policy =
          new PendingReferenceRetryPolicy();

        const createdAt =
          new Date(
            '2026-10-29T16:00:00.000Z',
          );

        expect(
          policy.shouldReject(
            createdAt,
            4,
            new Date(
              '2026-10-29T16:04:59.999Z',
            ),
          ),
        ).toBe(false);

        expect(
          policy.shouldReject(
            createdAt,
            5,
            new Date(
              '2026-10-29T16:01:00.000Z',
            ),
          ),
        ).toBe(true);

        expect(
          policy.shouldReject(
            createdAt,
            1,
            new Date(
              '2026-10-29T16:05:00.000Z',
            ),
          ),
        ).toBe(true);
      },
    );
  },
);
