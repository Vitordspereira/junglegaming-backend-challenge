import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';

import { GetProviderWagerTransactionUseCase } from '../../application/use-cases/get-provider-wager-transaction.use-case.js';

@Controller('providers')
export class ProviderWageringTransactionsController {
  constructor(
    private readonly getProviderWagerTransactionUseCase: GetProviderWagerTransactionUseCase,
  ) {}

  @Get(
    ':providerId/wagering/transactions/:externalTransactionId',
  )
  async findByProviderAndExternalTransactionId(
    @Param('providerId')
    providerId: string,
    @Param('externalTransactionId')
    externalTransactionId: string,
  ) {
    try {
      return await this.getProviderWagerTransactionUseCase.execute({
        providerId,
        externalTransactionId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'Wager transaction not found'
      ) {
        throw new NotFoundException(
          'Wager transaction not found',
        );
      }

      throw error;
    }
  }
}