import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  IntegrationEvent,
} from './integration-event.js';

interface TestData
  extends Record<string, unknown>
{
  transactionId: string;

  money: {
    amount: string;
    currency: string;
  };
}

class TestIntegrationEvent
  extends IntegrationEvent<TestData>
{
  readonly eventType =
    'TestIntegrationEvent';

  readonly version =
    1;

  constructor() {
    super({
      eventId:
        '11111111-1111-1111-1111-111111111111',

      aggregateId:
        'transaction-1',

      correlationId:
        'correlation-1',

      causationId:
        'message-1',

      occurredAt:
        new Date(
          '2026-10-29T03:00:00.000Z',
        ),

      data: {
        transactionId:
          'transaction-1',

        money: {
          amount:
            '10.00',

          currency:
            'BRL',
        },
      },
    });
  }
}

describe(
  'IntegrationEvent',
  () => {
    it(
      'should expose the required integration event envelope',
      () => {
        const event =
          new TestIntegrationEvent();

        expect(
          event.toJSON(),
        ).toEqual({
          eventId:
            '11111111-1111-1111-1111-111111111111',

          eventType:
            'TestIntegrationEvent',

          aggregateId:
            'transaction-1',

          correlationId:
            'correlation-1',

          causationId:
            'message-1',

          occurredAt:
            '2026-10-29T03:00:00.000Z',

          version:
            1,

          data: {
            transactionId:
              'transaction-1',

            money: {
              amount:
                '10.00',

              currency:
                'BRL',
            },
          },
        });
      },
    );

    it(
      'should keep money as plain serializable properties',
      () => {
        const event =
          new TestIntegrationEvent();

        const json =
          event.toJSON();

        expect(
          json.data.money,
        ).toEqual({
          amount:
            '10.00',

          currency:
            'BRL',
        });

        expect(
          typeof json.data.money.amount,
        ).toBe(
          'string',
        );
      },
    );
  },
);