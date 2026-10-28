import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  canonicalJson,
  createPayloadHash,
} from './canonical-payload-hash.js';

describe('canonical payload hash', () => {
  it('should produce the same canonical JSON regardless of object key order', () => {
    const first = {
      providerId: 'provider-a',
      externalTransactionId:
        'transaction-123',
      money: {
        amount: '25.00',
        currency: 'BRL',
      },
    };

    const second = {
      money: {
        currency: 'BRL',
        amount: '25.00',
      },
      externalTransactionId:
        'transaction-123',
      providerId: 'provider-a',
    };

    expect(
      canonicalJson(first),
    ).toBe(
      canonicalJson(second),
    );
  });

  it('should produce the same hash regardless of object key order', () => {
    const first = {
      providerId: 'provider-a',
      externalTransactionId:
        'transaction-123',
      playerId: 'player-1',
      walletId: 'wallet-1',
      roundId: 'round-987',
      gameId: 'fortune-chimp',
      kind: 'BET',
      money: {
        amount: '25.00',
        currency: 'BRL',
      },
    };

    const second = {
      kind: 'BET',
      walletId: 'wallet-1',
      money: {
        currency: 'BRL',
        amount: '25.00',
      },
      gameId: 'fortune-chimp',
      roundId: 'round-987',
      playerId: 'player-1',
      externalTransactionId:
        'transaction-123',
      providerId: 'provider-a',
    };

    expect(
      createPayloadHash(first),
    ).toBe(
      createPayloadHash(second),
    );
  });

  it('should produce a different hash when the business payload changes', () => {
    const first = {
      providerId: 'provider-a',
      externalTransactionId:
        'transaction-123',
      kind: 'BET',
      money: {
        amount: '25.00',
        currency: 'BRL',
      },
    };

    const second = {
      providerId: 'provider-a',
      externalTransactionId:
        'transaction-123',
      kind: 'BET',
      money: {
        amount: '30.00',
        currency: 'BRL',
      },
    };

    expect(
      createPayloadHash(first),
    ).not.toBe(
      createPayloadHash(second),
    );
  });
});