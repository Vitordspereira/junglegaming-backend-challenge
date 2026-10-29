import {
  Injectable,
} from '@nestjs/common';

import {
  EntityManager,
} from '@mikro-orm/postgresql';

import type {
  InboxMessageRepository,
} from '../../../application/ports/inbox-message.repository.js';

import {
  InboxMessage,
} from '../../../domain/messaging/inbox-message.js';

import {
  InboxMessageEntity,
} from '../entities/inbox-message.entity.js';

import {
  InboxMessageMapper,
} from '../mappers/inbox-message.mapper.js';

@Injectable()
export class MikroOrmInboxMessageRepository
  implements InboxMessageRepository
{
  constructor(
    private readonly entityManager:
      EntityManager,
  ) {}

  async findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity =
      await this.entityManager.findOne(
        InboxMessageEntity,
        {
          consumerName,
          messageId,
        },
      );

    if (!entity) {
      return null;
    }

    return InboxMessageMapper.toDomain(
      entity,
    );
  }

  async save(
    inboxMessage: InboxMessage,
  ): Promise<void> {
    const existingEntity =
      await this.entityManager.findOne(
        InboxMessageEntity,
        {
          id:
            inboxMessage.id,
        },
      );

    if (!existingEntity) {
      const newEntity =
        InboxMessageMapper.toPersistence(
          inboxMessage,
        );

      this.entityManager.persist(
        newEntity,
      );

      await this.entityManager.flush();

      return;
    }

    existingEntity.consumerName =
      inboxMessage.consumerName;

    existingEntity.messageId =
      inboxMessage.messageId;

    existingEntity.receivedAt =
      inboxMessage.receivedAt;

    existingEntity.processedAt =
      inboxMessage.processedAt;

    await this.entityManager.flush();
  }
}