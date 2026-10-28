import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';

import { GetWagerTransactionUseCase } from '../../application/use-cases/get-wager-transaction.use-case.js';

@Controller('wagering/transactions')
export class WageringTransactionsController {
  constructor(
    private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase,
  ) {}

  @Get(':transactionId')
  async findById(
    @Param('transactionId')
    transactionId: string,
  ) {
    try {
      return await this.getWagerTransactionUseCase.execute({
        transactionId,
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