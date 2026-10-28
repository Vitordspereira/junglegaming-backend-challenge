import { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry.js';

export const WALLET_LEDGER_ENTRY_REPOSITORY = Symbol(
  'WALLET_LEDGER_ENTRY_REPOSITORY',
);

export interface WalletLedgerCursor {
  createdAt: Date;
  id: string;
}

export interface WalletLedgerPage {
  entries: WalletLedgerEntry[];
  hasMore: boolean;
}

export interface WalletLedgerEntryRepository {
  findById(id: string): Promise<WalletLedgerEntry | null>;

  findByWalletAndTransaction(
    walletId: string,
    transactionId: string,
  ): Promise<WalletLedgerEntry | null>;

  findPageByWallet(
    walletId: string,
    limit: number,
    cursor?: WalletLedgerCursor,
  ): Promise<WalletLedgerPage>;

  append(entry: WalletLedgerEntry): Promise<void>;
}
