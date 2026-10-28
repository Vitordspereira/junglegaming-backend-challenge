import { describe, expect, it } from 'bun:test';

import { CreateWalletUseCase } from './create-wallet.use-case.js';

import type { TransactionManager } from '../ports/transaction-manager.js';
import type { WagerTransactionRepository } from '../ports/wager-transaction.repository.js';
import type { WalletLedgerEntryRepository } from '../ports/wallet-ledger-entry.repository.js';
import type { WalletRepository } from '../ports/wallet.repository.js';

import { Money } from '../../domain/shared/value-objects/money.js';
import type { WagerTransaction } from '../../domain/wagering/wager-transaction.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';
import type { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry.js';
import { LedgerDirection } from '../../domain/wallet/wallet-ledger-entry.js';
import { Wallet } from '../../domain/wallet/wallet.js';

describe('CreateWalletUseCase', () => {
  it('should create a wallet with an internal OPENING transaction and CREDIT ledger when initial balance is positive', async () => {
    let savedWallet: Wallet | undefined;
    let savedOpening: WagerTransaction | undefined;
    let savedLedger: WalletLedgerEntry | undefined;

    const walletRepository = {
      findByPlayerAndCurrency: async () => null,

      save: async (wallet: Wallet) => {
        savedWallet = wallet;
      },
    } as WalletRepository;

    const wagerRepository = {
      save: async (transaction: WagerTransaction) => {
        savedOpening = transaction;
      },
    } as unknown as WagerTransactionRepository;

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

    const useCase = new CreateWalletUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      playerId: '33333333-3333-3333-3333-333333333333',
      initialBalance: '100.00',
      currency: 'BRL',
    });

    expect(result.playerId).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(result.balance).toBe('100.00');
    expect(result.currency).toBe('BRL');
    expect(result.version).toBe(1);

    expect(savedWallet).toBeDefined();
    expect(savedWallet?.id).toBe(result.walletId);
    expect(savedWallet?.playerId).toBe(result.playerId);
    expect(savedWallet?.balance.toString()).toBe('100.00');
    expect(savedWallet?.currency).toBe('BRL');
    expect(savedWallet?.version).toBe(1);

    expect(savedOpening).toBeDefined();
    expect(savedOpening?.kind).toBe(
      WagerTransactionKind.Opening,
    );
    expect(savedOpening?.status).toBe(
      WagerTransactionStatus.Processed,
    );
    expect(savedOpening?.walletId).toBe(result.walletId);
    expect(savedOpening?.playerId).toBe(result.playerId);
    expect(savedOpening?.money.toString()).toBe('100.00');
    expect(savedOpening?.money.currency).toBe('BRL');
    expect(
      savedOpening?.resultBalance?.toString(),
    ).toBe('100.00');

    expect(savedLedger).toBeDefined();
    expect(savedLedger?.walletId).toBe(result.walletId);
    expect(savedLedger?.transactionId).toBe(
      savedOpening?.id,
    );
    expect(savedLedger?.direction).toBe(
      LedgerDirection.Credit,
    );
    expect(savedLedger?.money.toString()).toBe('100.00');
    expect(
      savedLedger?.balanceBefore.toString(),
    ).toBe('0.00');
    expect(
      savedLedger?.balanceAfter.toString(),
    ).toBe('100.00');
  });

  it('should create a zero-balance wallet without OPENING transaction or ledger', async () => {
    let savedWallet: Wallet | undefined;
    let wagerSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByPlayerAndCurrency: async () => null,

      save: async (wallet: Wallet) => {
        savedWallet = wallet;
      },
    } as WalletRepository;

    const wagerRepository = {
      save: async () => {
        wagerSaveCalls += 1;
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

    const useCase = new CreateWalletUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    const result = await useCase.execute({
      playerId: '44444444-4444-4444-4444-444444444444',
      initialBalance: '0.00',
      currency: 'BRL',
    });

    expect(result.playerId).toBe(
      '44444444-4444-4444-4444-444444444444',
    );
    expect(result.balance).toBe('0.00');
    expect(result.currency).toBe('BRL');
    expect(result.version).toBe(1);

    expect(savedWallet).toBeDefined();
    expect(savedWallet?.id).toBe(result.walletId);
    expect(savedWallet?.balance.toString()).toBe('0.00');

    expect(wagerSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);
  });


  it('should reject creating a duplicate wallet for the same player and currency', async () => {
    const existingWallet = Wallet.open({
      id: '55555555-5555-5555-5555-555555555555',
      playerId: '66666666-6666-6666-6666-666666666666',
      initialBalance: Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
    });

    let walletSaveCalls = 0;
    let wagerSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByPlayerAndCurrency: async (
        playerId: string,
        currency: string,
      ) => {
        if (
          playerId === existingWallet.playerId &&
          currency === existingWallet.currency
        ) {
          return existingWallet;
        }

        return null;
      },

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      save: async () => {
        wagerSaveCalls += 1;
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

    const useCase = new CreateWalletUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    await expect(
      useCase.execute({
        playerId: existingWallet.playerId,
        initialBalance: '100.00',
        currency: 'BRL',
      }),
    ).rejects.toThrow(
      'Wallet already exists for player and currency',
    );

    expect(walletSaveCalls).toBe(0);
    expect(wagerSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);
  });


  it('should reject a negative initial balance without persisting anything', async () => {
    let walletSaveCalls = 0;
    let wagerSaveCalls = 0;
    let ledgerAppendCalls = 0;

    const walletRepository = {
      findByPlayerAndCurrency: async () => null,

      save: async () => {
        walletSaveCalls += 1;
      },
    } as WalletRepository;

    const wagerRepository = {
      save: async () => {
        wagerSaveCalls += 1;
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

    const useCase = new CreateWalletUseCase(
      walletRepository,
      wagerRepository,
      ledgerRepository,
      transactionManager,
    );

    await expect(
      useCase.execute({
        playerId: '77777777-7777-7777-7777-777777777777',
        initialBalance: '-1.00',
        currency: 'BRL',
      }),
    ).rejects.toThrow();

    expect(walletSaveCalls).toBe(0);
    expect(wagerSaveCalls).toBe(0);
    expect(ledgerAppendCalls).toBe(0);
  });

});
