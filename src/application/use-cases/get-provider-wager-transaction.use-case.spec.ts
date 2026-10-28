import {
  describe,
  expect,
  it,
} from 'bun:test';

import { Money } from '../../domain/shared/value-objects/money.js';

import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import type { WagerTransactionRepository } from '../ports/wager-transaction.repository.js';

import { GetProviderWagerTransactionUseCase } from './get-provider-wager-transaction.use-case.js';

describe('GetProviderWagerTransactionUseCase', () => {
  it('should return a wagering transaction by provider and external transaction id', async () => {
    const transaction =
      WagerTransaction.rehydrate({
        id:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        providerId:
          'provider-a',

        externalTransactionId:
          'transaction-123',

        idempotencyKey:
          'provider-a:transaction-123',

        payloadHash:
          'payload-hash',

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

        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),

        createdAt: new Date(
          '2026-10-28T12:00:00.000Z',
        ),

        status:
          WagerTransactionStatus.Processed,

        processedAt: new Date(
          '2026-10-28T12:00:01.000Z',
        ),

        resultBalance: Money.from({
          amount: '975.00',
          currency: 'BRL',
        }),
      });

    const wagerTransactionRepository = {
      findByProviderAndExternalTransactionId:
        async (
          providerId: string,
          externalTransactionId: string,
        ) => {
          expect(providerId).toBe(
            'provider-a',
          );

          expect(
            externalTransactionId,
          ).toBe(
            'transaction-123',
          );

          return transaction;
        },
    } as unknown as WagerTransactionRepository;

    const useCase =
      new GetProviderWagerTransactionUseCase(
        wagerTransactionRepository,
      );

    const result =
      await useCase.execute({
        providerId:
          'provider-a',
        externalTransactionId:
          'transaction-123',
      });

    expect(result).toEqual({
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

    it('should reject when the provider wagering transaction does not exist', async () => {
      const wagerTransactionRepository = {
        findByProviderAndExternalTransactionId:
          async () => null,
      } as unknown as WagerTransactionRepository;

      const useCase =
        new GetProviderWagerTransactionUseCase(
          wagerTransactionRepository,
        );

      expect(
        useCase.execute({
          providerId:
            'provider-a',
          externalTransactionId:
            'transaction-404',
        }),
      ).rejects.toThrow(
        'Wager transaction not found',
      );
    });
});