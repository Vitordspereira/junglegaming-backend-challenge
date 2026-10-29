import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

const endpoint =
  process.env.SQS_ENDPOINT ??
  'http://localhost:4566';

const region =
  process.env.AWS_REGION ??
  'us-east-1';

const client =
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

const mainQueueName =
  'wager-transactions.fifo';

const deadLetterQueueName =
  'wager-transactions-dlq.fifo';

const integrationEventsQueueName =
  'integration-events.fifo';

async function getQueueUrl(
  queueName: string,
): Promise<string> {
  const result =
    await client.send(
      new GetQueueUrlCommand({
        QueueName:
          queueName,
      }),
    );

  if (!result.QueueUrl) {
    throw new Error(
      `Queue URL not found for ${queueName}`,
    );
  }

  return result.QueueUrl;
}

async function createFifoQueue(
  queueName: string,
): Promise<string> {
  await client.send(
    new CreateQueueCommand({
      QueueName:
        queueName,

      Attributes: {
        FifoQueue:
          'true',

        ContentBasedDeduplication:
          'true',
      },
    }),
  );

  return getQueueUrl(
    queueName,
  );
}

async function main(): Promise<void> {
  /*
   * 1. Cria primeiro a DLQ.
   */
  const deadLetterQueueUrl =
    await createFifoQueue(
      deadLetterQueueName,
    );

  /*
   * 2. Busca o ARN da DLQ para configurar
   * o RedrivePolicy da fila principal.
   */
  const deadLetterAttributes =
    await client.send(
      new GetQueueAttributesCommand({
        QueueUrl:
          deadLetterQueueUrl,

        AttributeNames: [
          'QueueArn',
        ],
      }),
    );

  const deadLetterQueueArn =
    deadLetterAttributes
      .Attributes
      ?.QueueArn;

  if (!deadLetterQueueArn) {
    throw new Error(
      'DLQ ARN not found',
    );
  }

  /*
   * 3. Cria a fila principal de transações.
   */
  await client.send(
    new CreateQueueCommand({
      QueueName:
        mainQueueName,

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
              deadLetterQueueArn,

            maxReceiveCount:
              '5',
          }),
      },
    }),
  );

  const mainQueueUrl =
    await getQueueUrl(
      mainQueueName,
    );

  /*
   * 4. Cria a fila utilizada pelo
   * Transactional Outbox.
   */
  const integrationEventsQueueUrl =
    await createFifoQueue(
      integrationEventsQueueName,
    );

  console.log(
    'SQS queues ready',
  );

  console.log(
    'Wager queue:',
    mainQueueUrl,
  );

  console.log(
    'Wager DLQ:',
    deadLetterQueueUrl,
  );

  console.log(
    'Integration events:',
    integrationEventsQueueUrl,
  );
}

await main();