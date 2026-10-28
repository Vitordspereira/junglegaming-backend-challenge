import {
  describe,
  expect,
  it,
} from 'bun:test';

import { NotFoundException } from '@nestjs/common';

import type {
  GetProviderWagerTransactionOutput,
  GetProviderWagerTransactionUseCase,
} from '../../application/use-cases/get-provider-wager-transaction.use-case.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import { ProviderWageringTransactionsController } from './provider-wagering-transactions.controller.js';

describe('ProviderWageringTransactionsController', () => {
  it('should return a wagering transaction by provider and external transaction id', async () => {
    let receivedInput:
      | {
          providerId: string;
          externalTransactionId: string;
        }
      | undefined;

    const useCase = {
      execute: async (input: {
        providerId: string;
        externalTransactionId: string;
      }): Promise<GetProviderWagerTransactionOutput> => {
        receivedInput = input;

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
    } as GetProviderWagerTransactionUseCase;

    const controller =
      new ProviderWageringTransactionsController(
        useCase,
      );

    const response =
      await controller.findByProviderAndExternalTransactionId(
        'provider-a',
        'transaction-123',
      );

    expect(receivedInput).toEqual({
      providerId: 'provider-a',
      externalTransactionId:
        'transaction-123',
    });

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

  it('should map a missing provider transaction to HTTP 404 Not Found', async () => {
    const useCase = {
      execute:
        async (): Promise<GetProviderWagerTransactionOutput> => {
          throw new Error(
            'Wager transaction not found',
          );
        },
    } as GetProviderWagerTransactionUseCase;

    const controller =
      new ProviderWageringTransactionsController(
        useCase,
      );

    try {
      await controller.findByProviderAndExternalTransactionId(
        'provider-a',
        'transaction-404',
      );

      throw new Error(
        'Expected controller to throw',
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