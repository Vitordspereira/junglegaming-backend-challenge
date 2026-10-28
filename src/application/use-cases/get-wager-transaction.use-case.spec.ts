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

import { GetWagerTransactionUseCase } from './get-wager-transaction.use-case.js';

describe('GetWagerTransactionUseCase', () => {
  it('should return a wagering transaction by id', async () => {
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
      findById: async (
        id: string,
      ) => {
        expect(id).toBe(
          transaction.id,
        );

        return transaction;
      },
    } as unknown as WagerTransactionRepository;

    const useCase =
      new GetWagerTransactionUseCase(
        wagerTransactionRepository,
      );

    const result =
      await useCase.execute({
        transactionId:
          transaction.id,
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

    it('should reject when the wagering transaction does not exist', async () => {
      const wagerTransactionRepository = {
        findById: async () => null,
      } as unknown as WagerTransactionRepository;

      const useCase =
        new GetWagerTransactionUseCase(
          wagerTransactionRepository,
        );

      expect(
        useCase.execute({
          transactionId:
            'dddddddd-1111-2222-3333-dddddddddddd',
        }),
      ).rejects.toThrow(
        'Wager transaction not found',
      );
    });
});