import { Inject, Injectable } from '@nestjs/common';

import {
  WALLET_LEDGER_ENTRY_REPOSITORY,
  type WalletLedgerCursor,
  type WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';

export interface ListWalletLedgerInput {
  walletId: string;
  limit: number;
  cursor?: string;
}

export interface WalletLedgerItemOutput {
  id: string;
  transactionId: string;
  direction: string;
  amount: string;
  currency: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string;
}

export interface ListWalletLedgerOutput {
  items: WalletLedgerItemOutput[];
  nextCursor?: string;
}

@Injectable()
export class ListWalletLedgerUseCase {
  constructor(
    @Inject(WALLET_LEDGER_ENTRY_REPOSITORY)
    private readonly ledgerRepository: WalletLedgerEntryRepository,
  ) {}

  async execute(
    input: ListWalletLedgerInput,
  ): Promise<ListWalletLedgerOutput> {
    const repositoryCursor = input.cursor
      ? this.decodeCursor(input.cursor)
      : undefined;

    const page =
      await this.ledgerRepository.findPageByWallet(
        input.walletId,
        input.limit,
        repositoryCursor,
      );

    const items = page.entries.map((entry) => ({
      id: entry.id,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore:
        entry.balanceBefore.toString(),
      balanceAfter:
        entry.balanceAfter.toString(),
      createdAt: entry.createdAt.toISOString(),
    }));

    let nextCursor: string | undefined;

    if (
      page.hasMore &&
      page.entries.length > 0
    ) {
      const lastEntry =
        page.entries[
          page.entries.length - 1
        ];

      if (lastEntry) {
        nextCursor = this.encodeCursor({
          createdAt: lastEntry.createdAt,
          id: lastEntry.id,
        });
      }
    }

    return {
      items,
      nextCursor,
    };
  }

  private encodeCursor(
    cursor: WalletLedgerCursor,
  ): string {
    return Buffer.from(
      JSON.stringify({
        createdAt:
          cursor.createdAt.toISOString(),
        id: cursor.id,
      }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(
    cursor: string,
  ): WalletLedgerCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(
          cursor,
          'base64url',
        ).toString('utf8'),
      ) as {
        createdAt?: string;
        id?: string;
      };

      if (
        typeof decoded.createdAt !== 'string' ||
        typeof decoded.id !== 'string'
      ) {
        throw new Error('Invalid cursor');
      }

      const createdAt = new Date(
        decoded.createdAt,
      );

      if (
        Number.isNaN(createdAt.getTime())
      ) {
        throw new Error('Invalid cursor');
      }

      return {
        createdAt,
        id: decoded.id,
      };
    } catch {
      throw new Error('Invalid cursor');
    }
  }
}