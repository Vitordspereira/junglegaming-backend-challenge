import {
  describe,
  expect,
  it,
} from 'bun:test';

import type {
  MikroORM,
} from '@mikro-orm/core';

import type {
  WagerTransactionQueue,
} from '../../application/ports/wager-transaction-queue.js';

import {
  MikroOrmReadinessChecker,
} from './mikro-orm-readiness-checker.js';

describe('MikroOrmReadinessChecker', () => {
  it('should report PostgreSQL and SQS as reachable', async () => {
    const orm = {
      em: {
        getConnection:
          () => ({
            execute:
              async () => [
                {
                  '?column?':
                    1,
                },
              ],
          }),
      },
    } as unknown as MikroORM;

    const queue = {
      isReachable:
        async () =>
          true,
    } as unknown as WagerTransactionQueue;

    const checker =
      new MikroOrmReadinessChecker(
        orm,
        queue,
      );

    const result =
      await checker.check();

    expect(
      result,
    ).toEqual({
      postgres:
        true,

      sqs:
        true,
    });
  });

  it('should report PostgreSQL as unavailable when the query fails', async () => {
    const orm = {
      em: {
        getConnection:
          () => ({
            execute:
              async () => {
                throw new Error(
                  'Database unavailable',
                );
              },
          }),
      },
    } as unknown as MikroORM;

    const queue = {
      isReachable:
        async () =>
          true,
    } as unknown as WagerTransactionQueue;

    const checker =
      new MikroOrmReadinessChecker(
        orm,
        queue,
      );

    const result =
      await checker.check();

    expect(
      result,
    ).toEqual({
      postgres:
        false,

      sqs:
        true,
    });
  });

  it('should report SQS as unavailable when the queue cannot be reached', async () => {
    const orm = {
      em: {
        getConnection:
          () => ({
            execute:
              async () => [
                {
                  '?column?':
                    1,
                },
              ],
          }),
      },
    } as unknown as MikroORM;

    const queue = {
      isReachable:
        async () =>
          false,
    } as unknown as WagerTransactionQueue;

    const checker =
      new MikroOrmReadinessChecker(
        orm,
        queue,
      );

    const result =
      await checker.check();

    expect(
      result,
    ).toEqual({
      postgres:
        true,

      sqs:
        false,
    });
  });
});