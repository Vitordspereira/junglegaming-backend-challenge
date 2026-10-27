import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';

export default defineConfig({
    metadataProvider: ReflectMetadataProvider,

  host: 'localhost',
  port: 5432,
  user: 'jungle',
  password: 'jungle_dev_password',
  dbName: 'jungle_wagering',

  discovery: {
    warnWhenNoEntities: false,
  },

  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],

  extensions: [Migrator],

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    transactional: true,
    allOrNothing: true,
  },
});