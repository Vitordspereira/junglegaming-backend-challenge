import { WagerTransactionKind } from '../../domain/wagering/wager-transaction.js';

export interface WagerTransactionRequestedData {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;

  money: {
    amount: string;
    currency: string;
  };

  referenceExternalTransactionId?: string;
}

export interface WagerTransactionRequestedMessage {
  messageId: string;

  type:
    'WagerTransactionRequested';

  occurredAt: string;

  data:
    WagerTransactionRequestedData;
}