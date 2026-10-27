import {
  Check,
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.js';

@Entity({ tableName: 'wager_transactions' })
@Index({
  name: 'wager_status_created_at_idx',
  properties: ['status', 'createdAt'],
})
@Unique({
  name: 'wager_provider_external_transaction_unique',
  properties: ['providerId', 'externalTransactionId'],
})
@Unique({
  name: 'wager_provider_idempotency_key_unique',
  properties: ['providerId', 'idempotencyKey'],
})
@Check({
  name: 'wager_amount_non_negative',
  expression: 'amount >= 0',
})
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'provider_id' })
  providerId!: string;

  @Property({ fieldName: 'external_transaction_id' })
  externalTransactionId!: string;

  @Property({ fieldName: 'idempotency_key' })
  idempotencyKey!: string;

  @Property({ fieldName: 'payload_hash', length: 64 })
  payloadHash!: string;

  @Property({ fieldName: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Property({ fieldName: 'player_id', type: 'uuid' })
  playerId!: string;

  @Property({ fieldName: 'round_id' })
  roundId!: string;

  @Property({ fieldName: 'game_id' })
  gameId!: string;

  @Enum({ items: () => WagerTransactionKind })
  kind!: WagerTransactionKind;

  @Property({
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
  })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({
    fieldName: 'reference_external_transaction_id',
    nullable: true,
  })
  referenceExternalTransactionId?: string;

  @Enum({ items: () => WagerTransactionStatus })
  status!: WagerTransactionStatus;

  @Property({
    fieldName: 'reference_transaction_id',
    type: 'uuid',
    nullable: true,
  })
  referenceTransactionId?: string;

  @Enum({
    items: () => FailureCode,
    nullable: true,
  })
  failureCode?: FailureCode;

  @Property({
    fieldName: 'result_balance',
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
    nullable: true,
  })
  resultBalance?: string;

  @Property({
    fieldName: 'created_at',
    onCreate: () => new Date(),
  })
  createdAt = new Date();

  @Property({
    fieldName: 'processed_at',
    nullable: true,
  })
  processedAt?: Date;
}