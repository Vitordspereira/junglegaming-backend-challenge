import {
  Injectable,
} from '@nestjs/common';

import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import type {
  ReceivedQueueMessage,
  WagerTransactionQueue,
} from '../../application/ports/wager-transaction-queue.js';

import type {
  WagerTransactionRequestedMessage,
} from '../../application/messaging/wager-transaction-requested.message.js';

@Injectable()
export class SqsWagerTransactionQueue
  implements WagerTransactionQueue
{
  private readonly client: SQSClient;

  private readonly queueUrl: string;

  constructor() {
    const endpoint =
      process.env.SQS_ENDPOINT ??
      'http://localhost:4566';

    const region =
      process.env.AWS_REGION ??
      'us-east-1';

    this.queueUrl =
      process.env.WAGER_TRANSACTION_QUEUE_URL ??
      'http://localhost:4566/000000000000/wager-transactions.fifo';

    this.client =
      new SQSClient({
        region,

        endpoint,

        credentials: {
          accessKeyId:
            process.env.AWS_ACCESS_KEY_ID ??
            'test',

          secretAccessKey:
            process.env.AWS_SECRET_ACCESS_KEY ??
            'test',
        },
      });
  }

  async send(
    message: WagerTransactionRequestedMessage,
  ): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl:
          this.queueUrl,

        MessageBody:
          JSON.stringify(
            message,
          ),

        MessageGroupId:
          message.data.walletId,

        MessageDeduplicationId:
          message.messageId,
      }),
    );
  }

  async receive(): Promise<
    ReceivedQueueMessage[]
  > {
    const result =
      await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl:
            this.queueUrl,

          MaxNumberOfMessages:
            10,

          WaitTimeSeconds:
            1,

          VisibilityTimeout:
            30,
        }),
      );

    const messages =
      result.Messages ?? [];

    return messages
      .filter(
        (
          message,
        ): message is typeof message & {
          Body: string;
          ReceiptHandle: string;
        } =>
          typeof message.Body ===
            'string' &&
          typeof message.ReceiptHandle ===
            'string',
      )
      .map(
        (message) => ({
          receiptHandle:
            message.ReceiptHandle,

          body:
            JSON.parse(
              message.Body,
            ) as WagerTransactionRequestedMessage,
        }),
      );
  }

  async acknowledge(
    receiptHandle: string,
  ): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl:
          this.queueUrl,

        ReceiptHandle:
          receiptHandle,
      }),
    );
  }

  async changeVisibility(
    receiptHandle: string,
    visibilityTimeoutSeconds: number,
  ): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl:
          this.queueUrl,

        ReceiptHandle:
          receiptHandle,

        VisibilityTimeout:
          visibilityTimeoutSeconds,
      }),
    );
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl:
            this.queueUrl,

          AttributeNames: [
            'QueueArn',
          ],
        }),
      );

      return true;
    } catch {
      return false;
    }
  }
}