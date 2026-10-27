import {
  Check,
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Unique({
  name: 'wallet_player_currency_unique',
  properties: ['playerId', 'currency'],
})
@Check({
  name: 'wallet_balance_non_negative',
  expression: 'balance >= 0',
})
@Check({
  name: 'wallet_version_positive',
  expression: 'version >= 1',
})
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({
      fieldName: 'player_id',
      type: 'uuid',
       })
  playerId!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({
    columnType: 'numeric(18,2)',
    runtimeType: 'string',
  })
  balance!: string;

  @Property({ default: 1 })
  version = 1;

  @Property({
    fieldName: 'created_at',
    onCreate: () => new Date(),
  })
  createdAt = new Date();

  @Property({
    fieldName: 'updated_at',
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
  })
  updatedAt = new Date();
}