import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  READINESS_CHECKER,
  type ReadinessChecker,
} from '../ports/readiness-checker.js';

export interface CheckReadinessOutput {
  status:
    | 'ready'
    | 'not_ready';

  checks: {
    postgres: boolean;
    sqs: boolean;
  };
}

@Injectable()
export class CheckReadinessUseCase {
  constructor(
    @Inject(READINESS_CHECKER)
    private readonly readinessChecker:
      ReadinessChecker,
  ) {}

  async execute(): Promise<CheckReadinessOutput> {
    const checks =
      await this.readinessChecker.check();

    return {
      status:
        checks.postgres &&
        checks.sqs
          ? 'ready'
          : 'not_ready',

      checks,
    };
  }
}