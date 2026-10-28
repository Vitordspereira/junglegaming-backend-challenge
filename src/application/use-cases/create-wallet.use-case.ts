import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../domain/shared/value-objects/money.js';
import {
  WagerTransaction,
  WagerTransactionKind,
} from '../../domain/wagering/wager-transaction.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';
import { Wallet } from '../../domain/wallet/wallet.js';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction-manager.js';
import {
  WAGER_TRANSACTION_REPOSITORY,
  type WagerTransactionRepository,
} from '../ports/wager-transaction.repository.js';
import {
  WALLET_LEDGER_ENTRY_REPOSITORY,
  type WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../ports/wallet.repository.js';

export interface CreateWalletInput {
  playerId: string;
  initialBalance: string;
  currency: string;
}

export interface CreateWalletOutput {
  walletId: string;
  playerId: string;
  balance: string;
  currency: string;
  version: number;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,

    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTransactionRepository: WagerTransactionRepository,

    @Inject(WALLET_LEDGER_ENTRY_REPOSITORY)
    private readonly ledgerRepository: WalletLedgerEntryRepository,

    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManager,
  ) {}

  async execute(
    input: CreateWalletInput,
  ): Promise<CreateWalletOutput> {
    const initialBalance = Money.from({
      amount: input.initialBalance,
      currency: input.currency,
    });

    return this.transactionManager.execute(
      async () => {
        const existingWallet =
          await this.walletRepository.findByPlayerAndCurrency(
            input.playerId,
            initialBalance.currency,
          );

        if (existingWallet) {
          throw new Error(
            'Wallet already exists for player and currency',
          );
        }

        const wallet = Wallet.open({
          id: randomUUID(),
          playerId: input.playerId,
          initialBalance,
        });

        await this.walletRepository.save(wallet);

        /*
         * Quando a wallet nasce com saldo positivo,
         * registramos a origem desse dinheiro.
         *
         * O saldo inicial não pode simplesmente aparecer
         * na wallet sem uma transação e um ledger.
         */
        if (initialBalance.isPositive()) {
          const opening = WagerTransaction.create({
            id: randomUUID(),

            providerId: 'internal',

            externalTransactionId:
              `opening:${wallet.id}`,

            idempotencyKey:
              `opening:${wallet.id}`,

            payloadHash:
              `opening:${wallet.id}`,

            walletId: wallet.id,
            playerId: wallet.playerId,

            /*
             * OPENING é uma operação interna.
             * Não pertence a uma rodada real de jogo.
             */
            roundId: 'opening',
            gameId: 'opening',

            kind: WagerTransactionKind.Opening,

            money: initialBalance,
          });

          opening.markProcessed(
            undefined,
            new Date(),
            wallet.balance,
          );

          const ledgerEntry =
            WalletLedgerEntry.create({
              id: randomUUID(),

              walletId: wallet.id,
              transactionId: opening.id,

              direction:
                LedgerDirection.Credit,

              money: initialBalance,

              balanceBefore:
                Money.zero(wallet.currency),

              balanceAfter:
                wallet.balance,
            });

          await this.wagerTransactionRepository.save(
            opening,
          );

          await this.ledgerRepository.append(
            ledgerEntry,
          );
        }

        return {
          walletId: wallet.id,
          playerId: wallet.playerId,
          balance: wallet.balance.toString(),
          currency: wallet.currency,
          version: wallet.version,
        };
      },
    );
  }
}
