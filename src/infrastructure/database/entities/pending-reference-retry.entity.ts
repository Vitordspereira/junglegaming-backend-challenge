import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

@Entity({
  tableName:
    'pending_reference_retries',
})
@Index({
  name:
    'idx_pending_reference_retries_due',
  properties: [
    'nextAttemptAt',
  ],
})
export class PendingReferenceRetryEntity {
  @PrimaryKey({
    type: 'uuid',
    fieldName:
      'transaction_id',
  })
  transactionId!: string;

  @Property({
    type: 'integer',
    default: 0,
  })
  attempts = 0;

  @Property({
    type: 'timestamptz',
    fieldName:
      'next_attempt_at',
  })
  nextAttemptAt!: Date;

  @Property({
    type: 'timestamptz',
    fieldName:
      'created_at',
  })
  createdAt!: Date;
}