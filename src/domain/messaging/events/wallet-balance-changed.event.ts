import type {
  IntegrationEventProps,
} from '../integration-event.js';

import {
  IntegrationEvent,
} from '../integration-event.js';

import type {
  LedgerDirection,
} from '../../wallet/wallet-ledger-entry.js';

export interface WalletBalanceChangedData
  extends Record<string, unknown>
{
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;

  money: {
    amount: string;
    currency: string;
  };

  balanceBefore: {
    amount: string;
    currency: string;
  };

  balanceAfter: {
    amount: string;
    currency: string;
  };

  walletVersion: number;
}

export class WalletBalanceChangedEvent
  extends IntegrationEvent<WalletBalanceChangedData>
{
  readonly eventType =
    'WalletBalanceChanged';

  readonly version =
    1;

  constructor(
    props:
      IntegrationEventProps<WalletBalanceChangedData>,
  ) {
    super(props);
  }
}