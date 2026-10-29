import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  WagerTransactionKind,
} from '../../domain/wagering/wager-transaction.js';

import type {
  WagerTransactionRequestedMessage,
} from './wager-transaction-requested.message.js';

describe('WagerTransactionRequestedMessage', () => {
  it('should represent the expected SQS wagering message contract', () => {
    const message:
      WagerTransactionRequestedMessage = {
        messageId:
          'msg-123',

        type:
          'WagerTransactionRequested',

        occurredAt:
          '2026-07-29T15:00:00.000Z',

        data: {
          providerId:
            'provider-a',

          externalTransactionId:
            'transaction-123',

          idempotencyKey:
            'provider-a:transaction-123',

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

    expect(
      message.type,
    ).toBe(
      'WagerTransactionRequested',
    );

    expect(
      message.data.kind,
    ).toBe(
      WagerTransactionKind.Bet,
    );

    expect(
      message.data.money,
    ).toEqual({
      amount:
        '25.00',

      currency:
        'BRL',
    });
  });
});