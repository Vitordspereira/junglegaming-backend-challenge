import { Migration } from '@mikro-orm/migrations';

export class Migration20261027223624_ledger_immutability extends Migration {

  override name = 'Migration20261027223624_ledger_immutability';

  override up(): void | Promise<void> {
    this.addSql(`
      create or replace function prevent_wallet_ledger_mutation()
      returns trigger
      language plpgsql
      as $function$
      begin
        raise exception 'wallet_ledger_entries is append-only';
      end;
      $function$;
    `);

    this.addSql(`
      create trigger wallet_ledger_immutability_trigger
      before update or delete or truncate
      on wallet_ledger_entries
      for each statement
      execute function prevent_wallet_ledger_mutation();
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop trigger if exists wallet_ledger_immutability_trigger
      on wallet_ledger_entries;
    `);

    this.addSql(`
      drop function if exists prevent_wallet_ledger_mutation();
    `);
  }

}