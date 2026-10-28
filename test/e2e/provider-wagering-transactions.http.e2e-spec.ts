import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { GetProviderWagerTransactionUseCase } from '../../src/application/use-cases/get-provider-wager-transaction.use-case.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';

import { ProviderWageringTransactionsController } from '../../src/presentation/http/provider-wagering-transactions.controller.js';

describe('ProviderWageringTransactionsController HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  const getProviderWagerTransactionUseCase = {
    execute: async (input: {
      providerId: string;
      externalTransactionId: string;
    }) => {
      if (
        input.externalTransactionId ===
        'transaction-404'
      ) {
        throw new Error(
          'Wager transaction not found',
        );
      }

      return {
        transactionId:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        providerId:
          input.providerId,

        externalTransactionId:
          input.externalTransactionId,

        walletId:
          'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',

        playerId:
          'cccccccc-1111-2222-3333-cccccccccccc',

        roundId:
          'round-987',

        gameId:
          'fortune-chimp',

        kind:
          WagerTransactionKind.Bet,

        money: {
          amount: '25.00',
          currency: 'BRL',
        },

        status:
          WagerTransactionStatus.Processed,

        resultBalance: {
          amount: '975.00',
          currency: 'BRL',
        },

        createdAt:
          '2026-10-28T12:00:00.000Z',

        processedAt:
          '2026-10-28T12:00:01.000Z',
      };
    },
  };

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [
          ProviderWageringTransactionsController,
        ],

        providers: [
          {
            provide:
              GetProviderWagerTransactionUseCase,

            useValue:
              getProviderWagerTransactionUseCase,
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

  it('should return HTTP 200 with the provider wagering transaction', async () => {
    const response =
      await fetch(
        `${baseUrl}/providers/provider-a/wagering/transactions/transaction-123`,
      );

    expect(response.status).toBe(200);

    expect(
      await response.json(),
    ).toEqual({
      transactionId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

      providerId:
        'provider-a',

      externalTransactionId:
        'transaction-123',

      walletId:
        'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',

      playerId:
        'cccccccc-1111-2222-3333-cccccccccccc',

      roundId:
        'round-987',

      gameId:
        'fortune-chimp',

      kind: 'BET',

      money: {
        amount: '25.00',
        currency: 'BRL',
      },

      status:
        'PROCESSED',

      resultBalance: {
        amount: '975.00',
        currency: 'BRL',
      },

      createdAt:
        '2026-10-28T12:00:00.000Z',

      processedAt:
        '2026-10-28T12:00:01.000Z',
    });
  });

  it('should return HTTP 404 when the provider wagering transaction does not exist', async () => {
    const response =
      await fetch(
        `${baseUrl}/providers/provider-a/wagering/transactions/transaction-404`,
      );

    expect(response.status).toBe(404);

    expect(
      await response.json(),
    ).toEqual({
      message:
        'Wager transaction not found',
      error:
        'Not Found',
      statusCode:
        404,
    });
  });
});