import type {
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

export const OUTBOX_MESSAGE_REPOSITORY =
  Symbol('OUTBOX_MESSAGE_REPOSITORY');

export interface OutboxMessageRepository {
  save(
    message: OutboxMessage,
  ): Promise<void>;

  findById(
    id: string,
  ): Promise<OutboxMessage | null>;

  findDueForPublishing(
    limit: number,
    now: Date,
  ): Promise<OutboxMessage[]>;
}