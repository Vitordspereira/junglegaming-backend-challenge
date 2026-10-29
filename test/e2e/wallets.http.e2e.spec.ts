import 'reflect-metadata';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  CreateWalletUseCase,
  type CreateWalletOutput,
} from '../../src/application/use-cases/create-wallet.use-case.js';

import {
  GetWalletUseCase,
  type GetWalletOutput,
} from '../../src/application/use-cases/get-wallet.use-case.js';

import {
  ListWalletLedgerUseCase,
  type ListWalletLedgerOutput,
} from '../../src/application/use-cases/list-wallet-ledger.use-case.js';

import { ReconcileWalletUseCase } from '../../src/application/use-cases/reconcile-wallet.use-case.js';

import { WalletsController } from '../../src/presentation/http/wallets.controller.js';

describe('Wallets HTTP', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [
          WalletsController,
        ],

        providers: [
          {
            provide:
              CreateWalletUseCase,

            useValue: {
              execute:
                async (): Promise<CreateWalletOutput> => ({
                  walletId:
                    '0192f291-27dd-7d3f-8071-5f8685deef37',

                  playerId:
                    '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',

                  balance:
                    '1000.00',

                  currency:
                    'BRL',

                  version:
                    1,
                }),
            },
          },

          {
            provide:
              GetWalletUseCase,

            useValue: {
              execute: async (input: {
                walletId: string;
              }): Promise<GetWalletOutput> => {
                if (
                  input.walletId ===
                  'cccccccc-1111-2222-3333-cccccccccccc'
                ) {
                  throw new Error(
                    'Wallet not found',
                  );
                }

                return {
                  id:
                    'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

                  playerId:
                    'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',

                  balance:
                    '125.00',

                  currency:
                    'BRL',

                  version:
                    3,
                };
              },
            },
          },

          {
            provide:
              ListWalletLedgerUseCase,

            useValue: {
              execute: async (input: {
                walletId: string;
                limit: number;
                cursor?: string;
              }): Promise<ListWalletLedgerOutput> => {
                if (
                  input.cursor ===
                  'invalid-cursor'
                ) {
                  throw new Error(
                    'Invalid cursor',
                  );
                }

                return {
                  items: [
                    {
                      id:
                        '11111111-1111-1111-1111-111111111111',

                      transactionId:
                        '22222222-2222-2222-2222-222222222222',

                      direction:
                        'CREDIT',

                      amount:
                        '100.00',

                      currency:
                        'BRL',

                      balanceBefore:
                        '0.00',

                      balanceAfter:
                        '100.00',

                      createdAt:
                        '2026-10-28T12:00:00.000Z',
                    },
                  ],

                  nextCursor:
                    input.limit === 2
                      ? 'next-cursor-value'
                      : undefined,
                };
              },
            },
          },

          {
            provide:
              ReconcileWalletUseCase,

            useValue: {
              execute: async () => {
                throw new Error(
                  'ReconcileWalletUseCase should not be called in this E2E test',
                );
              },
            },
          },
        ],
      }).compile();

    app =
      moduleRef.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should expose POST /wallets and return the expected HTTP contract', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .post('/wallets')
        .send({
          playerId:
            '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',

          initialBalance: {
            amount:
              '1000.00',

            currency:
              'BRL',
          },
        })
        .expect(201);

    expect(
      response.body,
    ).toEqual({
      id:
        '0192f291-27dd-7d3f-8071-5f8685deef37',

      playerId:
        '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',

      balance: {
        amount:
          '1000.00',

        currency:
          'BRL',
      },

      version:
        1,
    });
  });

  it('should expose GET /wallets/:walletId and return the expected HTTP contract', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .get(
          '/wallets/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
        )
        .expect(200);

    expect(
      response.body,
    ).toEqual({
      id:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

      playerId:
        'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',

      balance: {
        amount:
          '125.00',

        currency:
          'BRL',
      },

      version:
        3,
    });
  });

  it('should return HTTP 404 when GET /wallets/:walletId does not find the wallet', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .get(
          '/wallets/cccccccc-1111-2222-3333-cccccccccccc',
        )
        .expect(404);

    expect(
      response.body.statusCode,
    ).toBe(
      404,
    );

    expect(
      response.body.message,
    ).toBe(
      'Wallet not found',
    );
  });

  it('should expose GET /wallets/:walletId/ledger and return the expected HTTP contract', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .get(
          '/wallets/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa/ledger?limit=2',
        )
        .expect(200);

    expect(
      response.body,
    ).toEqual({
      items: [
        {
          id:
            '11111111-1111-1111-1111-111111111111',

          transactionId:
            '22222222-2222-2222-2222-222222222222',

          direction:
            'CREDIT',

          amount:
            '100.00',

          currency:
            'BRL',

          balanceBefore:
            '0.00',

          balanceAfter:
            '100.00',

          createdAt:
            '2026-10-28T12:00:00.000Z',
        },
      ],

      nextCursor:
        'next-cursor-value',
    });
  });

  it('should return HTTP 400 when ledger limit is 0', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .get(
          '/wallets/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa/ledger?limit=0',
        )
        .expect(400);

    expect(
      response.body.statusCode,
    ).toBe(
      400,
    );

    expect(
      response.body.message,
    ).toBe(
      'Invalid limit',
    );
  });

  it('should return HTTP 400 when ledger cursor is invalid', async () => {
    if (!app) {
      throw new Error(
        'Test application was not initialized',
      );
    }

    const response =
      await request(
        app.getHttpServer(),
      )
        .get(
          '/wallets/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa/ledger?limit=2&cursor=invalid-cursor',
        )
        .expect(400);

    expect(
      response.body.statusCode,
    ).toBe(
      400,
    );

    expect(
      response.body.message,
    ).toBe(
      'Invalid cursor',
    );
  });
});