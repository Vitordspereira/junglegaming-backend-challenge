import {
  InboxMessage,
} from '../../../domain/messaging/inbox-message.js';

import {
  InboxMessageEntity,
} from '../entities/inbox-message.entity.js';

export class InboxMessageMapper {
  static toDomain(
    entity:
      InboxMessageEntity,
  ): InboxMessage {
    return InboxMessage.rehydrate({
      id:
        entity.id,

      consumerName:
        entity.consumerName,

      messageId:
        entity.messageId,

      receivedAt:
        entity.receivedAt,

      processedAt:
        entity.processedAt,
    });
  }

  static toPersistence(
    inboxMessage:
      InboxMessage,
  ): InboxMessageEntity {
    const entity =
      new InboxMessageEntity();

    entity.id =
      inboxMessage.id;

    entity.consumerName =
      inboxMessage.consumerName;

    entity.messageId =
      inboxMessage.messageId;

    entity.receivedAt =
      inboxMessage.receivedAt;

    entity.processedAt =
      inboxMessage.processedAt;

    return entity;
  }
}