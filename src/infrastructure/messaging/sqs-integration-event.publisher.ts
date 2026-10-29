import {
  Injectable,
} from '@nestjs/common';

import {
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import type {
  IntegrationEventPublisher,
} from '../../application/ports/integration-event-publisher.js';

@Injectable()
export class SqsIntegrationEventPublisher
  implements IntegrationEventPublisher
{
  private readonly client:
    SQSClient;

  private readonly queueUrl:
    string;

  constructor() {
    const endpoint =
      process.env.SQS_ENDPOINT ??
      'http://localhost:4566';

    const region =
      process.env.AWS_REGION ??
      'us-east-1';

    this.queueUrl =
      process.env
        .INTEGRATION_EVENTS_QUEUE_URL ??
      'http://localhost:4566/000000000000/integration-events.fifo';

    this.client =
      new SQSClient({
        region,

        endpoint,

        credentials: {
          accessKeyId:
            process.env
              .AWS_ACCESS_KEY_ID ??
            'test',

          secretAccessKey:
            process.env
              .AWS_SECRET_ACCESS_KEY ??
            'test',
        },
      });
  }

  async publish(
    event:
      Record<string, unknown>,
  ): Promise<void> {
    const eventId =
      event.eventId;

    const aggregateId =
      event.aggregateId;

    if (
      typeof eventId !==
        'string' ||
      eventId.trim().length ===
        0
    ) {
      throw new Error(
        'Integration event id is required',
      );
    }

    if (
      typeof aggregateId !==
        'string' ||
      aggregateId.trim().length ===
        0
    ) {
      throw new Error(
        'Integration event aggregate id is required',
      );
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl:
          this.queueUrl,

        MessageBody:
          JSON.stringify(
            event,
          ),

        /*
         * Eventos do mesmo aggregate
         * preservam ordenação na FIFO.
         */
        MessageGroupId:
          aggregateId,

        /*
         * O eventId é estável.
         *
         * Se o publisher repetir rapidamente
         * a publicação do mesmo evento, a FIFO
         * também oferece deduplicação adicional.
         *
         * A aplicação continua assumindo
         * at-least-once.
         */
        MessageDeduplicationId:
          eventId,
      }),
    );
  }
}