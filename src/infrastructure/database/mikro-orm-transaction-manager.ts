import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import type { TransactionManager } from '../../application/ports/transaction-manager.js';

@Injectable()
export class MikroOrmTransactionManager implements TransactionManager {
  constructor(private readonly entityManager: EntityManager) {}

  async execute<T>(work: () => Promise<T>): Promise<T> {
    return this.entityManager.transactional(
      async () => work(),
      {
        clear: true,
      },
    );
  }
}