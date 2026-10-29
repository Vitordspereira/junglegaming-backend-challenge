import type {
  InboxMessage,
} from '../../domain/messaging/inbox-message.js';

export const INBOX_MESSAGE_REPOSITORY =
  Symbol('INBOX_MESSAGE_REPOSITORY');

export interface InboxMessageRepository {
  findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;

  save(
    inboxMessage: InboxMessage,
  ): Promise<void>;
}