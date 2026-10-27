import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { LedgerDirection } from '../../../domain/wallet/wallet-ledger-entry.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Index({
  name: 'wallet_ledger_wallet_created_id_idx',
  properties: ['walletId', 'createdAt', 'id'],
})
@Unique({
  name: 'wallet_ledger_transaction_unique',
  properties: ['walletId', 'transactionId'],
})
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({
    fieldName: 'wallet_id',
    type: 'uuid',
  })
  walletId!: string;

  @Property({
    fieldName: 'transaction_id',
    type: 'uuid',
  })
  transactionId!: string;

  @Enum({ items: () => LedgerDirection })
  direction!: LedgerDirection;

  @Property({
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
  })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({
    fieldName: 'balance_before',
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
  })
  balanceBefore!: string;

  @Property({
    fieldName: 'balance_after',
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
  })
  balanceAfter!: string;

  @Property({
    fieldName: 'created_at',
    onCreate: () => new Date(),
  })
  createdAt = new Date();
}