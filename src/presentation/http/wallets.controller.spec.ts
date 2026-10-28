import { describe, expect, it } from 'bun:test';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import type {
  CreateWalletOutput,
  CreateWalletUseCase,
} from '../../application/use-cases/create-wallet.use-case.js';

import type {
  GetWalletOutput,
  GetWalletUseCase,
} from '../../application/use-cases/get-wallet.use-case.js';

import type {
  ListWalletLedgerOutput,
  ListWalletLedgerUseCase,
} from '../../application/use-cases/list-wallet-ledger.use-case.js';

import { WalletsController } from './wallets.controller.js';

describe('WalletsController', () => {
  const emptyGetWalletUseCase =
    {} as GetWalletUseCase;

  const emptyListWalletLedgerUseCase =
    {} as ListWalletLedgerUseCase;

  it('should create a wallet and map the HTTP contract correctly', async () => {
    let receivedInput:
      | {
          playerId: string;
          initialBalance: string;
          currency: string;
        }
      | undefined;

    const useCase = {
      execute: async (input: {
        playerId: string;
        initialBalance: string;
        currency: string;
      }): Promise<CreateWalletOutput> => {
        receivedInput = input;

        return {
          walletId:
            '0192f291-27dd-7d3f-8071-5f8685deef37',
          playerId:
            '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
          balance: '1000.00',
          currency: 'BRL',
          version: 1,
        };
      },
    } as CreateWalletUseCase;

    const controller = new WalletsController(
      useCase,
      emptyGetWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    const response = await controller.create({
      playerId:
        '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
      initialBalance: {
        amount: '1000.00',
        currency: 'BRL',
      },
    });

    expect(receivedInput).toEqual({
      playerId:
        '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
      initialBalance: '1000.00',
      currency: 'BRL',
    });

    expect(response).toEqual({
      id:
        '0192f291-27dd-7d3f-8071-5f8685deef37',
      playerId:
        '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
      balance: {
        amount: '1000.00',
        currency: 'BRL',
      },
      version: 1,
    });
  });

  it('should map a duplicate wallet to HTTP 409 Conflict', async () => {
    const useCase = {
      execute: async (): Promise<CreateWalletOutput> => {
        throw new Error(
          'Wallet already exists for player and currency',
        );
      },
    } as CreateWalletUseCase;

    const controller = new WalletsController(
      useCase,
      emptyGetWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    try {
      await controller.create({
        playerId:
          '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
        initialBalance: {
          amount: '1000.00',
          currency: 'BRL',
        },
      });

      throw new Error(
        'Expected controller.create to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        ConflictException,
      );

      expect(
        (error as ConflictException).getStatus(),
      ).toBe(409);
    }
  });

  it('should map an invalid wallet payload to HTTP 400 Bad Request', async () => {
    const useCase = {
      execute: async (): Promise<CreateWalletOutput> => {
        throw new Error(
          'Amount must have exactly two decimal places',
        );
      },
    } as CreateWalletUseCase;

    const controller = new WalletsController(
      useCase,
      emptyGetWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    try {
      await controller.create({
        playerId:
          '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
        initialBalance: {
          amount: '1000',
          currency: 'BRL',
        },
      });

      throw new Error(
        'Expected controller.create to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        BadRequestException,
      );

      expect(
        (error as BadRequestException).getStatus(),
      ).toBe(400);
    }
  });

  it('should map a negative initial balance to HTTP 400 Bad Request', async () => {
    const useCase = {
      execute: async (): Promise<CreateWalletOutput> => {
        throw new Error(
          'Initial balance cannot be negative',
        );
      },
    } as CreateWalletUseCase;

    const controller = new WalletsController(
      useCase,
      emptyGetWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    try {
      await controller.create({
        playerId:
          '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
        initialBalance: {
          amount: '-1.00',
          currency: 'BRL',
        },
      });

      throw new Error(
        'Expected controller.create to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        BadRequestException,
      );

      expect(
        (error as BadRequestException).getStatus(),
      ).toBe(400);
    }
  });

  it('should return a wallet by id and map the HTTP contract correctly', async () => {
    const createWalletUseCase =
      {} as CreateWalletUseCase;

    let receivedWalletId:
      | string
      | undefined;

    const getWalletUseCase = {
      execute: async (input: {
        walletId: string;
      }): Promise<GetWalletOutput> => {
        receivedWalletId = input.walletId;

        return {
          id:
            'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
          playerId:
            'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',
          balance: '125.00',
          currency: 'BRL',
          version: 3,
        };
      },
    } as GetWalletUseCase;

    const controller = new WalletsController(
      createWalletUseCase,
      getWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    const response = await controller.findById(
      'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
    );

    expect(receivedWalletId).toBe(
      'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
    );

    expect(response).toEqual({
      id:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      playerId:
        'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',
      balance: {
        amount: '125.00',
        currency: 'BRL',
      },
      version: 3,
    });
  });

  it('should map a missing wallet to HTTP 404 Not Found', async () => {
    const createWalletUseCase =
      {} as CreateWalletUseCase;

    const getWalletUseCase = {
      execute: async (): Promise<GetWalletOutput> => {
        throw new Error('Wallet not found');
      },
    } as GetWalletUseCase;

    const controller = new WalletsController(
      createWalletUseCase,
      getWalletUseCase,
      emptyListWalletLedgerUseCase,
    );

    try {
      await controller.findById(
        'cccccccc-1111-2222-3333-cccccccccccc',
      );

      throw new Error(
        'Expected controller.findById to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        NotFoundException,
      );

      expect(
        (error as NotFoundException).getStatus(),
      ).toBe(404);
    }
  });

  it('should return the wallet ledger with the expected HTTP contract', async () => {
    const createWalletUseCase =
      {} as CreateWalletUseCase;

    const getWalletUseCase =
      {} as GetWalletUseCase;

    let receivedInput:
      | {
          walletId: string;
          limit: number;
          cursor?: string;
        }
      | undefined;

    const listWalletLedgerUseCase = {
      execute: async (input: {
        walletId: string;
        limit: number;
        cursor?: string;
      }): Promise<ListWalletLedgerOutput> => {
        receivedInput = input;

        return {
          items: [
            {
              id:
                '11111111-1111-1111-1111-111111111111',
              transactionId:
                '22222222-2222-2222-2222-222222222222',
              direction: 'CREDIT',
              amount: '100.00',
              currency: 'BRL',
              balanceBefore: '0.00',
              balanceAfter: '100.00',
              createdAt:
                '2026-10-28T12:00:00.000Z',
            },
          ],
          nextCursor:
            'next-cursor-value',
        };
      },
    } as ListWalletLedgerUseCase;

    const controller = new WalletsController(
      createWalletUseCase,
      getWalletUseCase,
      listWalletLedgerUseCase,
    );

    const response =
      await controller.listLedger(
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
        '2',
        'current-cursor-value',
      );

    expect(receivedInput).toEqual({
      walletId:
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      limit: 2,
      cursor: 'current-cursor-value',
    });

    expect(response).toEqual({
      items: [
        {
          id:
            '11111111-1111-1111-1111-111111111111',
          transactionId:
            '22222222-2222-2222-2222-222222222222',
          direction: 'CREDIT',
          amount: '100.00',
          currency: 'BRL',
          balanceBefore: '0.00',
          balanceAfter: '100.00',
          createdAt:
            '2026-10-28T12:00:00.000Z',
        },
      ],
      nextCursor:
        'next-cursor-value',
    });
  });

    it('should use limit 50 when the ledger limit query is not provided', async () => {
      const createWalletUseCase =
        {} as CreateWalletUseCase;

      const getWalletUseCase =
        {} as GetWalletUseCase;

      let receivedLimit:
        | number
        | undefined;

      const listWalletLedgerUseCase = {
        execute: async (input: {
          walletId: string;
          limit: number;
          cursor?: string;
        }): Promise<ListWalletLedgerOutput> => {
          receivedLimit = input.limit;

          return {
            items: [],
            nextCursor: undefined,
          };
        },
      } as ListWalletLedgerUseCase;

      const controller = new WalletsController(
        createWalletUseCase,
        getWalletUseCase,
        listWalletLedgerUseCase,
      );

      await controller.listLedger(
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      );

      expect(receivedLimit).toBe(50);
    });

    it('should reject ledger limit 0 with HTTP 400 Bad Request', async () => {
      const createWalletUseCase =
        {} as CreateWalletUseCase;

      const getWalletUseCase =
        {} as GetWalletUseCase;

      const listWalletLedgerUseCase =
        {} as ListWalletLedgerUseCase;

      const controller = new WalletsController(
        createWalletUseCase,
        getWalletUseCase,
        listWalletLedgerUseCase,
      );

      try {
        await controller.listLedger(
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
          '0',
        );

        throw new Error(
          'Expected controller.listLedger to throw',
        );
      } catch (error) {
        expect(error).toBeInstanceOf(
          BadRequestException,
        );

        expect(
          (error as BadRequestException).getStatus(),
        ).toBe(400);
      }
    });

    it('should reject a non-numeric ledger limit with HTTP 400 Bad Request', async () => {
      const createWalletUseCase =
        {} as CreateWalletUseCase;

      const getWalletUseCase =
        {} as GetWalletUseCase;

      const listWalletLedgerUseCase =
        {} as ListWalletLedgerUseCase;

      const controller = new WalletsController(
        createWalletUseCase,
        getWalletUseCase,
        listWalletLedgerUseCase,
      );

      try {
        await controller.listLedger(
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
          'abc',
        );

        throw new Error(
          'Expected controller.listLedger to throw',
        );
      } catch (error) {
        expect(error).toBeInstanceOf(
          BadRequestException,
        );

        expect(
          (error as BadRequestException).getStatus(),
        ).toBe(400);
      }
    });

    it('should map an invalid ledger cursor to HTTP 400 Bad Request', async () => {
      const createWalletUseCase =
        {} as CreateWalletUseCase;

      const getWalletUseCase =
        {} as GetWalletUseCase;

      const listWalletLedgerUseCase = {
        execute: async (): Promise<ListWalletLedgerOutput> => {
          throw new Error('Invalid cursor');
        },
      } as ListWalletLedgerUseCase;

      const controller = new WalletsController(
        createWalletUseCase,
        getWalletUseCase,
        listWalletLedgerUseCase,
      );

      try {
        await controller.listLedger(
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
          '2',
          'invalid-cursor',
        );

        throw new Error(
          'Expected controller.listLedger to throw',
        );
      } catch (error) {
        expect(error).toBeInstanceOf(
          BadRequestException,
        );

        expect(
          (error as BadRequestException).getStatus(),
        ).toBe(400);
      }
    });
});