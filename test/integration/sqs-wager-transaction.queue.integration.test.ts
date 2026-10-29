import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  WagerTransactionKind,
} from '../../src/domain/wagering/wager-transaction.js';

import {
  SqsWagerTransactionQueue,
} from '../../src/infrastructure/messaging/sqs-wager-transaction.queue.js';

describe('SqsWagerTransactionQueue integration', () => {
  it('should send, receive and acknowledge a wagering transaction message using real SQS', async () => {
    const queue =
      new SqsWagerTransactionQueue();

    const message = {
      messageId:
        `msg-${crypto.randomUUID()}`,

      type:
        'WagerTransactionRequested' as const,

      occurredAt:
        new Date().toISOString(),

      data: {
        providerId:
          'provider-a',

        externalTransactionId:
          `transaction-${crypto.randomUUID()}`,

        idempotencyKey:
          `provider-a:${crypto.randomUUID()}`,

        playerId:
          '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',

        walletId:
          '0192f291-27dd-7d3f-8071-5f8685deef37',

        roundId:
          'round-987',

        gameId:
          'fortune-chimp',

        kind:
          WagerTransactionKind.Bet,

        money: {
          amount:
            '25.00',

          currency:
            'BRL',
        },
      },
    };

    await queue.send(
      message,
    );

    let received:
      Awaited<
        ReturnType<
          SqsWagerTransactionQueue['receive']
        >
      > = [];

    for (
      let attempt = 0;
      attempt < 5;
      attempt += 1
    ) {
      received =
        await queue.receive();

      if (
        received.length > 0
      ) {
        break;
      }
    }

    expect(
      received.length,
    ).toBeGreaterThan(0);

    const receivedMessage =
      received.find(
        (item) =>
          item.body.messageId ===
          message.messageId,
      );

    expect(
      receivedMessage,
    ).toBeDefined();

    expect(
      receivedMessage?.body,
    ).toEqual(
      message,
    );

    if (!receivedMessage) {
      throw new Error(
        'Expected SQS message was not received',
      );
    }

    await queue.acknowledge(
      receivedMessage.receiptHandle,
    );
  });
});