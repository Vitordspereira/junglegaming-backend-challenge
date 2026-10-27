import { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry.js';

export const WALLET_LEDGER_ENTRY_REPOSITORY = Symbol(
  'WALLET_LEDGER_ENTRY_REPOSITORY',
);

export interface WalletLedgerEntryRepository {
  findById(id: string): Promise<WalletLedgerEntry | null>;

  findByWalletAndTransaction(
    walletId: string,
    transactionId: string,
  ): Promise<WalletLedgerEntry | null>;

  append(entry: WalletLedgerEntry): Promise<void>;
}