import {
  describe,
  expect,
  it,
} from 'bun:test';

import type {
  ReadinessChecker,
} from '../ports/readiness-checker.js';

import {
  CheckReadinessUseCase,
} from './check-readiness.use-case.js';

describe('CheckReadinessUseCase', () => {
  it('should report ready when PostgreSQL and SQS are reachable', async () => {
    const readinessChecker = {
      check: async () => ({
        postgres: true,
        sqs: true,
      }),
    } as ReadinessChecker;

    const useCase =
      new CheckReadinessUseCase(
        readinessChecker,
      );

    const result =
      await useCase.execute();

    expect(result).toEqual({
      status:
        'ready',

      checks: {
        postgres:
          true,

        sqs:
          true,
      },
    });
  });

  it('should report not ready when SQS is unavailable', async () => {
    const readinessChecker = {
      check: async () => ({
        postgres: true,
        sqs: false,
      }),
    } as ReadinessChecker;

    const useCase =
      new CheckReadinessUseCase(
        readinessChecker,
      );

    const result =
      await useCase.execute();

    expect(result).toEqual({
      status:
        'not_ready',

      checks: {
        postgres:
          true,

        sqs:
          false,
      },
    });
  });
});