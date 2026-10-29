import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  FailureCode,
  WagerTransactionKind,
} from '../../wagering/wager-transaction.js';

import {
  LedgerDirection,
} from '../../wallet/wallet-ledger-entry.js';

import {
  WagerTransactionProcessedEvent,
} from './wager-transaction-processed.event.js';

import {
  WagerTransactionRejectedEvent,
} from './wager-transaction-rejected.event.js';

import {
  WalletBalanceChangedEvent,
} from './wallet-balance-changed.event.js';

import {
  WagerTransactionPendingReferenceEvent,
} from './wager-transaction-pending-reference.event.js';

describe(
  'Integration events',
  () => {
    const occurredAt =
      new Date(
        '2026-10-29T03:00:00.000Z',
      );

    it(
      'should serialize WagerTransactionProcessed',
      () => {
        const event =
          new WagerTransactionProcessedEvent({
            eventId:
              'event-1',

            aggregateId:
              'transaction-1',

            correlationId:
              'correlation-1',

            causationId:
              'message-1',

            occurredAt,

            data: {
              transactionId:
                'transaction-1',

              providerId:
                'provider-1',

              externalTransactionId:
                'external-1',

              walletId:
                'wallet-1',

              playerId:
                'player-1',

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

              balance: {
                amount:
                  '90.00',

                currency:
                  'BRL',
              },
            },
          });

        expect(
          event.toJSON(),
        ).toEqual({
          eventId:
            'event-1',

          eventType:
            'WagerTransactionProcessed',

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

            providerId:
              'provider-1',

            externalTransactionId:
              'external-1',

            walletId:
              'wallet-1',

            playerId:
              'player-1',

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

            balance: {
              amount:
                '90.00',

              currency:
                'BRL',
            },
          },
        });
      },
    );

    it(
      'should serialize WagerTransactionRejected',
      () => {
        const event =
          new WagerTransactionRejectedEvent({
            eventId:
              'event-2',

            aggregateId:
              'transaction-2',

            correlationId:
              'correlation-2',

            occurredAt,

            data: {
              transactionId:
                'transaction-2',

              providerId:
                'provider-1',

              externalTransactionId:
                'external-2',

              walletId:
                'wallet-1',

              playerId:
                'player-1',

              roundId:
                'round-1',

              gameId:
                'game-1',

              kind:
                WagerTransactionKind.Bet,

              failureCode:
                FailureCode.InsufficientFunds,

              money: {
                amount:
                  '100.00',

                currency:
                  'BRL',
              },

              balance: {
                amount:
                  '10.00',

                currency:
                  'BRL',
              },
            },
          });

        expect(
          event.eventType,
        ).toBe(
          'WagerTransactionRejected',
        );

        expect(
          event.version,
        ).toBe(1);

        expect(
          event.toJSON().data.failureCode,
        ).toBe(
          FailureCode.InsufficientFunds,
        );
      },
    );

    it(
      'should serialize WalletBalanceChanged',
      () => {
        const event =
          new WalletBalanceChangedEvent({
            eventId:
              'event-3',

            aggregateId:
              'wallet-1',

            correlationId:
              'correlation-3',

            occurredAt,

            data: {
              walletId:
                'wallet-1',

              transactionId:
                'transaction-3',

              direction:
                LedgerDirection.Debit,

              money: {
                amount:
                  '10.00',

                currency:
                  'BRL',
              },

              balanceBefore: {
                amount:
                  '100.00',

                currency:
                  'BRL',
              },

              balanceAfter: {
                amount:
                  '90.00',

                currency:
                  'BRL',
              },

              walletVersion:
                2,
            },
          });

        expect(
          event.eventType,
        ).toBe(
          'WalletBalanceChanged',
        );

        expect(
          event.version,
        ).toBe(1);

        expect(
          event.toJSON().data.balanceAfter,
        ).toEqual({
          amount:
            '90.00',

          currency:
            'BRL',
        });

        expect(
          event.toJSON().data.walletVersion,
        ).toBe(2);
      },
    );

    it(
      'should serialize WagerTransactionPendingReference',
      () => {
        const event =
          new WagerTransactionPendingReferenceEvent({
            eventId:
              'event-4',

            aggregateId:
              'transaction-4',

            correlationId:
              'correlation-4',

            causationId:
              'message-4',

            occurredAt,

            data: {
              transactionId:
                'transaction-4',

              providerId:
                'provider-1',

              externalTransactionId:
                'external-4',

              walletId:
                'wallet-1',

              playerId:
                'player-1',

              roundId:
                'round-1',

              gameId:
                'game-1',

              kind:
                WagerTransactionKind.Refund,

              referenceExternalTransactionId:
                'original-bet-1',

              money: {
                amount:
                  '10.00',

                currency:
                  'BRL',
              },
            },
          });

        expect(
          event.eventType,
        ).toBe(
          'WagerTransactionPendingReference',
        );

        expect(
          event.version,
        ).toBe(1);

        expect(
          event.toJSON().data
            .referenceExternalTransactionId,
        ).toBe(
          'original-bet-1',
        );
      },
    );
  },
);