import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import type {
  INestApplication,
} from '@nestjs/common';

import {
  Test,
} from '@nestjs/testing';

import {
  CheckReadinessUseCase,
} from '../../src/application/use-cases/check-readiness.use-case.js';

import {
  HealthController,
} from '../../src/presentation/http/health.controller.js';

describe('Health HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  const checkReadinessUseCase = {
    execute: async () => ({
      status:
        'not_ready' as const,

      checks: {
        postgres:
          true,

        sqs:
          false,
      },
    }),
  };

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [
          HealthController,
        ],

        providers: [
          {
            provide:
              CheckReadinessUseCase,

            useValue:
              checkReadinessUseCase,
          },
        ],
      }).compile();

    app =
      moduleRef.createNestApplication();

    await app.listen(0);

    const server =
      app.getHttpServer();

    const address =
      server.address();

    if (
      !address ||
      typeof address === 'string'
    ) {
      throw new Error(
        'Could not determine test server port',
      );
    }

    baseUrl =
      `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return HTTP 200 when the application is live', async () => {
    const response =
      await fetch(
        `${baseUrl}/health/live`,
      );

    expect(
      response.status,
    ).toBe(200);

    expect(
      await response.json(),
    ).toEqual({
      status:
        'ok',
    });
  });

  it('should return HTTP 503 when a required dependency is unavailable', async () => {
    const response =
      await fetch(
        `${baseUrl}/health/ready`,
      );

    expect(
      response.status,
    ).toBe(503);

    expect(
      await response.json(),
    ).toEqual({
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