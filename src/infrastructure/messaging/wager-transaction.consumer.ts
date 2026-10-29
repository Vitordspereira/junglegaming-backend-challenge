import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  PermanentMessageProcessingError,
} from '../../application/errors/permanent-message-processing.error.js';

import {
  WAGER_TRANSACTION_QUEUE,
  type WagerTransactionQueue,
} from '../../application/ports/wager-transaction-queue.js';

import {
  ProcessWagerMessageUseCase,
} from '../../application/use-cases/process-wager-message.use-case.js';

@Injectable()
export class WagerTransactionConsumer {
  private static readonly BASE_RETRY_SECONDS =
    5;

  private static readonly MAX_RETRY_SECONDS =
    40;

  constructor(
    @Inject(WAGER_TRANSACTION_QUEUE)
    private readonly queue:
      WagerTransactionQueue,

    private readonly processWagerMessageUseCase:
      ProcessWagerMessageUseCase,
  ) {}

  private calculateRetryDelay(
    receiveCount: number,
  ): number {
    const safeReceiveCount =
      Math.max(
        1,
        receiveCount,
      );

    const exponentialDelay =
      WagerTransactionConsumer
        .BASE_RETRY_SECONDS *
      2 **
        (safeReceiveCount - 1);

    return Math.min(
      exponentialDelay,
      WagerTransactionConsumer
        .MAX_RETRY_SECONDS,
    );
  }

  async processOnce(): Promise<number> {
    const messages =
      await this.queue.receive();

    for (const message of messages) {
      try {
        await this.processWagerMessageUseCase.execute(
          message.body,
        );

        await this.queue.acknowledge(
          message.receiptHandle,
        );
      } catch (error) {
        if (
          error instanceof
          PermanentMessageProcessingError
        ) {
          await this.queue.sendToDeadLetter(
            message.body,
          );

          await this.queue.acknowledge(
            message.receiptHandle,
          );

          continue;
        }
        const retryDelay =
          this.calculateRetryDelay(
            message.receiveCount,
          );

        await this.queue.changeVisibility(
          message.receiptHandle,
          retryDelay,
        );
      }
    }

    return messages.length;
  }
}