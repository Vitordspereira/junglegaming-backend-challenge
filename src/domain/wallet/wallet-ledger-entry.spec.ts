import { describe, expect, it } from 'vitest';
import { Money } from '../shared/value-objects/money.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from './wallet-ledger-entry.js';

describe('WalletLedgerEntry', () => {
  it('should create a balanced debit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction: LedgerDirection.Debit,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Debit);
  });

  it('should create a balanced credit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '150.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('should reject an unbalanced debit entry', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Debit,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '90.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow('Ledger entry is not balanced');
  });

  it('should reject currencies that do not match', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-1',
        walletId: 'wallet-1',
        transactionId: 'transaction-1',
        direction: LedgerDirection.Credit,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'USD',
        }),
        balanceAfter: Money.from({
          amount: '125.00',
          currency: 'USD',
        }),
      }),
    ).toThrow('Ledger entry is not balanced');
  });

  it('should rehydrate an existing ledger entry', () => {
    const createdAt = new Date('2026-01-01T10:00:00.000Z');

    const entry = WalletLedgerEntry.rehydrate({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'transaction-1',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '150.00',
        currency: 'BRL',
      }),
      createdAt,
    });

    expect(entry.id).toBe('ledger-1');
    expect(entry.createdAt).toEqual(createdAt);
    expect(entry.isBalanced()).toBe(true);
  });
});