import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  MikroORM,
} from '@mikro-orm/core';

import {
  WAGER_TRANSACTION_QUEUE,
  type WagerTransactionQueue,
} from '../../application/ports/wager-transaction-queue.js';

import type {
  ReadinessChecker,
  ReadinessStatus,
} from '../../application/ports/readiness-checker.js';

@Injectable()
export class MikroOrmReadinessChecker
  implements ReadinessChecker
{
  constructor(
    private readonly orm:
      MikroORM,

    @Inject(WAGER_TRANSACTION_QUEUE)
    private readonly wagerTransactionQueue:
      WagerTransactionQueue,
  ) {}

  async check(): Promise<ReadinessStatus> {
    let postgres =
      false;

    let sqs =
      false;

    try {
      await this.orm.em
        .getConnection()
        .execute(
          'select 1',
        );

      postgres =
        true;
    } catch {
      postgres =
        false;
    }

    try {
      sqs =
        await this.wagerTransactionQueue
          .isReachable();
    } catch {
      sqs =
        false;
    }

    return {
      postgres,
      sqs,
    };
  }
}