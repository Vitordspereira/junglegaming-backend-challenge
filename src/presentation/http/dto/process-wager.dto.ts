import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.js';

export class WagerMoneyRequestDto {
  amount!: string;
  currency!: string;
}

export class ProcessWagerRequestDto {
  providerId!: string;
  externalTransactionId!: string;

  playerId!: string;
  walletId!: string;

  roundId!: string;
  gameId!: string;

  kind!: WagerTransactionKind;

  money!: WagerMoneyRequestDto;

  referenceExternalTransactionId?: string;
}

export class WagerBalanceResponseDto {
  amount!: string;
  currency!: string;
}

export class ProcessWagerResponseDto {
  transactionId!: string;

  status!: WagerTransactionStatus;

  balance?: WagerBalanceResponseDto;

  idempotentReplay!: boolean;
}