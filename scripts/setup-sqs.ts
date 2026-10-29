import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

const sqs = new SQSClient({
  region: 'us-east-1',

  endpoint:
    'http://localhost:4566',

  credentials: {
    accessKeyId:
      'test',

    secretAccessKey:
      'test',
  },
});

async function main() {
  const dlq =
    await sqs.send(
      new CreateQueueCommand({
        QueueName:
          'wager-transactions-dlq.fifo',

        Attributes: {
          FifoQueue:
            'true',

          ContentBasedDeduplication:
            'true',
        },
      }),
    );

  if (!dlq.QueueUrl) {
    throw new Error(
      'Could not create DLQ',
    );
  }

  const dlqAttributes =
    await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl:
          dlq.QueueUrl,

        AttributeNames: [
          'QueueArn',
        ],
      }),
    );

  const dlqArn =
    dlqAttributes.Attributes
      ?.QueueArn;

  if (!dlqArn) {
    throw new Error(
      'Could not resolve DLQ ARN',
    );
  }

  const mainQueue =
    await sqs.send(
      new CreateQueueCommand({
        QueueName:
          'wager-transactions.fifo',

        Attributes: {
          FifoQueue:
            'true',

          ContentBasedDeduplication:
            'true',

          VisibilityTimeout:
            '30',

          RedrivePolicy:
            JSON.stringify({
              deadLetterTargetArn:
                dlqArn,

              maxReceiveCount:
                '5',
            }),
        },
      }),
    );

  console.log({
    mainQueue:
      mainQueue.QueueUrl,

    dlq:
      dlq.QueueUrl,

    dlqArn,
  });
}

main().catch(
  (error) => {
    console.error(error);

    process.exit(1);
  },
);