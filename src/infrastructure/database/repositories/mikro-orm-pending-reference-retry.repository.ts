import {
  Injectable,
} from '@nestjs/common';

import {
  EntityManager,
} from '@mikro-orm/postgresql';

import {
  LockMode,
} from '@mikro-orm/core';

import type {
  PendingReferenceRetryRepository,
} from '../../../application/ports/pending-reference-retry.repository.js';

import {
  PendingReferenceRetry,
} from '../../../domain/wagering/pending-reference-retry.js';

import {
  PendingReferenceRetryEntity,
} from '../entities/pending-reference-retry.entity.js';

@Injectable()
export class MikroOrmPendingReferenceRetryRepository
  implements
    PendingReferenceRetryRepository
{
  constructor(
    private readonly entityManager:
      EntityManager,
  ) {}

  async ensureForPendingReferences(): Promise<void> {
    /*
     * Recuperação automática:
     *
     * qualquer wager que esteja em
     * PENDING_REFERENCE e não tenha uma
     * linha de retry recebe uma.
     *
     * Isso cobre inclusive:
     *
     * 1. processo morreu;
     * 2. aplicação reiniciou;
     * 3. retry ainda não existia;
     * 4. outra instância assume.
     *
     * ON CONFLICT DO NOTHING torna esta
     * operação segura com várias instâncias.
     */
    await this.entityManager
      .getConnection()
      .execute(`
        INSERT INTO pending_reference_retries (
          transaction_id,
          attempts,
          next_attempt_at,
          created_at
        )
        SELECT
          wt.id,
          0,
          wt.created_at + INTERVAL '5 seconds',
          wt.created_at
        FROM wager_transactions wt
        WHERE wt.status = 'PENDING_REFERENCE'
        ON CONFLICT (transaction_id)
        DO NOTHING
      `);
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<PendingReferenceRetry | null> {
    const entity =
      await this.entityManager.findOne(
        PendingReferenceRetryEntity,
        {
          transactionId,
        },
      );

    if (!entity) {
      return null;
    }

    return this.toDomain(
      entity,
    );
  }

  async findDueForProcessing(
    now: Date,
    limit: number,
  ): Promise<
    PendingReferenceRetry[]
  > {
    if (
      !this.entityManager
        .getConnection()
        .isConnected()
    ) {
      throw new Error(
        'Database connection is not available',
      );
    }

    const entities =
      await this.entityManager.find(
        PendingReferenceRetryEntity,
        {
          nextAttemptAt: {
            $lte: now,
          },
        },
        {
          orderBy: {
            nextAttemptAt:
              'ASC',

            transactionId:
              'ASC',
          },

          limit,

          /*
           * PostgreSQL:
           *
           * FOR UPDATE SKIP LOCKED
           *
           * Várias instâncias podem executar
           * o worker simultaneamente sem
           * selecionar o mesmo retry.
           */
          lockMode:
            LockMode
              .PESSIMISTIC_PARTIAL_WRITE,
        },
      );

    return entities.map(
      (entity) =>
        this.toDomain(
          entity,
        ),
    );
  }

  async save(
    retry: PendingReferenceRetry,
  ): Promise<void> {
    const existing =
      await this.entityManager.findOne(
        PendingReferenceRetryEntity,
        {
          transactionId:
            retry.transactionId,
        },
      );

    if (!existing) {
      const entity =
        new PendingReferenceRetryEntity();

      entity.transactionId =
        retry.transactionId;

      entity.attempts =
        retry.attempts;

      entity.nextAttemptAt =
        retry.nextAttemptAt;

      entity.createdAt =
        retry.createdAt;

      this.entityManager.persist(
        entity,
      );

      await this.entityManager.flush();

      return;
    }

    existing.attempts =
      retry.attempts;

    existing.nextAttemptAt =
      retry.nextAttemptAt;

    /*
     * createdAt permanece imutável.
     */

    await this.entityManager.flush();
  }

  async delete(
    transactionId: string,
  ): Promise<void> {
    await this.entityManager
      .nativeDelete(
        PendingReferenceRetryEntity,
        {
          transactionId,
        },
      );
  }

  private toDomain(
    entity:
      PendingReferenceRetryEntity,
  ): PendingReferenceRetry {
    return PendingReferenceRetry
      .rehydrate({
        transactionId:
          entity.transactionId,

        attempts:
          entity.attempts,

        nextAttemptAt:
          entity.nextAttemptAt,

        createdAt:
          entity.createdAt,
      });
  }
}