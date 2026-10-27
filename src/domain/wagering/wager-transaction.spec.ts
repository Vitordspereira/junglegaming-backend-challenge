import { describe, expect, it } from 'vitest';
import { Money } from '../shared/value-objects/money.js';
import { LedgerDirection } from '../wallet/wallet-ledger-entry.js';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';

function createTransaction(
  kind: WagerTransactionKind,
  amount = '25.00',
  referenceExternalTransactionId?: string,
): WagerTransaction {
  return WagerTransaction.create({
    id: 'transaction-1',
    providerId: 'provider-1',
    externalTransactionId: 'external-1',
    idempotencyKey: 'idempotency-1',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    money: Money.from({
      amount,
      currency: 'BRL',
    }),
    referenceExternalTransactionId,
  });
}

describe('WagerTransaction', () => {
  it('should create a BET as pending', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
    expect(transaction.affectsBalance()).toBe(true);
    expect(transaction.ledgerDirectionFor()).toBe(
      LedgerDirection.Debit,
    );
  });

  it('should create a WIN with credit direction', () => {
    const transaction = createTransaction(WagerTransactionKind.Win);

    expect(transaction.ledgerDirectionFor()).toBe(
      LedgerDirection.Credit,
    );
  });

  it('should create a LOSS with zero amount', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Loss,
      '0.00',
    );

    expect(transaction.affectsBalance()).toBe(false);
  });

  it('should reject LOSS with a non-zero amount', () => {
    expect(() =>
      createTransaction(WagerTransactionKind.Loss, '10.00'),
    ).toThrow('LOSS transaction amount must be zero');
  });

  it('should require reference for REFUND', () => {
    expect(() =>
      createTransaction(WagerTransactionKind.Refund),
    ).toThrow('Reference transaction is required');
  });

  it('should allow REFUND with reference', () => {
    const transaction = createTransaction(
      WagerTransactionKind.Refund,
      '25.00',
      'original-bet',
    );

    expect(transaction.requiresReference()).toBe(true);
    expect(transaction.ledgerDirectionFor()).toBe(
      LedgerDirection.Credit,
    );
  });

  it('should mark a transaction as processed', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    transaction.markProcessed(undefined, new Date());

    expect(transaction.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should reject a transaction with a failure code', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    transaction.reject(FailureCode.InsufficientFunds);

    expect(transaction.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(transaction.failureCode).toBe(
      FailureCode.InsufficientFunds,
    );
  });

  it('should prevent changing a terminal transaction', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    transaction.markProcessed(undefined, new Date());

    expect(() =>
      transaction.reject(FailureCode.InsufficientFunds),
    ).toThrow('Transaction is already in a terminal state');
  });

  it('should detect matching payload hashes', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    expect(transaction.matchesPayload('hash-1')).toBe(true);
    expect(transaction.matchesPayload('different-hash')).toBe(false);
  });

  it('should invert the original ledger direction for ROLLBACK', () => {
    const originalBet = createTransaction(
      WagerTransactionKind.Bet,
    );

    const rollback = createTransaction(
      WagerTransactionKind.Rollback,
      '25.00',
      'external-1',
    );

    expect(
      rollback.ledgerDirectionFor(originalBet),
    ).toBe(LedgerDirection.Credit);
  });
});