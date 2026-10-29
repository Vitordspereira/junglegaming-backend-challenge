import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import {
  INestApplication,
} from '@nestjs/common';

import { Test } from '@nestjs/testing';

import { GetWagerTransactionUseCase } from '../../src/application/use-cases/get-wager-transaction.use-case.js';

import { ProcessWagerUseCase } from '../../src/application/use-cases/process-wager.use-case.js';

import {
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';

import { WageringTransactionsController } from '../../src/presentation/http/wagering-transactions.controller.js';

import { IdempotencyConflictError } from '../../src/application/errors/idempotency-conflict.error.js';

describe('POST /wagering/transactions HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  const getWagerTransactionUseCase = {
    execute: async () => {
      throw new Error(
        'GET use case should not be called',
      );
    },
  };

  const processWagerUseCase = {
    execute: async () => {
      return {
        transactionId:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        status:
          WagerTransactionStatus.Processed,

        balance:
          '975.00',

        idempotentReplay:
          false,
      };
    },
  };

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [
          WageringTransactionsController,
        ],

        providers: [
          {
            provide:
              GetWagerTransactionUseCase,

            useValue:
              getWagerTransactionUseCase,
          },

          {
            provide:
              ProcessWagerUseCase,

            useValue:
              processWagerUseCase,
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

  it('should process a BET and return HTTP 201', async () => {
    const response =
      await fetch(
        `${baseUrl}/wagering/transactions`,
        {
          method:
            'POST',

          headers: {
            'content-type':
              'application/json',

            'idempotency-key':
              'provider-a:transaction-123',
          },

          body:
            JSON.stringify({
              providerId:
                'provider-a',

              externalTransactionId:
                'transaction-123',

              playerId:
                'player-1',

              walletId:
                'wallet-1',

              roundId:
                'round-987',

              gameId:
                'fortune-chimp',

              kind:
                'BET',

              money: {
                amount:
                  '25.00',

                currency:
                  'BRL',
              },
            }),
        },
      );

    expect(
      response.status,
    ).toBe(201);

    expect(
      await response.json(),
    ).toEqual({
      transactionId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

      status:
        'PROCESSED',

      balance: {
        amount:
          '975.00',

        currency:
          'BRL',
      },

      idempotentReplay:
        false,
    });
  });

    it('should return HTTP 400 when Idempotency-Key header is missing', async () => {
      const response =
        await fetch(
          `${baseUrl}/wagering/transactions`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',
            },

            body:
              JSON.stringify({
                providerId:
                  'provider-a',

                externalTransactionId:
                  'transaction-123',

                playerId:
                  'player-1',

                walletId:
                  'wallet-1',

                roundId:
                  'round-987',

                gameId:
                  'fortune-chimp',

                kind:
                  'BET',

                money: {
                  amount:
                    '25.00',

                  currency:
                    'BRL',
                },
              }),
          },
        );

      expect(
        response.status,
      ).toBe(400);

      expect(
        await response.json(),
      ).toEqual({
        message:
          'Idempotency-Key header is required',

        error:
          'Bad Request',

        statusCode:
          400,
      });
    });

    it('should return HTTP 409 when Idempotency-Key is reused with a different payload', async () => {
      const originalExecute =
        processWagerUseCase.execute;

      processWagerUseCase.execute =
        async () => {
          throw new IdempotencyConflictError();
        };

      try {
        const response =
          await fetch(
            `${baseUrl}/wagering/transactions`,
            {
              method:
                'POST',

              headers: {
                'content-type':
                  'application/json',

                'idempotency-key':
                  'provider-a:transaction-123',
              },

              body:
                JSON.stringify({
                  providerId:
                    'provider-a',

                  externalTransactionId:
                    'transaction-123',

                  playerId:
                    'player-1',

                  walletId:
                    'wallet-1',

                  roundId:
                    'round-987',

                  gameId:
                    'fortune-chimp',

                  kind:
                    'BET',

                  money: {
                    amount:
                      '30.00',

                    currency:
                      'BRL',
                  },
                }),
            },
          );

        expect(
          response.status,
        ).toBe(409);

        expect(
          await response.json(),
        ).toEqual({
          message:
            'Idempotency key was already used with a different payload',

          error:
            'Conflict',

          statusCode:
            409,
        });
      } finally {
        processWagerUseCase.execute =
          originalExecute;
      }
    });

    it('should return HTTP 202 when the transaction is pending reference', async () => {
      const originalExecute =
        processWagerUseCase.execute;

      processWagerUseCase.execute =
        async () => {
          return {
            transactionId:
              'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

            status:
              WagerTransactionStatus.PendingReference,

            idempotentReplay:
              false,
          };
        };

      try {
        const response =
          await fetch(
            `${baseUrl}/wagering/transactions`,
            {
              method:
                'POST',

              headers: {
                'content-type':
                  'application/json',

                'idempotency-key':
                  'provider-a:refund-123',
              },

              body:
                JSON.stringify({
                  providerId:
                    'provider-a',

                  externalTransactionId:
                    'refund-123',

                  playerId:
                    'player-1',

                  walletId:
                    'wallet-1',

                  roundId:
                    'round-987',

                  gameId:
                    'fortune-chimp',

                  kind:
                    'REFUND',

                  money: {
                    amount:
                      '25.00',

                    currency:
                      'BRL',
                  },

                  referenceExternalTransactionId:
                    'bet-that-has-not-arrived-yet',
                }),
            },
          );

        expect(
          response.status,
        ).toBe(202);

        expect(
          await response.json(),
        ).toEqual({
          transactionId:
            'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

          status:
            'PENDING_REFERENCE',

          idempotentReplay:
            false,
        });
      } finally {
        processWagerUseCase.execute =
          originalExecute;
      }
    });
});