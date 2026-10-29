import { Migration } from '@mikro-orm/migrations';

export class Migration20261029170051 extends Migration {
  override name = 'Migration20261029170051';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "pending_reference_retries" ("transaction_id" uuid not null, "attempts" int not null default 0, "next_attempt_at" timestamptz not null, "created_at" timestamptz not null, primary key ("transaction_id"));`,
    );

    this.addSql(
      `create index "idx_pending_reference_retries_due" on "pending_reference_retries" ("next_attempt_at");`,
    );

    this.addSql(
      `drop index "outbox_pending_retry_idx";`,
    );

    this.addSql(
      `drop index "outbox_unpublished_occurred_at_idx";`,
    );

    this.addSql(
      `drop trigger if exists "wallet_ledger_immutability_trigger" on "wallet_ledger_entries";`,
    );

    this.addSql(
      `drop function if exists "wallet_ledger_entries_wallet_ledger_immutability_trigger_fn"();`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `drop table if exists "pending_reference_retries" cascade;`,
    );

    this.addSql(
      `create index "outbox_pending_retry_idx" on "outbox_messages" ("published_at", "next_attempt_at", "occurred_at");`,
    );

    this.addSql(
      `create index "outbox_unpublished_occurred_at_idx" on "outbox_messages" ("published_at", "occurred_at");`,
    );

    this.addSql(
      `create or replace function "wallet_ledger_entries_wallet_ledger_immutability_trigger_fn"() returns trigger as $$ begin ; end; $$ language plpgsql;`,
    );

    this.addSql(
      `create trigger "wallet_ledger_immutability_trigger" BEFORE DELETE OR UPDATE on "wallet_ledger_entries" for each STATEMENT execute function "wallet_ledger_entries_wallet_ledger_immutability_trigger_fn"();`,
    );
  }
}