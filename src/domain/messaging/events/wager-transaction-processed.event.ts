import type {
  IntegrationEventProps,
} from '../integration-event.js';

import {
  IntegrationEvent,
} from '../integration-event.js';

import type {
  WagerTransactionKind,
} from '../../wagering/wager-transaction.js';

export interface WagerTransactionProcessedData
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

  money: {
    amount: string;
    currency: string;
  };

  balance: {
    amount: string;
    currency: string;
  };
}

export class WagerTransactionProcessedEvent
  extends IntegrationEvent<WagerTransactionProcessedData>
{
  readonly eventType =
    'WagerTransactionProcessed';

  readonly version =
    1;

  constructor(
    props:
      IntegrationEventProps<WagerTransactionProcessedData>,
  ) {
    super(props);
  }
}