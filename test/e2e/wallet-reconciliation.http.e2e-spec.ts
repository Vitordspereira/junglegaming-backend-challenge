import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case.js';
import { GetWalletUseCase } from '../../src/application/use-cases/get-wallet.use-case.js';
import { ListWalletLedgerUseCase } from '../../src/application/use-cases/list-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from '../../src/application/use-cases/reconcile-wallet.use-case.js';

import { WalletsController } from '../../src/presentation/http/wallets.controller.js';

describe('POST /wallets/:walletId/reconciliation HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  const createWalletUseCase = {
    execute: async () => {
      throw new Error(
        'Create wallet should not be called',
      );
    },
  };

  const getWalletUseCase = {
    execute: async () => {
      throw new Error(
        'Get wallet should not be called',
      );
    },
  };

  const listWalletLedgerUseCase = {
    execute: async () => {
      throw new Error(
        'List wallet ledger should not be called',
      );
    },
  };

  const reconcileWalletUseCase = {
    execute: async (input: {
      walletId: string;
    }) => {
      return {
        walletId:
          input.walletId,

        storedBalance: {
          amount:
            '75.00',

          currency:
            'BRL',
        },

        calculatedBalance: {
          amount:
            '75.00',

          currency:
            'BRL',
        },

        difference: {
          amount:
            '0.00',

          currency:
            'BRL',
        },

        consistent:
          true,

        checkedEntries:
          2,
      };
    },
  };

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

            useValue:
              createWalletUseCase,
          },

          {
            provide:
              GetWalletUseCase,

            useValue:
              getWalletUseCase,
          },

          {
            provide:
              ListWalletLedgerUseCase,

            useValue:
              listWalletLedgerUseCase,
          },

          {
            provide:
              ReconcileWalletUseCase,

            useValue:
              reconcileWalletUseCase,
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

  it('should reconcile a wallet and return HTTP 200', async () => {
    const response =
      await fetch(
        `${baseUrl}/wallets/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa/reconciliation`,
        {
          method:
            'POST',
        },
      );

    expect(
      response.status,
    ).toBe(200);

    expect(
      await response.json(),
    ).toEqual({
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

      storedBalance: {
        amount:
          '75.00',

        currency:
          'BRL',
      },

      calculatedBalance: {
        amount:
          '75.00',

        currency:
          'BRL',
      },

      difference: {
        amount:
          '0.00',

        currency:
          'BRL',
      },

      consistent:
        true,

      checkedEntries:
        2,
    });
  });

  it('should return HTTP 404 when the wallet does not exist', async () => {
    const originalExecute =
      reconcileWalletUseCase.execute;

    reconcileWalletUseCase.execute =
      async () => {
        throw new Error(
          'Wallet not found',
        );
      };

    try {
      const response =
        await fetch(
          `${baseUrl}/wallets/ffffffff-ffff-ffff-ffff-ffffffffffff/reconciliation`,
          {
            method:
              'POST',
          },
        );

      expect(
        response.status,
      ).toBe(404);

      expect(
        await response.json(),
      ).toEqual({
        message:
          'Wallet not found',

        error:
          'Not Found',

        statusCode:
          404,
      });
    } finally {
      reconcileWalletUseCase.execute =
        originalExecute;
    }
  });
});