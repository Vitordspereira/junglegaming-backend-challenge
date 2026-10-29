import {
  Check,
  Entity,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

@Entity({
  tableName: 'outbox_messages',
})
@Check({
  name: 'outbox_attempts_non_negative',
  expression: 'attempts >= 0',
})
export class OutboxMessageEntity {
  @PrimaryKey({
    type: 'uuid',
  })
  id!: string;

  @Property({
    fieldName: 'aggregate_id',
  })
  aggregateId!: string;

  @Property({
    fieldName: 'event_type',
  })
  eventType!: string;

  @Property({
    columnType: 'jsonb',
    runtimeType: 'object',
  })
  payload!: Record<string, unknown>;

  @Property({
    fieldName: 'occurred_at',
  })
  occurredAt!: Date;

  @Property({
    default: 0,
  })
  attempts = 0;

  @Property({
    fieldName: 'next_attempt_at',
    nullable: true,
  })
  nextAttemptAt:
    Date | null = null;

  @Property({
    fieldName: 'published_at',
    nullable: true,
  })
  publishedAt:
    Date | null = null;
}