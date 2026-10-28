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


  it('should process a ROLLBACK of a processed BET and credit the wallet', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: '71717171-7171-7171-7171-717171717171',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-rollback-1',
      idempotencyKey: 'key-bet-rollback-1',
      payloadHash: 'hash-bet-rollback-1',
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
    let savedLedger: WalletLedgerEntry | undefined;
    let walletSaveCalls = 0;

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
            'external-bet-rollback-1'
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
        savedLedger = entry;
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
      id: '81818181-8181-8181-8181-818181818181',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-bet-1',
      idempotencyKey:
        'key-rollback-bet-1',
      payloadHash:
        'hash-rollback-bet-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('100.00');
    expect(result.failureCode).toBeUndefined();
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);
    expect(walletSaveCalls).toBe(1);

    expect(savedLedger).toBeDefined();
    expect(savedLedger?.direction).toBe(
      LedgerDirection.Credit,
    );
    expect(savedLedger?.money.toString()).toBe('25.00');
    expect(savedLedger?.balanceBefore.toString()).toBe(
      '75.00',
    );
    expect(savedLedger?.balanceAfter.toString()).toBe(
      '100.00',
    );

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.referenceTransactionId,
    ).toBe(referencedBet.id);

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');
  });


  it('should process a ROLLBACK of a processed WIN and debit the wallet', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '125.00',
        currency: 'BRL',
      }),
    });

    const referencedWin = WagerTransaction.create({
      id: '91919191-9191-9191-9191-919191919191',
      providerId: 'provider-1',
      externalTransactionId: 'external-win-rollback-1',
      idempotencyKey: 'key-win-rollback-1',
      payloadHash: 'hash-win-rollback-1',
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
        amount: '125.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let savedLedger: WalletLedgerEntry | undefined;
    let walletSaveCalls = 0;

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
            'external-win-rollback-1'
        ) {
          return referencedWin;
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
        savedLedger = entry;
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
      id: 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-win-1',
      idempotencyKey:
        'key-rollback-win-1',
      payloadHash:
        'hash-rollback-win-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-win-rollback-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('100.00');
    expect(result.failureCode).toBeUndefined();
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);
    expect(walletSaveCalls).toBe(1);

    expect(savedLedger).toBeDefined();
    expect(savedLedger?.direction).toBe(
      LedgerDirection.Debit,
    );
    expect(savedLedger?.money.toString()).toBe('25.00');
    expect(savedLedger?.balanceBefore.toString()).toBe(
      '125.00',
    );
    expect(savedLedger?.balanceAfter.toString()).toBe(
      '100.00',
    );

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.referenceTransactionId,
    ).toBe(referencedWin.id);

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');
  });


  it('should process a ROLLBACK of a processed REFUND and debit the wallet', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const referencedRefund = WagerTransaction.create({
      id: 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
      providerId: 'provider-1',
      externalTransactionId: 'external-refund-rollback-1',
      idempotencyKey: 'key-refund-rollback-1',
      payloadHash: 'hash-refund-rollback-1',
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
        'external-bet-for-refund-rollback-1',
    });

    referencedRefund.markProcessed(
      'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
      new Date(),
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    let savedTransaction: WagerTransaction | undefined;
    let savedLedger: WalletLedgerEntry | undefined;
    let walletSaveCalls = 0;

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
            'external-refund-rollback-1'
        ) {
          return referencedRefund;
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
        savedLedger = entry;
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
      id: 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-refund-1',
      idempotencyKey:
        'key-rollback-refund-1',
      payloadHash:
        'hash-rollback-refund-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-refund-rollback-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.balance).toBe('75.00');
    expect(result.failureCode).toBeUndefined();
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(2);
    expect(walletSaveCalls).toBe(1);

    expect(savedLedger).toBeDefined();
    expect(savedLedger?.direction).toBe(
      LedgerDirection.Debit,
    );
    expect(savedLedger?.money.toString()).toBe('25.00');
    expect(savedLedger?.balanceBefore.toString()).toBe(
      '100.00',
    );
    expect(savedLedger?.balanceAfter.toString()).toBe(
      '75.00',
    );

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(
      savedTransaction?.referenceTransactionId,
    ).toBe(referencedRefund.id);

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a second ROLLBACK for the same processed transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
      providerId: 'provider-1',
      externalTransactionId: 'external-bet-duplicate-rollback-1',
      idempotencyKey: 'key-bet-duplicate-rollback-1',
      payloadHash: 'hash-bet-duplicate-rollback-1',
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

    const previousRollback = WagerTransaction.create({
      id: 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-duplicate-previous',
      idempotencyKey:
        'key-rollback-duplicate-previous',
      payloadHash:
        'hash-rollback-duplicate-previous',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      referenceExternalTransactionId:
        referencedBet.externalTransactionId,
    });

    previousRollback.markProcessed(
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
            'external-bet-duplicate-rollback-1'
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
          kind === WagerTransactionKind.Rollback
        ) {
          return previousRollback;
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
      id: 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-duplicate-second',
      idempotencyKey:
        'key-rollback-duplicate-second',
      payloadHash:
        'hash-rollback-duplicate-second',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-duplicate-rollback-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.DuplicateReversal,
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
      FailureCode.DuplicateReversal,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('75.00');
  });


  it('should reject a ROLLBACK when reversing a credit would make the wallet balance negative', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const referencedWin = WagerTransaction.create({
      id: 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-win-rollback-insufficient-funds-1',
      idempotencyKey:
        'key-win-rollback-insufficient-funds-1',
      payloadHash:
        'hash-win-rollback-insufficient-funds-1',
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
        amount: '25.00',
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
            'external-win-rollback-insufficient-funds-1'
        ) {
          return referencedWin;
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
      id: 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-win-insufficient-funds-1',
      idempotencyKey:
        'key-rollback-win-insufficient-funds-1',
      payloadHash:
        'hash-rollback-win-insufficient-funds-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-win-rollback-insufficient-funds-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.ReversalInsufficientFunds,
    );

    expect(result.balance).toBe('10.00');
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('10.00');
    expect(wallet.version).toBe(1);

    expect(walletSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);

    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(savedTransaction?.failureCode).toBe(
      FailureCode.ReversalInsufficientFunds,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('10.00');
  });


  it('should keep a ROLLBACK as PENDING_REFERENCE when the referenced transaction does not exist', async () => {
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

      findByProviderAndExternalTransactionId:
        async () => null,

      findProcessedByReferenceTransactionIdAndKind:
        async () => null,

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
      id: 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-pending-reference-1',
      idempotencyKey:
        'key-rollback-pending-reference-1',
      payloadHash:
        'hash-rollback-pending-reference-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-transaction-that-does-not-exist',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.PendingReference,
    );

    expect(result.balance).toBe('100.00');
    expect(result.failureCode).toBeUndefined();
    expect(result.idempotentReplay).toBe(false);

    expect(wallet.balance.toString()).toBe('100.00');
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


  it('should reject a ROLLBACK when the referenced transaction kind is invalid', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    const referencedLoss = WagerTransaction.create({
      id: 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-loss-invalid-rollback-1',
      idempotencyKey:
        'key-loss-invalid-rollback-1',
      payloadHash:
        'hash-loss-invalid-rollback-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Loss,
      money: Money.from({
        amount: '0.00',
        currency: 'BRL',
      }),
    });

    referencedLoss.markProcessed(
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
            'external-loss-invalid-rollback-1'
        ) {
          return referencedLoss;
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
      id: 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-invalid-reference-1',
      idempotencyKey:
        'key-rollback-invalid-reference-1',
      payloadHash:
        'hash-rollback-invalid-reference-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-loss-invalid-rollback-1',
    });

    expect(result.status).toBe(
      WagerTransactionStatus.Rejected,
    );

    expect(result.failureCode).toBe(
      FailureCode.InvalidReference,
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
      FailureCode.InvalidReference,
    );

    expect(
      savedTransaction?.resultBalance?.toString(),
    ).toBe('100.00');
  });


  it('should reject a ROLLBACK when the amount does not match the referenced transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-bet-rollback-amount-mismatch-1',
      idempotencyKey:
        'key-bet-rollback-amount-mismatch-1',
      payloadHash:
        'hash-bet-rollback-amount-mismatch-1',
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
            'external-bet-rollback-amount-mismatch-1'
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
      id: 'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-amount-mismatch-1',
      idempotencyKey:
        'key-rollback-amount-mismatch-1',
      payloadHash:
        'hash-rollback-amount-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '30.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-amount-mismatch-1',
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


  it('should reject a ROLLBACK when the wallet does not match the referenced transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-bet-rollback-wallet-mismatch-1',
      idempotencyKey:
        'key-bet-rollback-wallet-mismatch-1',
      payloadHash:
        'hash-bet-rollback-wallet-mismatch-1',
      walletId: '99999999-9999-9999-9999-999999999999',
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
            'external-bet-rollback-wallet-mismatch-1'
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
      id: 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-wallet-mismatch-1',
      idempotencyKey:
        'key-rollback-wallet-mismatch-1',
      payloadHash:
        'hash-rollback-wallet-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-wallet-mismatch-1',
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


  it('should reject a ROLLBACK when the player does not match the referenced transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-bet-rollback-player-mismatch-1',
      idempotencyKey:
        'key-bet-rollback-player-mismatch-1',
      payloadHash:
        'hash-bet-rollback-player-mismatch-1',
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
            'external-bet-rollback-player-mismatch-1'
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
      id: 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-player-mismatch-1',
      idempotencyKey:
        'key-rollback-player-mismatch-1',
      payloadHash:
        'hash-rollback-player-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-player-mismatch-1',
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


  it('should reject a ROLLBACK when the currency does not match the referenced transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4',
      providerId: 'provider-1',
      externalTransactionId:
        'external-bet-rollback-currency-mismatch-1',
      idempotencyKey:
        'key-bet-rollback-currency-mismatch-1',
      payloadHash:
        'hash-bet-rollback-currency-mismatch-1',
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
            'external-bet-rollback-currency-mismatch-1'
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
      id: 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-currency-mismatch-1',
      idempotencyKey:
        'key-rollback-currency-mismatch-1',
      payloadHash:
        'hash-rollback-currency-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-currency-mismatch-1',
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


  it('should reject a ROLLBACK when the round does not match the referenced transaction', async () => {
    const wallet = Wallet.open({
      id: '22222222-2222-2222-2222-222222222222',
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    const referencedBet = WagerTransaction.create({
      id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4',
      providerId: 'provider-1',
      externalTransactionId:
        'external-bet-rollback-round-mismatch-1',
      idempotencyKey:
        'key-bet-rollback-round-mismatch-1',
      payloadHash:
        'hash-bet-rollback-round-mismatch-1',
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
            'external-bet-rollback-round-mismatch-1'
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
      id: 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
      providerId: 'provider-1',
      externalTransactionId:
        'external-rollback-round-mismatch-1',
      idempotencyKey:
        'key-rollback-round-mismatch-1',
      payloadHash:
        'hash-rollback-round-mismatch-1',
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'round-different',
      gameId: 'game-1',
      kind: WagerTransactionKind.Rollback,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId:
        'external-bet-rollback-round-mismatch-1',
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

});
