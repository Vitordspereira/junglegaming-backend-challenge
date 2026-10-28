import { describe, expect, it } from 'bun:test';

import { Money } from '../../domain/shared/value-objects/money.js';
import { Wallet } from '../../domain/wallet/wallet.js';

import type { WalletRepository } from '../ports/wallet.repository.js';
import { GetWalletUseCase } from './get-wallet.use-case.js';

describe('GetWalletUseCase', () => {
  it('should return an existing wallet', async () => {
    const wallet = Wallet.rehydrate({
      id: 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',
      playerId: 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb',
      currency: 'BRL',
      balance: Money.from({
        amount: '125.00',
        currency: 'BRL',
      }),
      version: 3,
      createdAt: new Date(
        '2026-10-28T12:00:00.000Z',
      ),
      updatedAt: new Date(
        '2026-10-28T12:30:00.000Z',
      ),
    });

    const walletRepository = {
      findById: async (id: string) => {
        if (id === wallet.id) {
          return wallet;
        }

        return null;
      },
    } as WalletRepository;

    const useCase = new GetWalletUseCase(
      walletRepository,
    );

    const result = await useCase.execute({
      walletId: wallet.id,
    });

    expect(result).toEqual({
      id: wallet.id,
      playerId: wallet.playerId,
      balance: '125.00',
      currency: 'BRL',
      version: 3,
    });
  });

  it('should reject when the wallet does not exist', async () => {
    const walletRepository = {
      findById: async () => null,
    } as WalletRepository;

    const useCase = new GetWalletUseCase(
      walletRepository,
    );

    await expect(
      useCase.execute({
        walletId:
          'cccccccc-1111-2222-3333-cccccccccccc',
      }),
    ).rejects.toThrow('Wallet not found');
  });
});