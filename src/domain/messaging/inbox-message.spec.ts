import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  InboxMessage,
} from './inbox-message.js';

describe('InboxMessage', () => {
  it('should create an unprocessed inbox message', () => {
    const inbox =
      InboxMessage.create({
        id:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        consumerName:
          'wager-transaction-consumer',

        messageId:
          'msg-123',
      });

    expect(
      inbox.consumerName,
    ).toBe(
      'wager-transaction-consumer',
    );

    expect(
      inbox.messageId,
    ).toBe(
      'msg-123',
    );

    expect(
      inbox.isProcessed(),
    ).toBe(false);
  });

  it('should mark an inbox message as processed', () => {
    const inbox =
      InboxMessage.create({
        id:
          'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

        consumerName:
          'wager-transaction-consumer',

        messageId:
          'msg-123',
      });

    const processedAt =
      new Date(
        '2026-10-29T02:00:00.000Z',
      );

    const processed =
      inbox.markProcessed(
        processedAt,
      );

    expect(
      processed.isProcessed(),
    ).toBe(true);

    expect(
      processed.processedAt,
    ).toEqual(
      processedAt,
    );
  });

  it('should reject an empty consumer name', () => {
    expect(
      () =>
        InboxMessage.create({
          id:
            'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

          consumerName:
            '',

          messageId:
            'msg-123',
        }),
    ).toThrow(
      'Inbox consumer name is required',
    );
  });

  it('should reject an empty message id', () => {
    expect(
      () =>
        InboxMessage.create({
          id:
            'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa',

          consumerName:
            'wager-transaction-consumer',

          messageId:
            '',
        }),
    ).toThrow(
      'Inbox message id is required',
    );
  });
});