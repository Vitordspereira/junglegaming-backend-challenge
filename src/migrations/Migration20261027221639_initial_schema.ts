import { Migration } from '@mikro-orm/migrations';

export class Migration20261027221639_initial_schema extends Migration {

  override name = 'Migration20261027221639_initial_schema';

  override up(): void | Promise<void> {
    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(64) not null, "wallet_id" uuid not null, "player_id" uuid not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "amount" numeric(18,2) not null, "currency" varchar(3) not null, "reference_external_transaction_id" varchar(255) null, "status" text not null, "reference_transaction_id" uuid null, "failure_code" text null, "result_balance" numeric(18,2) null, "created_at" timestamptz not null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_provider_idempotency_key_unique" unique ("provider_id", "idempotency_key");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_provider_external_transaction_unique" unique ("provider_id", "external_transaction_id");`);

    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(3) not null, "balance" numeric(18,2) not null, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallet_player_currency_unique" unique ("player_id", "currency");`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "direction" text not null, "amount" numeric(18,2) not null, "currency" varchar(3) not null, "balance_before" numeric(18,2) not null, "balance_after" numeric(18,2) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_transaction_unique" unique ("transaction_id");`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_amount_non_negative" check (amount >= 0);`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_failure_code_check" check ("failure_code" in ('INSUFFICIENT_FUNDS', 'INVALID_AMOUNT', 'CURRENCY_MISMATCH', 'REFERENCE_NOT_FOUND', 'INVALID_REFERENCE', 'DUPLICATE_REVERSAL', 'REVERSAL_INSUFFICIENT_FUNDS'));`);

    this.addSql(`alter table "wallets" add constraint "wallet_version_positive" check (version >= 1);`);
    this.addSql(`alter table "wallets" add constraint "wallet_balance_non_negative" check (balance >= 0);`);

    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }

}
