import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../ports/wallet.repository.js';

import {
  WALLET_LEDGER_ENTRY_REPOSITORY,
  type WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';

import { Money } from '../../domain/shared/value-objects/money.js';

import { LedgerDirection } from '../../domain/wallet/wallet-ledger-entry.js';

export interface ReconcileWalletInput {
  walletId: string;
}

export interface ReconcileWalletOutput {
  walletId: string;

  storedBalance: {
    amount: string;
    currency: string;
  };

  calculatedBalance: {
    amount: string;
    currency: string;
  };

  difference: {
    amount: string;
    currency: string;
  };

  consistent: boolean;

  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository:
      WalletRepository,

    @Inject(
      WALLET_LEDGER_ENTRY_REPOSITORY,
    )
    private readonly ledgerRepository:
      WalletLedgerEntryRepository,
  ) {}

  async execute(
    input: ReconcileWalletInput,
  ): Promise<ReconcileWalletOutput> {
    const wallet =
      await this.walletRepository.findById(
        input.walletId,
      );

    if (!wallet) {
      throw new Error(
        'Wallet not found',
      );
    }

    let calculatedBalance =
      Money.zero(
        wallet.balance.currency,
      );

    let checkedEntries = 0;

    let cursor:
      | {
          createdAt: Date;
          id: string;
        }
      | undefined;

    do {
      const page =
        await this.ledgerRepository
          .findPageByWallet(
            input.walletId,
            500,
            cursor,
          );

      for (const entry of page.entries) {
        if (
          entry.direction ===
          LedgerDirection.Credit
        ) {
          calculatedBalance =
            calculatedBalance.add(
              entry.money,
            );
        }

        if (
          entry.direction ===
          LedgerDirection.Debit
        ) {
          calculatedBalance =
            calculatedBalance.subtract(
              entry.money,
            );
        }

        checkedEntries += 1;
      }

      if (
        !page.hasMore ||
        page.entries.length === 0
      ) {
        cursor = undefined;
        break;
      }

      const lastEntry =
        page.entries[
          page.entries.length - 1
        ];

      if (!lastEntry) {
        cursor = undefined;
        break;
      }

      cursor = {
        createdAt:
          lastEntry.createdAt,

        id:
          lastEntry.id,
      };
    } while (cursor);

    const difference =
      wallet.balance.subtract(
        calculatedBalance,
      );

    return {
      walletId:
        wallet.id,

      storedBalance: {
        amount:
          wallet.balance.toString(),

        currency:
          wallet.balance.currency,
      },

      calculatedBalance: {
        amount:
          calculatedBalance.toString(),

        currency:
          calculatedBalance.currency,
      },

      difference: {
        amount:
          difference.toString(),

        currency:
          difference.currency,
      },

      consistent:
        difference.isZero(),

      checkedEntries,
    };
  }
}