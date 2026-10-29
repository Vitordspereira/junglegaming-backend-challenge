import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import {
  randomUUID,
} from 'node:crypto';

import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import {
  MikroORM,
} from '@mikro-orm/postgresql';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

import {
  OutboxMessage,
} from '../../src/domain/messaging/outbox-message.js';

import {
  PublishOutboxUseCase,
} from '../../src/application/use-cases/publish-outbox.use-case.js';

import {
  MikroOrmOutboxMessageRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-outbox-message.repository.js';

import {
  MikroOrmTransactionManager,
} from '../../src/infrastructure/database/mikro-orm-transaction-manager.js';

import {
  SqsIntegrationEventPublisher,
} from '../../src/infrastructure/messaging/sqs-integration-event.publisher.js';

import {
  OutboxMessageEntity,
} from '../../src/infrastructure/database/entities/outbox-message.entity.js';

describe(
  'Transactional Outbox with real PostgreSQL and SQS',
  () => {
    let orm: MikroORM;
    let sqsClient: SQSClient;

    const queueUrl =
      process.env
        .INTEGRATION_EVENTS_QUEUE_URL ??
      'http://localhost:4566/000000000000/integration-events.fifo';

    const messageId =
      randomUUID();

    const aggregateId =
      randomUUID();

    beforeAll(async () => {
      orm =
        await MikroORM.init(
          mikroOrmConfig,
        );

      sqsClient =
        new SQSClient({
          region:
            process.env.AWS_REGION ??
            'us-east-1',

          endpoint:
            process.env.SQS_ENDPOINT ??
            'http://localhost:4566',

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

      await orm.em
        .fork()
        .nativeDelete(
          OutboxMessageEntity,
          {
            id:
              messageId,
          },
        );
    });

    afterAll(async () => {
      await orm.em
        .fork()
        .nativeDelete(
          OutboxMessageEntity,
          {
            id:
              messageId,
          },
        );

      sqsClient.destroy();

      await orm.close(
        true,
      );
    });

    it(
      'should publish a committed outbox event to SQS and mark it as published',
      async () => {
        const entityManager =
          orm.em.fork({
            useContext: true,
          });

        const repository =
          new MikroOrmOutboxMessageRepository(
            entityManager,
          );

        const transactionManager =
          new MikroOrmTransactionManager(
            entityManager,
          );

        const publisher =
          new SqsIntegrationEventPublisher();

        const useCase =
          new PublishOutboxUseCase(
            repository,
            publisher,
            transactionManager,
          );

        const occurredAt =
          new Date(
            '1970-01-01T00:00:03.000Z',
          );

        const eventPayload = {
          eventId:
            messageId,

          eventType:
            'WagerTransactionProcessed',

          aggregateId,

          correlationId:
            randomUUID(),

          occurredAt:
            occurredAt.toISOString(),

          version:
            1,

          data: {
            transactionId:
              aggregateId,

            providerId:
              'integration-provider',

            externalTransactionId:
              `external-${messageId}`,

            walletId:
              randomUUID(),

            playerId:
              'integration-player',

            roundId:
              'integration-round',

            gameId:
              'integration-game',

            kind:
              'BET',

            money: {
              amount:
                '10.00',

              currency:
                'BRL',
            },

            balance: {
              amount:
                '90.00',

              currency:
                'BRL',
            },
          },
        };

        /*
         * Simula o evento já confirmado pelo
         * commit financeiro.
         */
        const outboxMessage =
          OutboxMessage.create({
            id:
              messageId,

            aggregateId,

            eventType:
              'WagerTransactionProcessed',

            payload:
              eventPayload,

            occurredAt,
          });

        await repository.save(
          outboxMessage,
        );

        const result =
          await useCase.execute(
            new Date(),
          );

        expect(
          result.published,
        ).toBeGreaterThanOrEqual(
          1,
        );

        /*
         * Confirma que publishedAt foi
         * persistido no PostgreSQL.
         */
        const persisted =
          await repository.findById(
            messageId,
          );

        expect(
          persisted,
        ).not.toBeNull();

        expect(
          persisted?.isPublished(),
        ).toBe(true);

        expect(
          persisted?.publishedAt,
        ).toBeInstanceOf(
          Date,
        );

        /*
         * Agora comprova que o mesmo envelope
         * chegou realmente ao SQS.
         *
         * Podemos ter outras mensagens na fila,
         * então procuramos especificamente pelo
         * eventId deste teste.
         */
        let receivedPayload:
          Record<
            string,
            unknown
          > | undefined;

        let targetReceiptHandle:
          string | undefined;

        for (
          let attempt = 0;
          attempt < 5;
          attempt += 1
        ) {
          const response =
            await sqsClient.send(
              new ReceiveMessageCommand({
                QueueUrl:
                  queueUrl,

                MaxNumberOfMessages:
                  10,

                WaitTimeSeconds:
                  1,

                VisibilityTimeout:
                  2,
              }),
            );

          for (
            const message
            of response.Messages ??
            []
          ) {
            if (
              !message.Body
            ) {
              continue;
            }

            const parsed =
              JSON.parse(
                message.Body,
              ) as Record<
                string,
                unknown
              >;

            if (
              parsed.eventId ===
              messageId
            ) {
              receivedPayload =
                parsed;

              targetReceiptHandle =
                message.ReceiptHandle;

              break;
            }
          }

          if (
            receivedPayload
          ) {
            break;
          }
        }

        expect(
          receivedPayload,
        ).toBeDefined();

        expect(
          receivedPayload?.eventId,
        ).toBe(
          messageId,
        );

        expect(
          receivedPayload?.eventType,
        ).toBe(
          'WagerTransactionProcessed',
        );

        expect(
          receivedPayload?.aggregateId,
        ).toBe(
          aggregateId,
        );

        expect(
          receivedPayload,
        ).toEqual(
          eventPayload,
        );

        if (
          targetReceiptHandle
        ) {
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl:
                queueUrl,

              ReceiptHandle:
                targetReceiptHandle,
            }),
          );
        }
      },
    );
  },
);