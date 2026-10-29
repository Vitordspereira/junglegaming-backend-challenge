import {
  Injectable,
} from '@nestjs/common';

import {
  LockMode,
} from '@mikro-orm/core';

import {
  EntityManager,
} from '@mikro-orm/postgresql';

import type {
  OutboxMessageRepository,
} from '../../../application/ports/outbox-message.repository.js';

import {
  OutboxMessage,
} from '../../../domain/messaging/outbox-message.js';

import {
  OutboxMessageEntity,
} from '../entities/outbox-message.entity.js';

import {
  OutboxMessageMapper,
} from '../mappers/outbox-message.mapper.js';

@Injectable()
export class MikroOrmOutboxMessageRepository
  implements OutboxMessageRepository
{
  constructor(
    private readonly entityManager:
      EntityManager,
  ) {}

  async findById(
    id: string,
  ): Promise<OutboxMessage | null> {
    const entity =
      await this.entityManager.findOne(
        OutboxMessageEntity,
        {
          id,
        },
      );

    if (!entity) {
      return null;
    }

    return OutboxMessageMapper.toDomain(
      entity,
    );
  }

  async findDueForPublishing(
    limit: number,
    now: Date,
  ): Promise<OutboxMessage[]> {
    if (
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      throw new Error(
        'Outbox publishing limit must be a positive integer',
      );
    }

    const entities =
      await this.entityManager.find(
        OutboxMessageEntity,
        {
          publishedAt:
            null,

          $or: [
            {
              nextAttemptAt:
                null,
            },

            {
              nextAttemptAt: {
                $lte:
                  now,
              },
            },
          ],
        },
        {
          orderBy: {
            occurredAt:
              'ASC',
          },

          limit,

          lockMode:
            LockMode.PESSIMISTIC_PARTIAL_WRITE,
        },
      );

    return entities.map(
      (entity) =>
        OutboxMessageMapper.toDomain(
          entity,
        ),
    );
  }

  async save(
    message: OutboxMessage,
  ): Promise<void> {
    const existingEntity =
      await this.entityManager.findOne(
        OutboxMessageEntity,
        {
          id:
            message.id,
        },
      );

    if (!existingEntity) {
      const entity =
        OutboxMessageMapper.toPersistence(
          message,
        );

      this.entityManager.persist(
        entity,
      );

      await this.entityManager.flush();

      return;
    }

    existingEntity.aggregateId =
      message.aggregateId;

    existingEntity.eventType =
      message.eventType;

    existingEntity.payload =
      message.payload;

    existingEntity.occurredAt =
      message.occurredAt;

    existingEntity.attempts =
      message.attempts;

    existingEntity.nextAttemptAt =
      message.nextAttemptAt ??
      null;

    existingEntity.publishedAt =
      message.publishedAt ??
      null;

    await this.entityManager.flush();
  }
}