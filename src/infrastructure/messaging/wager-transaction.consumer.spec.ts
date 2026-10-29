import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  PermanentMessageProcessingError,
} from '../../application/errors/permanent-message-processing.error.js';

import type {
  WagerTransactionQueue,
} from '../../application/ports/wager-transaction-queue.js';

import type {
  ProcessWagerMessageUseCase,
} from '../../application/use-cases/process-wager-message.use-case.js';

import {
  WagerTransactionKind,
} from '../../domain/wagering/wager-transaction.js';

import {
  WagerTransactionConsumer,
} from './wager-transaction.consumer.js';

describe(
  'WagerTransactionConsumer',
  () => {
    const createMessage = (
      receiveCount: number,
    ) => ({
      receiptHandle:
        'receipt-handle-1',

      receiveCount,

      body: {
        messageId:
          'message-1',

        type:
          'WagerTransactionRequested' as const,

        occurredAt:
          new Date().toISOString(),

        data: {
          providerId:
            'provider-1',

          externalTransactionId:
            'external-1',

          idempotencyKey:
            'idempotency-1',

          playerId:
            '11111111-1111-1111-1111-111111111111',

          walletId:
            '22222222-2222-2222-2222-222222222222',

          roundId:
            'round-1',

          gameId:
            'game-1',

          kind:
            WagerTransactionKind.Bet,

          money: {
            amount:
              '10.00',

            currency:
              'BRL',
          },
        },
      },
    });

    it(
      'should acknowledge the message after successful processing',
      async () => {
        let processCalls =
          0;

        let acknowledgeCalls =
          0;

        let changeVisibilityCalls =
          0;

        let deadLetterCalls =
          0;

        const queue = {
          async receive() {
            return [
              createMessage(
                1,
              ),
            ];
          },

          async acknowledge(
            receiptHandle:
              string,
          ) {
            expect(
              receiptHandle,
            ).toBe(
              'receipt-handle-1',
            );

            acknowledgeCalls +=
              1;
          },

          async send() {},

          async sendToDeadLetter() {
            deadLetterCalls +=
              1;
          },

          async changeVisibility() {
            changeVisibilityCalls +=
              1;
          },

          async isReachable() {
            return true;
          },
        } as WagerTransactionQueue;

        const processWagerMessageUseCase = {
          async execute() {
            processCalls +=
              1;

            return {
              alreadyProcessed:
                false,
            };
          },
        } as unknown as ProcessWagerMessageUseCase;

        const consumer =
          new WagerTransactionConsumer(
            queue,
            processWagerMessageUseCase,
          );

        const processed =
          await consumer.processOnce();

        expect(
          processed,
        ).toBe(1);

        expect(
          processCalls,
        ).toBe(1);

        expect(
          acknowledgeCalls,
        ).toBe(1);

        expect(
          changeVisibilityCalls,
        ).toBe(0);

        expect(
          deadLetterCalls,
        ).toBe(0);
      },
    );

    it(
      'should retry transient failures using exponential backoff without acknowledging',
      async () => {
        const expectations = [
          {
            receiveCount:
              1,
            expectedDelay:
              5,
          },
          {
            receiveCount:
              2,
            expectedDelay:
              10,
          },
          {
            receiveCount:
              3,
            expectedDelay:
              20,
          },
          {
            receiveCount:
              4,
            expectedDelay:
              40,
          },
          {
            receiveCount:
              5,
            expectedDelay:
              40,
          },
        ];

        for (
          const expectation
          of expectations
        ) {
          let acknowledgeCalls =
            0;

          let deadLetterCalls =
            0;

          let visibilityTimeout =
            0;

          const queue = {
            async receive() {
              return [
                createMessage(
                  expectation
                    .receiveCount,
                ),
              ];
            },

            async acknowledge() {
              acknowledgeCalls +=
                1;
            },

            async send() {},

            async sendToDeadLetter() {
              deadLetterCalls +=
                1;
            },

            async changeVisibility(
              receiptHandle:
                string,

              visibilityTimeoutSeconds:
                number,
            ) {
              expect(
                receiptHandle,
              ).toBe(
                'receipt-handle-1',
              );

              visibilityTimeout =
                visibilityTimeoutSeconds;
            },

            async isReachable() {
              return true;
            },
          } as WagerTransactionQueue;

          const processWagerMessageUseCase = {
            async execute() {
              throw new Error(
                'Temporary infrastructure failure',
              );
            },
          } as unknown as ProcessWagerMessageUseCase;

          const consumer =
            new WagerTransactionConsumer(
              queue,
              processWagerMessageUseCase,
            );

          const processed =
            await consumer.processOnce();

          expect(
            processed,
          ).toBe(1);

          expect(
            acknowledgeCalls,
          ).toBe(0);

          expect(
            deadLetterCalls,
          ).toBe(0);

          expect(
            visibilityTimeout,
          ).toBe(
            expectation
              .expectedDelay,
          );
        }
      },
    );

    it(
      'should send permanent failures to the dead-letter queue and acknowledge the original message',
      async () => {
        let acknowledgeCalls =
          0;

        let deadLetterCalls =
          0;

        let changeVisibilityCalls =
          0;

        let deadLetterMessageId:
          string | undefined;

        const queue = {
          async receive() {
            return [
              createMessage(
                1,
              ),
            ];
          },

          async acknowledge(
            receiptHandle:
              string,
          ) {
            expect(
              receiptHandle,
            ).toBe(
              'receipt-handle-1',
            );

            acknowledgeCalls +=
              1;
          },

          async send() {},

          async sendToDeadLetter(
            message:
              ReturnType<
                typeof createMessage
              >['body'],
          ) {
            deadLetterCalls +=
              1;

            deadLetterMessageId =
              message.messageId;
          },

          async changeVisibility() {
            changeVisibilityCalls +=
              1;
          },

          async isReachable() {
            return true;
          },
        } as WagerTransactionQueue;

        const processWagerMessageUseCase = {
          async execute() {
            throw new PermanentMessageProcessingError(
              'Permanent processing failure',
            );
          },
        } as unknown as ProcessWagerMessageUseCase;

        const consumer =
          new WagerTransactionConsumer(
            queue,
            processWagerMessageUseCase,
          );

        const processed =
          await consumer.processOnce();

        expect(
          processed,
        ).toBe(1);

        expect(
          deadLetterCalls,
        ).toBe(1);

        expect(
          deadLetterMessageId,
        ).toBe(
          'message-1',
        );

        expect(
          acknowledgeCalls,
        ).toBe(1);

        expect(
          changeVisibilityCalls,
        ).toBe(0);
      },
    );

    it(
      'should not acknowledge the original message if sending to the dead-letter queue fails',
      async () => {
        let acknowledgeCalls =
          0;

        const queue = {
          async receive() {
            return [
              createMessage(
                1,
              ),
            ];
          },

          async acknowledge() {
            acknowledgeCalls +=
              1;
          },

          async send() {},

          async sendToDeadLetter() {
            throw new Error(
              'DLQ unavailable',
            );
          },

          async changeVisibility() {},

          async isReachable() {
            return true;
          },
        } as WagerTransactionQueue;

        const processWagerMessageUseCase = {
          async execute() {
            throw new PermanentMessageProcessingError(
              'Permanent processing failure',
            );
          },
        } as unknown as ProcessWagerMessageUseCase;

        const consumer =
          new WagerTransactionConsumer(
            queue,
            processWagerMessageUseCase,
          );

        let thrownError:
          unknown;

        try {
          await consumer.processOnce();
        } catch (error) {
          thrownError =
            error;
        }

        expect(
          thrownError,
        ).toBeInstanceOf(
          Error,
        );

        expect(
          (
            thrownError as Error
          ).message,
        ).toBe(
          'DLQ unavailable',
        );

        expect(
          acknowledgeCalls,
        ).toBe(0);
      },
    );
  },
);