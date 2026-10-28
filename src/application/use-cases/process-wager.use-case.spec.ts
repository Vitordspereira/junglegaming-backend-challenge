import { describe, expect, it } from 'bun:test';

import { Money } from '../../domain/shared/value-objects/money.js';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

import type { WalletRepository } from '../ports/wallet.repository.js';
import type { WagerTransactionRepository } from '../ports/wager-transaction.repository.js';
import type { WalletLedgerEntryRepository } from '../ports/wallet-ledger-entry.repository.js';
import type { TransactionManager } from '../ports/transaction-manager.js';

import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';
import { ProcessWagerUseCase } from './process-wager.use-case.js';

describe('ProcessWagerUseCase', () => {
  it('should return the original result for an idempotent replay', async () => {
    const transaction = WagerTransaction.create({
      id: '11111111-1111-1111-1111-111111111111',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      walletId: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    transaction.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => transaction,
    } as WagerTransactionRepository;

    const useCase = new ProcessWagerUseCase(
      {} as WalletRepository,
      wagerRepository,
      {} as WalletLedgerEntryRepository,
      {} as TransactionManager,
    );

    const result = await useCase.execute({
      id: 'another-id',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      walletId: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      amount: '25.00',
      currency: 'BRL',
    });

    expect(result.transactionId).toBe(transaction.id);
    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(true);
  });

  it('should reject reuse of an idempotency key with a different payload', async () => {
    const transaction = WagerTransaction.create({
      id: '11111111-1111-1111-1111-111111111111',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'key-1',
      payloadHash: 'original-hash',
      walletId: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => transaction,
    } as WagerTransactionRepository;

    const useCase = new ProcessWagerUseCase(
      {} as WalletRepository,
      wagerRepository,
      {} as WalletLedgerEntryRepository,
      {} as TransactionManager,
    );

    expect(
      useCase.execute({
        id: 'another-id',
        providerId: 'provider-1',
        externalTransactionId: 'external-1',
        idempotencyKey: 'key-1',
        payloadHash: 'different-hash',
        walletId: '22222222-2222-2222-2222-222222222222',
        playerId: '33333333-3333-3333-3333-333333333333',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Bet,
        amount: '25.00',
        currency: 'BRL',
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('should process a BET and debit the wallet balance', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    let savedTransaction: WagerTransaction | undefined;
    let appendedLedgerEntry: WalletLedgerEntry | undefined;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {},
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async (entry: WalletLedgerEntry) => {
        appendedLedgerEntry = entry;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '11111111-1111-1111-1111-111111111111',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      amount: '25.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);
    expect(wallet.balance.toString()).toBe('75.00');

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');

    expect(appendedLedgerEntry?.direction).toBe(
      LedgerDirection.Debit,
    );

    expect(
      appendedLedgerEntry?.balanceBefore.toString(),
    ).toBe('100.00');

    expect(
      appendedLedgerEntry?.balanceAfter.toString(),
    ).toBe('75.00');
  });

  it('should reject a BET when the wallet has insufficient funds', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    });

    let savedTransaction: WagerTransaction | undefined;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {},
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '11111111-1111-1111-1111-111111111111',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      amount: '80.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InsufficientFunds,
    );

    expect(wallet.balance.toString()).toBe('20.00');
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InsufficientFunds,
    );
  });

  it('should process a WIN and credit the wallet balance', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    let savedTransaction: WagerTransaction | undefined;
    let appendedLedgerEntry: WalletLedgerEntry | undefined;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {},
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async (entry: WalletLedgerEntry) => {
        appendedLedgerEntry = entry;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '44444444-4444-4444-4444-444444444444',
      providerId: 'provider-1',
      externalTransactionId: 'external-win-1',
      idempotencyKey: 'key-win-1',
      payloadHash: 'hash-win-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Win,
      amount: '40.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('140.00');
    expect(result.idempotentReplay).toBe(false);
    expect(wallet.balance.toString()).toBe('140.00');

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('140.00');

    expect(appendedLedgerEntry?.direction).toBe(
      LedgerDirection.Credit,
    );

    expect(
      appendedLedgerEntry?.balanceBefore.toString(),
    ).toBe('100.00');

    expect(
      appendedLedgerEntry?.balanceAfter.toString(),
    ).toBe('140.00');
  });

  it('should process a LOSS without changing the wallet balance or creating ledger', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '55555555-5555-5555-5555-555555555555',
      providerId: 'provider-1',
      externalTransactionId: 'external-loss-1',
      idempotencyKey: 'key-loss-1',
      payloadHash: 'hash-loss-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Loss,
      amount: '0.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('100.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');
  });

  it('should process a REFUND and credit back a processed BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: '66666666-6666-6666-6666-666666666666',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-refund-1',
      idempotencyKey: 'key-original-bet-1',
      payloadHash: 'hash-original-bet-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let appendedLedgerEntry: WalletLedgerEntry | undefined;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {},
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-refund-1'
        ) {
          return referencedBet;
        }

        return null;
      },

      findProcessedByReferenceTransactionIdAndKind:
        async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async (entry: WalletLedgerEntry) => {
        appendedLedgerEntry = entry;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '77777777-7777-7777-7777-777777777777',
      providerId: 'provider-1',
      externalTransactionId: 'external-refund-1',
      idempotencyKey: 'key-refund-1',
      payloadHash: 'hash-refund-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-refund-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('100.00');

    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');

    expect(appendedLedgerEntry?.direction).toBe(
      LedgerDirection.Credit,
    );

    expect(
      appendedLedgerEntry?.balanceBefore.toString(),
    ).toBe('75.00');

    expect(
      appendedLedgerEntry?.balanceAfter.toString(),
    ).toBe('100.00');
  });

  it('should keep a REFUND as PENDING_REFERENCE when the referenced BET does not exist', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async () => null,

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '88888888-8888-8888-8888-888888888888',
      providerId: 'provider-1',
      externalTransactionId: 'external-refund-pending-1',
      idempotencyKey: 'key-refund-pending-1',
      payloadHash: 'hash-refund-pending-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-not-created-yet',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.PendingReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.PendingReference,
    );

    expect(
      savedTransaction?.referenceTransactionId,
    ).toBeUndefined();

    expect(
      savedTransaction?.resultBalance,
    ).toBeUndefined();
  });

  it('should reject a REFUND when the referenced transaction is not a processed BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedWin = WagerTransaction.create({
      id: '99999999-9999-9999-9999-999999999999',
      providerId: 'provider-1',
      externalTransactionId: 'external-win-invalid-refund-1',
      idempotencyKey: 'key-win-invalid-refund-1',
      payloadHash: 'hash-win-invalid-refund-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Win,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedWin.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-win-invalid-refund-1'
        ) {
          return referencedWin;
        }

        return null;
      },

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      providerId: 'provider-1',
      externalTransactionId: 'external-refund-invalid-reference-1',
      idempotencyKey: 'key-refund-invalid-reference-1',
      payloadHash: 'hash-refund-invalid-reference-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-win-invalid-refund-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a REFUND when the amount does not match the referenced BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-amount-mismatch-1',
      idempotencyKey: 'key-bet-amount-mismatch-1',
      payloadHash: 'hash-bet-amount-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-amount-mismatch-1'
        ) {
          return referencedBet;
        }

        return null;
      },

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-amount-mismatch-1',
      idempotencyKey:
        'key-refund-amount-mismatch-1',
      payloadHash:
        'hash-refund-amount-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '30.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-amount-mismatch-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a REFUND when the wallet does not match the referenced BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-wallet-mismatch-1',
      idempotencyKey: 'key-bet-wallet-mismatch-1',
      payloadHash: 'hash-bet-wallet-mismatch-1',
      walletId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-wallet-mismatch-1'
        ) {
          return referencedBet;
        }

        return null;
      },

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-wallet-mismatch-1',
      idempotencyKey:
        'key-refund-wallet-mismatch-1',
      payloadHash:
        'hash-refund-wallet-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-wallet-mismatch-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a REFUND when the player does not match the referenced BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: '11111111-aaaa-bbbb-cccc-222222222222',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-player-mismatch-1',
      idempotencyKey: 'key-bet-player-mismatch-1',
      payloadHash: 'hash-bet-player-mismatch-1',
      walletId: wallet.id,
      playerId: '99999999-9999-9999-9999-999999999999',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-player-mismatch-1'
        ) {
          return referencedBet;
        }

        return null;
      },

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '33333333-aaaa-bbbb-cccc-444444444444',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-player-mismatch-1',
      idempotencyKey:
        'key-refund-player-mismatch-1',
      payloadHash:
        'hash-refund-player-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-player-mismatch-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a REFUND when the currency does not match the referenced BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: '55555555-aaaa-bbbb-cccc-666666666666',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-currency-mismatch-1',
      idempotencyKey: 'key-bet-currency-mismatch-1',
      payloadHash: 'hash-bet-currency-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'USD',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'USD',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,
      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-currency-mismatch-1'
        ) {
          return referencedBet;
        }

        return null;
      },
      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: '77777777-aaaa-bbbb-cccc-888888888888',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-currency-mismatch-1',
      idempotencyKey:
        'key-refund-currency-mismatch-1',
      payloadHash:
        'hash-refund-currency-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-currency-mismatch-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a REFUND when the round does not match the referenced BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: '99999999-aaaa-bbbb-cccc-aaaaaaaaaaaa',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-round-mismatch-1',
      idempotencyKey: 'key-bet-round-mismatch-1',
      payloadHash: 'hash-bet-round-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-original',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,
      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-round-mismatch-1'
        ) {
          return referencedBet;
        }

        return null;
      },
      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: 'bbbbbbbb-aaaa-bbbb-cccc-cccccccccccc',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-round-mismatch-1',
      idempotencyKey:
        'key-refund-round-mismatch-1',
      payloadHash:
        'hash-refund-round-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-different',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-round-mismatch-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(result.balance).toBe('75.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a second REFUND for the same processed BET', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-duplicate-refund-1',
      idempotencyKey: 'key-bet-duplicate-refund-1',
      payloadHash: 'hash-bet-duplicate-refund-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    referencedBet.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    const previousRefund = WagerTransaction.create({
      id: 'cccccccc-1111-2222-3333-dddddddddddd',
      providerId: 'provider-1',
      externalTransactionId: 'external-refund-duplicate-refund-previous',
      idempotencyKey: 'key-refund-duplicate-refund-previous',
      payloadHash: 'hash-refund-duplicate-refund-previous',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      referenceExternalTransactionId:
        referencedBet.externalTransactionId,
    });

    previousRefund.markProcessed(
      referencedBet.id,
      new Date(),
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let walletSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByIdForUpdate: async () => wallet,
      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      findByProviderAndIdempotencyKey: async () => null,

      findByProviderAndExternalTransactionId: async (
        providerId: string,
        externalTransactionId: string,
      ) => {
        if (
          providerId === 'provider-1' &&
          externalTransactionId ===
            'external-bet-duplicate-refund-1'
        ) {
          return referencedBet;
        }

        return null;
      },

      findProcessedByReferenceTransactionIdAndKind: async (
        referenceTransactionId: string,
        kind: WagerTransactionKind,
      ) => {
        if (
          referenceTransactionId === referencedBet.id &&
          kind === WagerTransactionKind.Refund
        ) {
          return previousRefund;
        }

        return null;
      },

      save: async (transaction: WagerTransaction) => {
        savedTransaction = transaction;
      },
    } as unknown as WagerTransactionRepository;

    const ledgerRepository = {
      append: async () => {
        ledgerAppendCalls += 1;
      },
    } as WalletLedgerEntryRepository;

    const transactionManager = {
      execute: async <T>(
        work: () => Promise<T>,
      ): Promise<T> => work(),
    } as TransactionManager;

    const useCase = new ProcessWagerUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      id: 'eeeeeeee-1111-2222-3333-ffffffffffff',
      providerId: 'provider-1',
      externalTransactionId:
        'external-refund-duplicate-refund-second',
      idempotencyKey:
        'key-refund-duplicate-refund-second',
      payloadHash:
        'hash-refund-duplicate-refund-second',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-duplicate-refund-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.DuplicateReversal,
    );

    expect(result.balance).toBe('100.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.DuplicateReversal,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');
  });

});
