import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WALLET_REPOSITORY } from './application/ports/wallet.repository.js';
import { WAGER_TRANSACTION_REPOSITORY } from './application/ports/wager-transaction.repository.js';
import { WALLET_LEDGER_ENTRY_REPOSITORY } from './application/ports/wallet-ledger-entry.repository.js';

import { MikroOrmWalletRepository } from './infrastructure/database/repositories/mikro-orm-wallet.repository.js';
import { MikroOrmWagerTransactionRepository } from './infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletLedgerEntryRepository } from './infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';

import mikroOrmConfig from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
  ],
  providers: [
    {
      provide: WALLET_REPOSITORY,
      useClass: MikroOrmWalletRepository,
    },
    {
      provide: WAGER_TRANSACTION_REPOSITORY,
      useClass: MikroOrmWagerTransactionRepository,
    },
    {
      provide: WALLET_LEDGER_ENTRY_REPOSITORY,
      useClass: MikroOrmWalletLedgerEntryRepository,
    },
  ],
})
export class AppModule {}