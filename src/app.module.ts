import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
  ],
})
export class AppModule {}