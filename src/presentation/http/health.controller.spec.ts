import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  CheckReadinessOutput,
  CheckReadinessUseCase,
} from '../../application/use-cases/check-readiness.use-case.js';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('should report the application as live', () => {
    const checkReadinessUseCase =
      {} as CheckReadinessUseCase;

    const controller =
      new HealthController(
        checkReadinessUseCase,
      );

    expect(
      controller.live(),
    ).toEqual({
      status:
        'ok',
    });
  });

  it('should report ready when PostgreSQL and SQS are reachable', async () => {
    const checkReadinessUseCase = {
      execute:
        async (): Promise<CheckReadinessOutput> => ({
          status:
            'ready',

          checks: {
            postgres:
              true,

            sqs:
              true,
          },
        }),
    } as CheckReadinessUseCase;

    const controller =
      new HealthController(
        checkReadinessUseCase,
      );

    const result =
      await controller.ready();

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

  it('should throw HTTP 503 when a required dependency is unavailable', async () => {
    const checkReadinessUseCase = {
      execute:
        async (): Promise<CheckReadinessOutput> => ({
          status:
            'not_ready',

          checks: {
            postgres:
              true,

            sqs:
              false,
          },
        }),
    } as CheckReadinessUseCase;

    const controller =
      new HealthController(
        checkReadinessUseCase,
      );

    try {
      await controller.ready();

      throw new Error(
        'Expected controller.ready to throw',
      );
    } catch (error) {
      expect(
        error,
      ).toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(
        (
          error as ServiceUnavailableException
        ).getStatus(),
      ).toBe(503);
    }
  });
});