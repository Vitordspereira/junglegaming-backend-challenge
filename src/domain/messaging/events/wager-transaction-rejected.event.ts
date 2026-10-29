import type {
  IntegrationEventProps,
} from '../integration-event.js';

import {
  IntegrationEvent,
} from '../integration-event.js';

import type {
  FailureCode,
  WagerTransactionKind,
} from '../../wagering/wager-transaction.js';

export interface WagerTransactionRejectedData
  extends Record<string, unknown>
{
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  failureCode: FailureCode;

  money: {
    amount: string;
    currency: string;
  };

  balance: {
    amount: string;
    currency: string;
  };
}

export class WagerTransactionRejectedEvent
  extends IntegrationEvent<WagerTransactionRejectedData>
{
  readonly eventType =
    'WagerTransactionRejected';

  readonly version =
    1;

  constructor(
    props:
      IntegrationEventProps<WagerTransactionRejectedData>,
  ) {
    super(props);
  }
}