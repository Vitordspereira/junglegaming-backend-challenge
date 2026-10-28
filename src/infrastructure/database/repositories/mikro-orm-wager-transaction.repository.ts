import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.js';
import type { WagerTransactionRepository } from '../../../application/ports/wager-transaction.repository.js';

import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper.js';

@Injectable()
export class MikroOrmWagerTransactionRepository
  implements WagerTransactionRepository
{
  constructor(
    private readonly entityManager: EntityManager,
  ) {}

  async findById(
    id: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionEntity,
      { id },
    );

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
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

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
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

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
  }

  async findProcessedByReferenceTransactionIdAndKind(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        referenceTransactionId,
        kind,
        status: WagerTransactionStatus.Processed,
      },
    );

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
  }

  async save(
    transaction: WagerTransaction,
  ): Promise<void> {
    const existing =
      await this.entityManager.findOne(
        WagerTransactionEntity,
        {
          id: transaction.id,
        },
      );

    const mapped =
      WagerTransactionMapper.toPersistence(
        transaction,
      );

    if (!existing) {
      this.entityManager.persist(mapped);
      await this.entityManager.flush();
      return;
    }

    existing.status = mapped.status;
    existing.referenceTransactionId =
      mapped.referenceTransactionId;
    existing.failureCode = mapped.failureCode;
    existing.processedAt = mapped.processedAt;
    existing.resultBalance = mapped.resultBalance;

    await this.entityManager.flush();
  }
}
