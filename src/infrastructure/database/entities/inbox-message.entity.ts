import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({
  tableName: 'inbox_messages',
})
@Unique({
  name:
    'inbox_consumer_message_unique',
  properties: [
    'consumerName',
    'messageId',
  ],
})
export class InboxMessageEntity {
  @PrimaryKey({
    type: 'uuid',
  })
  id!: string;

  @Property({
    fieldName:
      'consumer_name',
  })
  consumerName!: string;

  @Property({
    fieldName:
      'message_id',
  })
  messageId!: string;

  @Property({
    fieldName:
      'received_at',
  })
  receivedAt!: Date;

  @Property({
    fieldName:
      'processed_at',
    nullable:
      true,
  })
  processedAt?: Date;
}