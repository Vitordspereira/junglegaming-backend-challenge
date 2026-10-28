import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WALLET_REPOSITORY } from './application/ports/wallet.repository.js';
import { WAGER_TRANSACTION_REPOSITORY } from './application/ports/wager-transaction.repository.js';
import { WALLET_LEDGER_ENTRY_REPOSITORY } from './application/ports/wallet-ledger-entry.repository.js';
import { TRANSACTION_MANAGER } from './application/ports/transaction-manager.js';

import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case.js';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case.js';
import { ListWalletLedgerUseCase } from './application/use-cases/list-wallet-ledger.use-case.js';
import { GetWagerTransactionUseCase } from './application/use-cases/get-wager-transaction.use-case.js';
import { GetProviderWagerTransactionUseCase } from './application/use-cases/get-provider-wager-transaction.use-case.js';

import { MikroOrmWalletRepository } from './infrastructure/database/repositories/mikro-orm-wallet.repository.js';
import { MikroOrmWagerTransactionRepository } from './infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import { MikroOrmWalletLedgerEntryRepository } from './infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';
import { MikroOrmTransactionManager } from './infrastructure/database/mikro-orm-transaction-manager.js';

import { WalletsController } from './presentation/http/wallets.controller.js';
import { WageringTransactionsController } from './presentation/http/wagering-transactions.controller.js';
import { ProviderWageringTransactionsController } from './presentation/http/provider-wagering-transactions.controller.js';

import mikroOrmConfig from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
  ],

  controllers: [
    WalletsController,
    WageringTransactionsController,
    ProviderWageringTransactionsController,
  ],

  providers: [
    CreateWalletUseCase,
    GetWalletUseCase,
    ListWalletLedgerUseCase,
    GetWagerTransactionUseCase,
    GetProviderWagerTransactionUseCase,

    {
      provide: WALLET_REPOSITORY,
      useClass: MikroOrmWalletRepository,
    },

    {
      provide: WAGER_TRANSACTION_REPOSITORY,
      useClass:
        MikroOrmWagerTransactionRepository,
    },

    {
      provide:
        WALLET_LEDGER_ENTRY_REPOSITORY,
      useClass:
        MikroOrmWalletLedgerEntryRepository,
    },

    {
      provide: TRANSACTION_MANAGER,
      useClass:
        MikroOrmTransactionManager,
    },
  ],
})
export class AppModule {}