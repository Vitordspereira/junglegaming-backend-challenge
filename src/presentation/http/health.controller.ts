import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';

import { CheckReadinessUseCase } from '../../application/use-cases/check-readiness.use-case.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly checkReadinessUseCase:
      CheckReadinessUseCase,
  ) {}

  @Get('live')
  live() {
    return {
      status: 'ok',
    };
  }

  @Get('ready')
  async ready() {
    const result =
      await this.checkReadinessUseCase.execute();

    if (
      result.status ===
      'not_ready'
    ) {
      throw new ServiceUnavailableException(
        result,
      );
    }

    return result;
  }
}