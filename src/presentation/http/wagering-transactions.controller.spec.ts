import {
  describe,
  expect,
  it,
} from 'bun:test';

import { NotFoundException } from '@nestjs/common';

import type {
  GetWagerTransactionOutput,
  GetWagerTransactionUseCase,
} from '../../application/use-cases/get-wager-transaction.use-case.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import { WageringTransactionsController } from './wagering-transactions.controller.js';

describe('WageringTransactionsController', () => {
  it('should return a wagering transaction by id', async () => {
    let receivedTransactionId:
      | string
      | undefined;

    const useCase = {
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
    } as GetWagerTransactionUseCase;

    const controller =
      new WageringTransactionsController(
        useCase,
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

      kind: 'BET',

      money: {
        amount: '25.00',
        currency: 'BRL',
      },

      status: 'PROCESSED',

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

  it('should map a missing transaction to HTTP 404 Not Found', async () => {
    const useCase = {
      execute: async (): Promise<GetWagerTransactionOutput> => {
        throw new Error(
          'Wager transaction not found',
        );
      },
    } as GetWagerTransactionUseCase;

    const controller =
      new WageringTransactionsController(
        useCase,
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
});