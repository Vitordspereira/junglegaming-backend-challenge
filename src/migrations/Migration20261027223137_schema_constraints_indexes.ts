import { Migration } from '@mikro-orm/migrations';

export class Migration20261027223137_schema_constraints_indexes extends Migration {

  override name = 'Migration20261027223137_schema_constraints_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index "wager_status_created_at_idx" on "wager_transactions" ("status", "created_at");`);

    this.addSql(`alter table "wallets" alter column "player_id" type uuid using ("player_id"::text::uuid);`);

    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_transaction_unique";`);
    this.addSql(`create index "wallet_ledger_wallet_created_id_idx" on "wallet_ledger_entries" ("wallet_id", "created_at", "id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_transaction_unique" unique ("wallet_id", "transaction_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wallets" alter column "player_id" type text using ("player_id"::text);`);

    this.addSql(`drop index "wager_status_created_at_idx";`);

    this.addSql(`drop index "wallet_ledger_wallet_created_id_idx";`);
    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_transaction_unique";`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_transaction_unique" unique ("transaction_id");`);

    this.addSql(`alter table "wallets" alter column "player_id" type varchar(255) using ("player_id"::varchar(255));`);
  }

}
