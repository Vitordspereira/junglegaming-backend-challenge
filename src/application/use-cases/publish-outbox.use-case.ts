import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  INTEGRATION_EVENT_PUBLISHER,
  type IntegrationEventPublisher,
} from '../ports/integration-event-publisher.js';

import {
  OUTBOX_MESSAGE_REPOSITORY,
  type OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction-manager.js';

export interface PublishOutboxOutput {
  selected: number;
  published: number;
  failed: number;
}

@Injectable()
export class PublishOutboxUseCase {
  private static readonly BATCH_SIZE =
    10;

  constructor(
    @Inject(
      OUTBOX_MESSAGE_REPOSITORY,
    )
    private readonly outboxRepository:
      OutboxMessageRepository,

    @Inject(
      INTEGRATION_EVENT_PUBLISHER,
    )
    private readonly eventPublisher:
      IntegrationEventPublisher,

    @Inject(
      TRANSACTION_MANAGER,
    )
    private readonly transactionManager:
      TransactionManager,
  ) {}

  async execute(
    now: Date = new Date(),
  ): Promise<PublishOutboxOutput> {
    return this.transactionManager.execute(
      async () => {
        const messages =
          await this.outboxRepository
            .findDueForPublishing(
              PublishOutboxUseCase
                .BATCH_SIZE,
              now,
            );

        let published =
          0;

        let failed =
          0;

        for (
          const message
          of messages
        ) {
          try {
            await this.eventPublisher.publish(
              message.payload,
            );

            const completed =
              message.markPublished(
                new Date(),
              );

            await this.outboxRepository.save(
              completed,
            );

            published +=
              1;
          } catch {
            const scheduled =
              message.scheduleRetry(
                now,
              );

            await this.outboxRepository.save(
              scheduled,
            );

            failed +=
              1;
          }
        }

        return {
          selected:
            messages.length,

          published,

          failed,
        };
      },
    );
  }
}