import {
  Migration,
} from '@mikro-orm/migrations';

export class Migration20261029004000_outbox_messages
  extends Migration
{
  override name =
    'Migration20261029004000_outbox_messages';

  override up():
    void | Promise<void>
  {
    this.addSql(`
      create table "outbox_messages" (
        "id" uuid not null,
        "event_type" varchar(255) not null,
        "payload" jsonb not null,
        "occurred_at" timestamptz not null,
        "published_at" timestamptz null,
        constraint "outbox_messages_pkey"
          primary key ("id")
      );
    `);

    this.addSql(`
      create index "outbox_unpublished_occurred_at_idx"
      on "outbox_messages" (
        "published_at",
        "occurred_at"
      );
    `);
  }

  override down():
    void | Promise<void>
  {
    this.addSql(`
      drop table if exists "outbox_messages";
    `);
  }
}