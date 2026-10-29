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
  AppModule,
} from '../../src/app.module.js';

describe('Health readiness with real infrastructure', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        imports: [
          AppModule,
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

  it('should return HTTP 200 for liveness', async () => {
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

  it('should return HTTP 200 when PostgreSQL and SQS are reachable', async () => {
    const response =
      await fetch(
        `${baseUrl}/health/ready`,
      );

    expect(
      response.status,
    ).toBe(200);

    expect(
      await response.json(),
    ).toEqual({
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
});