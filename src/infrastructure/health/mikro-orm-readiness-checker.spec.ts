import {
  describe,
  expect,
  it,
} from 'bun:test';

import type {
  MikroORM,
} from '@mikro-orm/core';

import {
  MikroOrmReadinessChecker,
} from './mikro-orm-readiness-checker.js';

describe('MikroOrmReadinessChecker', () => {
  it('should report PostgreSQL as reachable when SELECT 1 succeeds', async () => {
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

    const checker =
      new MikroOrmReadinessChecker(
        orm,
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

    const checker =
      new MikroOrmReadinessChecker(
        orm,
      );

    const result =
      await checker.check();

    expect(
      result,
    ).toEqual({
      postgres:
        false,

      sqs:
        false,
    });
  });
});