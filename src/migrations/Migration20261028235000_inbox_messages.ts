import {
  Migration,
} from '@mikro-orm/migrations';

export class Migration20261028235000_inbox_messages
  extends Migration
{
  override name =
    'Migration20261028235000_inbox_messages';

  override up():
    void | Promise<void>
  {
    this.addSql(`
      create table "inbox_messages" (
        "id" uuid not null,
        "consumer_name" varchar(255) not null,
        "message_id" varchar(255) not null,
        "received_at" timestamptz not null,
        "processed_at" timestamptz null,
        constraint "inbox_messages_pkey"
          primary key ("id")
      );
    `);

    this.addSql(`
      alter table "inbox_messages"
      add constraint "inbox_consumer_message_unique"
      unique ("consumer_name", "message_id");
    `);
  }

  override down():
    void | Promise<void>
  {
    this.addSql(`
      drop table if exists "inbox_messages";
    `);
  }
}