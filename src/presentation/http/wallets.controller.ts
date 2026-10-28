import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case.js';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case.js';
import { ListWalletLedgerUseCase } from '../../application/use-cases/list-wallet-ledger.use-case.js';

import type {
  CreateWalletRequestDto,
  CreateWalletResponseDto,
} from './dto/create-wallet.dto.js';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly listWalletLedgerUseCase: ListWalletLedgerUseCase,
  ) {}

  @Post()
  async create(
    @Body() body: CreateWalletRequestDto,
  ): Promise<CreateWalletResponseDto> {
    try {
      const result =
        await this.createWalletUseCase.execute({
          playerId: body.playerId,
          initialBalance:
            body.initialBalance.amount,
          currency:
            body.initialBalance.currency,
        });

      return {
        id: result.walletId,
        playerId: result.playerId,
        balance: {
          amount: result.balance,
          currency: result.currency,
        },
        version: result.version,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'Wallet already exists for player and currency'
      ) {
        throw new ConflictException(
          error.message,
        );
      }

      if (
        error instanceof Error &&
        error.message ===
          'Amount must have exactly two decimal places'
      ) {
        throw new BadRequestException(
          error.message,
        );
      }

      if (
        error instanceof Error &&
        error.message ===
          'Initial balance cannot be negative'
      ) {
        throw new BadRequestException(
          error.message,
        );
      }

      throw error;
    }
  }

  @Get(':walletId/ledger')
  async listLedger(
    @Param('walletId') walletId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    try {
      const parsedLimit =
        limit === undefined
          ? 50
          : Number.parseInt(limit, 10);

      if (
        limit !== undefined &&
        (
          !/^\d+$/.test(limit) ||
          !Number.isInteger(parsedLimit) ||
          parsedLimit <= 0
        )
      ) {
        throw new BadRequestException(
          'Invalid limit',
        );
      }

      const result =
        await this.listWalletLedgerUseCase.execute({
          walletId,
          limit: parsedLimit,
          cursor,
        });

      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.message === 'Invalid cursor'
      ) {
        throw new BadRequestException(
          'Invalid cursor',
        );
      }

      throw error;
    }
  }

  @Get(':walletId')
  async findById(
    @Param('walletId') walletId: string,
  ) {
    try {
      const result =
        await this.getWalletUseCase.execute({
          walletId,
        });

      return {
        id: result.id,
        playerId: result.playerId,
        balance: {
          amount: result.balance,
          currency: result.currency,
        },
        version: result.version,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'Wallet not found'
      ) {
        throw new NotFoundException(
          'Wallet not found',
        );
      }

      throw error;
    }
  }
}