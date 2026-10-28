import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { IdempotencyConflictError } from '../../application/errors/idempotency-conflict.error.js';

import type {
  GetWagerTransactionOutput,
  GetWagerTransactionUseCase,
} from '../../application/use-cases/get-wager-transaction.use-case.js';

import type { ProcessWagerUseCase } from '../../application/use-cases/process-wager.use-case.js';

import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import { WageringTransactionsController } from './wagering-transactions.controller.js';

describe('WageringTransactionsController', () => {
  it('should return a wagering transaction by id', async () => {
    let receivedTransactionId:
      | string
      | undefined;

    const getWagerTransactionUseCase = {
      execute: async (input: {
        transactionId: string;
      }): Promise<GetWagerTransactionOutput> => {
        receivedTransactionId =
          input.transactionId;

        return {
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

          kind:
            WagerTransactionKind.Bet,

          money: {
            amount:
              '25.00',
            currency:
              'BRL',
          },

          status:
            WagerTransactionStatus.Processed,

          resultBalance: {
            amount:
              '975.00',
            currency:
              'BRL',
          },

          createdAt:
            '2026-10-28T12:00:00.000Z',

          processedAt:
            '2026-10-28T12:00:01.000Z',
        };
      },
    } as GetWagerTransactionUseCase;

    const processWagerUseCase = {
      execute: async () => {
        throw new Error(
          'Process wager should not be called',
        );
      },
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    const response =
      await controller.findById(
        'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      );

    expect(
      receivedTransactionId,
    ).toBe(
      'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
    );

    expect(response).toEqual({
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

      kind:
        'BET',

      money: {
        amount:
          '25.00',
        currency:
          'BRL',
      },

      status:
        'PROCESSED',

      resultBalance: {
        amount:
          '975.00',
        currency:
          'BRL',
      },

      createdAt:
        '2026-10-28T12:00:00.000Z',

      processedAt:
        '2026-10-28T12:00:01.000Z',
    });
  });

  it('should map a missing transaction to HTTP 404 Not Found', async () => {
    const getWagerTransactionUseCase = {
      execute:
        async (): Promise<GetWagerTransactionOutput> => {
          throw new Error(
            'Wager transaction not found',
          );
        },
    } as GetWagerTransactionUseCase;

    const processWagerUseCase = {
      execute: async () => {
        throw new Error(
          'Process wager should not be called',
        );
      },
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    try {
      await controller.findById(
        'dddddddd-1111-2222-3333-dddddddddddd',
      );

      throw new Error(
        'Expected controller.findById to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        NotFoundException,
      );

      expect(
        (
          error as NotFoundException
        ).getStatus(),
      ).toBe(404);
    }
  });

  it('should reject POST when Idempotency-Key header is missing', async () => {
    const getWagerTransactionUseCase = {
      execute: async () => {
        throw new Error(
          'GET use case should not be called',
        );
      },
    } as unknown as GetWagerTransactionUseCase;

    const processWagerUseCase = {
      execute: async () => {
        throw new Error(
          'Process wager should not be called',
        );
      },
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    try {
      await controller.create(
        undefined,
        {
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
            WagerTransactionKind.Bet,

          money: {
            amount:
              '25.00',

            currency:
              'BRL',
          },
        },
      );

      throw new Error(
        'Expected controller.create to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        BadRequestException,
      );

      expect(
        (
          error as BadRequestException
        ).getStatus(),
      ).toBe(400);
    }
  });

  it('should process a BET through the ProcessWagerUseCase', async () => {
    let receivedInput:
      | Record<string, unknown>
      | undefined;

    const getWagerTransactionUseCase = {
      execute: async () => {
        throw new Error(
          'GET use case should not be called',
        );
      },
    } as unknown as GetWagerTransactionUseCase;

    const processWagerUseCase = {
      execute: async (
        input: Record<string, unknown>,
      ) => {
        receivedInput = input;

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
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    const response =
      await controller.create(
        'provider-a:transaction-123',
        {
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
            WagerTransactionKind.Bet,

          money: {
            amount:
              '25.00',

            currency:
              'BRL',
          },
        },
      );

    expect(
      receivedInput,
    ).toBeDefined();

    expect(
      receivedInput?.providerId,
    ).toBe(
      'provider-a',
    );

    expect(
      receivedInput?.externalTransactionId,
    ).toBe(
      'transaction-123',
    );

    expect(
      receivedInput?.idempotencyKey,
    ).toBe(
      'provider-a:transaction-123',
    );

    expect(
      receivedInput?.amount,
    ).toBe(
      '25.00',
    );

    expect(
      receivedInput?.currency,
    ).toBe(
      'BRL',
    );

    expect(
      receivedInput?.kind,
    ).toBe(
      WagerTransactionKind.Bet,
    );

    expect(
      typeof receivedInput?.payloadHash,
    ).toBe(
      'string',
    );

    expect(
      typeof receivedInput?.id,
    ).toBe(
      'string',
    );

    expect(response).toEqual({
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

  it('should return idempotentReplay true when the wager was already processed', async () => {
    const getWagerTransactionUseCase = {
      execute: async () => {
        throw new Error(
          'GET use case should not be called',
        );
      },
    } as unknown as GetWagerTransactionUseCase;

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
            true,
        };
      },
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    const response =
      await controller.create(
        'provider-a:transaction-123',
        {
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
            WagerTransactionKind.Bet,

          money: {
            amount:
              '25.00',

            currency:
              'BRL',
          },
        },
      );

    expect(response).toEqual({
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
        true,
    });
  });

  it('should map an idempotency conflict to HTTP 409 Conflict', async () => {
    const getWagerTransactionUseCase = {
      execute: async () => {
        throw new Error(
          'GET use case should not be called',
        );
      },
    } as unknown as GetWagerTransactionUseCase;

    const processWagerUseCase = {
      execute: async () => {
        throw new IdempotencyConflictError();
      },
    } as unknown as ProcessWagerUseCase;

    const controller =
      new WageringTransactionsController(
        getWagerTransactionUseCase,
        processWagerUseCase,
      );

    try {
      await controller.create(
        'provider-a:transaction-123',
        {
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
            WagerTransactionKind.Bet,

          money: {
            amount:
              '30.00',

            currency:
              'BRL',
          },
        },
      );

      throw new Error(
        'Expected controller.create to throw',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        ConflictException,
      );

      expect(
        (
          error as ConflictException
        ).getStatus(),
      ).toBe(409);
    }
  });

    it('should return PENDING_REFERENCE when the referenced transaction does not exist yet', async () => {
      const getWagerTransactionUseCase = {
        execute: async () => {
          throw new Error(
            'GET use case should not be called',
          );
        },
      } as unknown as GetWagerTransactionUseCase;

      const processWagerUseCase = {
        execute: async () => {
          return {
            transactionId:
              'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

            status:
              WagerTransactionStatus.PendingReference,

            idempotentReplay:
              false,
          };
        },
      } as unknown as ProcessWagerUseCase;

      const controller =
        new WageringTransactionsController(
          getWagerTransactionUseCase,
          processWagerUseCase,
        );

      const response =
        await controller.create(
          'provider-a:refund-123',
          {
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
              WagerTransactionKind.Refund,

            money: {
              amount:
                '25.00',

              currency:
                'BRL',
            },

            referenceExternalTransactionId:
              'bet-that-has-not-arrived-yet',
          },
        );

      expect(response).toEqual({
        transactionId:
          'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

        status:
          'PENDING_REFERENCE',

        idempotentReplay:
          false,
      });
    });

    it('should set HTTP 202 Accepted for PENDING_REFERENCE', async () => {
      let receivedStatus:
        | number
        | undefined;

      const getWagerTransactionUseCase = {
        execute: async () => {
          throw new Error(
            'GET use case should not be called',
          );
        },
      } as unknown as GetWagerTransactionUseCase;

      const processWagerUseCase = {
        execute: async () => {
          return {
            transactionId:
              'eeeeeeee-1111-2222-3333-eeeeeeeeeeee',

            status:
              WagerTransactionStatus.PendingReference,

            idempotentReplay:
              false,
          };
        },
      } as unknown as ProcessWagerUseCase;

      const response = {
        status: (statusCode: number) => {
          receivedStatus =
            statusCode;

          return response;
        },
      };

      const controller =
        new WageringTransactionsController(
          getWagerTransactionUseCase,
          processWagerUseCase,
        );

      await controller.create(
        'provider-a:refund-123',
        {
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
            WagerTransactionKind.Refund,

          money: {
            amount:
              '25.00',

            currency:
              'BRL',
          },

          referenceExternalTransactionId:
            'bet-that-has-not-arrived-yet',
        },
        response as never,
      );

      expect(receivedStatus).toBe(202);
    });

    it('should set HTTP 422 for a wager rejected by a business rule', async () => {
      let receivedStatus:
        | number
        | undefined;

      const getWagerTransactionUseCase = {
        execute: async () => {
          throw new Error(
            'GET use case should not be called',
          );
        },
      } as unknown as GetWagerTransactionUseCase;

      const processWagerUseCase = {
        execute: async () => {
          return {
            transactionId:
              'ffffffff-1111-2222-3333-ffffffffffff',

            status:
              WagerTransactionStatus.Rejected,

            failureCode:
              FailureCode.InsufficientFunds,

            idempotentReplay:
              false,
          };
        },
      } as unknown as ProcessWagerUseCase;

      const response = {
        status: (statusCode: number) => {
          receivedStatus =
            statusCode;

          return response;
        },
      };

      const controller =
        new WageringTransactionsController(
          getWagerTransactionUseCase,
          processWagerUseCase,
        );

      const result =
        await controller.create(
          'provider-a:transaction-insufficient',
          {
            providerId:
              'provider-a',

            externalTransactionId:
              'transaction-insufficient',

            playerId:
              'player-1',

            walletId:
              'wallet-1',

            roundId:
              'round-987',

            gameId:
              'fortune-chimp',

            kind:
              WagerTransactionKind.Bet,

            money: {
              amount:
                '1000.00',

              currency:
                'BRL',
            },
          },
          response as never,
        );

      expect(
        receivedStatus,
      ).toBe(422);

      expect(result).toEqual({
        transactionId:
          'ffffffff-1111-2222-3333-ffffffffffff',

        status:
          'REJECTED',

        idempotentReplay:
          false,

        failureCode:
          FailureCode.InsufficientFunds,
      });
    });
});