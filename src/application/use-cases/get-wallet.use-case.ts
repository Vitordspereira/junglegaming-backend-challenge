import { Inject, Injectable } from '@nestjs/common';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../ports/wallet.repository.js';

export interface GetWalletInput {
  walletId: string;
}

export interface GetWalletOutput {
  id: string;
  playerId: string;
  balance: string;
  currency: string;
  version: number;
}

@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(
    input: GetWalletInput,
  ): Promise<GetWalletOutput> {
    const wallet =
      await this.walletRepository.findById(
        input.walletId,
      );

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toString(),
      currency: wallet.currency,
      version: wallet.version,
    };
  }
}
