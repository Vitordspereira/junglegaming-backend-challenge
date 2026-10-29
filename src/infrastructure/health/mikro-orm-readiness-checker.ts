import {
  Injectable,
} from '@nestjs/common';

import {
  MikroORM,
} from '@mikro-orm/core';

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
  ) {}

  async check(): Promise<ReadinessStatus> {
    let postgres =
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

    return {
      postgres,

      sqs:
        false,
    };
  }
}