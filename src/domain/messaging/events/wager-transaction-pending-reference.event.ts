import type {
  IntegrationEventProps,
} from '../integration-event.js';

import {
  IntegrationEvent,
} from '../integration-event.js';

import type {
  WagerTransactionKind,
} from '../../wagering/wager-transaction.js';

export interface WagerTransactionPendingReferenceData
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

  referenceExternalTransactionId:
    string;

  money: {
    amount: string;
    currency: string;
  };
}

export class WagerTransactionPendingReferenceEvent
  extends IntegrationEvent<WagerTransactionPendingReferenceData>
{
  readonly eventType =
    'WagerTransactionPendingReference';

  readonly version =
    1;

  constructor(
    props:
      IntegrationEventProps<WagerTransactionPendingReferenceData>,
  ) {
    super(props);
  }
}