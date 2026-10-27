import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../../domain/wallet/wallet-ledger-entry.js';
import { Money } from '../../../domain/shared/value-objects/money.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';

export class WalletLedgerEntryMapper {
  static toDomain(
    entity: WalletLedgerEntryEntity,
  ): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBefore,
        currency: entity.currency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfter,
        currency: entity.currency,
      }),
      createdAt: entity.createdAt,
    });
  }

  static toPersistence(
    entry: WalletLedgerEntry,
  ): WalletLedgerEntryEntity {
    const entity = new WalletLedgerEntryEntity();

    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;
    entity.amount = entry.money.toString();
    entity.currency = entry.money.currency;
    entity.balanceBefore = entry.balanceBefore.toString();
    entity.balanceAfter = entry.balanceAfter.toString();
    entity.createdAt = entry.createdAt;

    return entity;
  }
}