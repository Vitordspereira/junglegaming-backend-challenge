import { describe, expect, it } from 'vitest';
import { Money } from '../shared/value-objects/money.js';
import { Wallet } from './wallet.js';

describe('Wallet', () => {
  it('should open a wallet with version 1', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.version).toBe(1);
  });

  it('should debit the wallet balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const change = wallet.debit(
      Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    );

    expect(change.balanceBefore.toString()).toBe('100.00');
    expect(change.balanceAfter.toString()).toBe('75.00');
    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(2);
  });

  it('should credit the wallet balance', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    wallet.credit(
      Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('150.00');
    expect(wallet.version).toBe(2);
  });

  it('should reject a debit that would make the balance negative', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(() =>
      wallet.debit(
        Money.from({
          amount: '150.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow('Insufficient funds');

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(1);
  });

  it('should reject operations with a different currency', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(() =>
      wallet.credit(
        Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      ),
    ).toThrow('Currency mismatch');
  });

  it('should reject zero-value balance changes', () => {
    const wallet = Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    expect(() => wallet.credit(Money.zero('BRL'))).toThrow(
      'Money amount must be positive',
    );

    expect(wallet.version).toBe(1);
  });

  it('should rehydrate an existing wallet without changing its state', () => {
    const createdAt = new Date('2026-01-01T10:00:00.000Z');
    const updatedAt = new Date('2026-01-02T10:00:00.000Z');

    const wallet = Wallet.rehydrate({
      id: 'wallet-1',
      playerId: 'player-1',
      currency: 'BRL',
      balance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
      version: 4,
      createdAt,
      updatedAt,
    });

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(4);
    expect(wallet.createdAt).toEqual(createdAt);
    expect(wallet.updatedAt).toEqual(updatedAt);
  });
});