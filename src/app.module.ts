import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WALLET_REPOSITORY } from './application/ports/wallet.repository.js';
import { MikroOrmWalletRepository } from './infrastructure/database/repositories/mikro-orm-wallet.repository.js';
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
  ],
})
export class AppModule {}