import {
  Migration,
} from '@mikro-orm/migrations';

export class Migration20261029005200_outbox_retry_state
  extends Migration
{
  override name =
    'Migration20261029005200_outbox_retry_state';

  override up():
    void | Promise<void>
  {
    /*
     * aggregate_id começa nullable para permitir
     * atualização segura caso já exista algum
     * registro antigo na outbox.
     */
    this.addSql(`
      alter table "outbox_messages"
      add column "aggregate_id" varchar(255) null;
    `);

    /*
     * Para registros criados antes desta migration,
     * tenta recuperar aggregateId do envelope.
     *
     * Se não existir, usa o próprio id como fallback.
     */
    this.addSql(`
      update "outbox_messages"
      set "aggregate_id" =
        coalesce(
          "payload" ->> 'aggregateId',
          "id"::text
        )
      where "aggregate_id" is null;
    `);

    this.addSql(`
      alter table "outbox_messages"
      alter column "aggregate_id"
      set not null;
    `);

    this.addSql(`
      alter table "outbox_messages"
      add column "attempts"
      integer not null default 0;
    `);

    this.addSql(`
      alter table "outbox_messages"
      add column "next_attempt_at"
      timestamptz null;
    `);

    this.addSql(`
      alter table "outbox_messages"
      add constraint "outbox_attempts_non_negative"
      check ("attempts" >= 0);
    `);

    this.addSql(`
      create index "outbox_pending_retry_idx"
      on "outbox_messages" (
        "published_at",
        "next_attempt_at",
        "occurred_at"
      );
    `);
  }

  override down():
    void | Promise<void>
  {
    this.addSql(`
      drop index if exists
      "outbox_pending_retry_idx";
    `);

    this.addSql(`
      alter table "outbox_messages"
      drop constraint if exists
      "outbox_attempts_non_negative";
    `);

    this.addSql(`
      alter table "outbox_messages"
      drop column if exists
      "next_attempt_at";
    `);

    this.addSql(`
      alter table "outbox_messages"
      drop column if exists
      "attempts";
    `);

    this.addSql(`
      alter table "outbox_messages"
      drop column if exists
      "aggregate_id";
    `);
  }
}