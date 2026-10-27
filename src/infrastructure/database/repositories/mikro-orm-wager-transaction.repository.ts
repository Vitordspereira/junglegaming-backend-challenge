import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import type { WagerTransactionRepository } from '../../../application/ports/wager-transaction.repository.js';
import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper.js';

@Injectable()
export class MikroOrmWagerTransactionRepository
  implements WagerTransactionRepository
{
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionEntity,
      { id },
    );

    if (!entity) {
      return null;
    }

    return WagerTransactionMapper.toDomain(entity);
  }

  async findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        providerId,
        externalTransactionId,
      },
    );

    if (!entity) {
      return null;
    }

    return WagerTransactionMapper.toDomain(entity);
  }

  async findByProviderAndIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        providerId,
        idempotencyKey,
      },
    );

    if (!entity) {
      return null;
    }

    return WagerTransactionMapper.toDomain(entity);
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const existingEntity = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        id: transaction.id,
      },
    );

    if (!existingEntity) {
      const newEntity =
        WagerTransactionMapper.toPersistence(transaction);

      this.entityManager.persist(newEntity);
      await this.entityManager.flush();

      return;
    }

    existingEntity.status = transaction.status;
    existingEntity.referenceTransactionId =
      transaction.referenceTransactionId;
    existingEntity.failureCode = transaction.failureCode;
    existingEntity.processedAt = transaction.processedAt;

    await this.entityManager.flush();
  }
}