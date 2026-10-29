import type {
  WagerTransactionRequestedMessage,
} from '../messaging/wager-transaction-requested.message.js';

export const WAGER_TRANSACTION_QUEUE =
  Symbol('WAGER_TRANSACTION_QUEUE');

export interface ReceivedQueueMessage {
  receiptHandle: string;

  body:
    WagerTransactionRequestedMessage;
}

export interface WagerTransactionQueue {
  send(
    message:
      WagerTransactionRequestedMessage,
  ): Promise<void>;

  receive(): Promise<
    ReceivedQueueMessage[]
  >;

  acknowledge(
    receiptHandle: string,
  ): Promise<void>;

  changeVisibility(
    receiptHandle: string,
    visibilityTimeoutSeconds: number,
  ): Promise<void>;

  isReachable(): Promise<boolean>;
}