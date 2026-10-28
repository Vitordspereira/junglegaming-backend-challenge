import { Inject, Injectable } from '@nestjs/common';

import {
  WAGER_TRANSACTION_REPOSITORY,
  type WagerTransactionRepository,
} from '../ports/wager-transaction.repository.js';

import type {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

export interface GetProviderWagerTransactionInput {
  providerId: string;
  externalTransactionId: string;
}

export interface GetProviderWagerTransactionOutput {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;

  walletId: string;
  playerId: string;

  roundId: string;
  gameId: string;

  kind: WagerTransactionKind;

  money: {
    amount: string;
    currency: string;
  };

  status: WagerTransactionStatus;

  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;

  failureCode?: FailureCode;

  resultBalance?: {
    amount: string;
    currency: string;
  };

  createdAt: string;
  processedAt?: string;
}

@Injectable()
export class GetProviderWagerTransactionUseCase {
  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTransactionRepository: WagerTransactionRepository,
  ) {}

  async execute(
    input: GetProviderWagerTransactionInput,
  ): Promise<GetProviderWagerTransactionOutput> {
    const transaction =
      await this.wagerTransactionRepository
        .findByProviderAndExternalTransactionId(
          input.providerId,
          input.externalTransactionId,
        );

    if (!transaction) {
      throw new Error(
        'Wager transaction not found',
      );
    }

    return {
      transactionId: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId:
        transaction.externalTransactionId,

      walletId: transaction.walletId,
      playerId: transaction.playerId,

      roundId: transaction.roundId,
      gameId: transaction.gameId,

      kind: transaction.kind,

      money: {
        amount: transaction.money.toString(),
        currency: transaction.money.currency,
      },

      status: transaction.status,

      ...(transaction.referenceExternalTransactionId
        ? {
            referenceExternalTransactionId:
              transaction.referenceExternalTransactionId,
          }
        : {}),

      ...(transaction.referenceTransactionId
        ? {
            referenceTransactionId:
              transaction.referenceTransactionId,
          }
        : {}),

      ...(transaction.failureCode
        ? {
            failureCode:
              transaction.failureCode,
          }
        : {}),

      ...(transaction.resultBalance
        ? {
            resultBalance: {
              amount:
                transaction.resultBalance.toString(),
              currency:
                transaction.resultBalance.currency,
            },
          }
        : {}),

      createdAt:
        transaction.createdAt.toISOString(),

      ...(transaction.processedAt
        ? {
            processedAt:
              transaction.processedAt.toISOString(),
          }
        : {}),
    };
  }
}