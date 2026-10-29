import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case.js';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case.js';
import { ListWalletLedgerUseCase } from '../../application/use-cases/list-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case.js';

interface CreateWalletBody {
  playerId: string;

  initialBalance: {
    amount: string;
    currency: string;
  };
}

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly createWalletUseCase:
      CreateWalletUseCase,

    private readonly getWalletUseCase:
      GetWalletUseCase,

    private readonly listWalletLedgerUseCase:
      ListWalletLedgerUseCase,

    private readonly reconcileWalletUseCase:
      ReconcileWalletUseCase,
  ) {}

  @Post()
  async create(
    @Body()
    body: CreateWalletBody,
  ) {
    try {
      const result =
        await this.createWalletUseCase.execute({
          playerId:
            body.playerId,

          initialBalance:
            body.initialBalance.amount,

          currency:
            body.initialBalance.currency,
        });

      return {
        id:
          result.walletId,

        playerId:
          result.playerId,

        balance: {
          amount:
            result.balance,

          currency:
            result.currency,
        },

        version:
          result.version,
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
        (
          error.message ===
            'Initial balance cannot be negative' ||
          error.message ===
            'Amount must have exactly two decimal places' ||
          error.message.includes(
            'Invalid money amount',
          )
        )
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
    @Param('walletId')
    walletId: string,

    @Query('limit')
    limit?: string,

    @Query('cursor')
    cursor?: string,
  ) {
    const parsedLimit =
      limit === undefined
        ? 50
        : Number.parseInt(
            limit,
            10,
          );

    if (
      limit !== undefined &&
      (
        !/^\d+$/.test(limit) ||
        !Number.isInteger(
          parsedLimit,
        ) ||
        parsedLimit <= 0
      )
    ) {
      throw new BadRequestException(
        'Invalid limit',
      );
    }

    try {
      return await this.listWalletLedgerUseCase.execute({
        walletId,

        limit:
          parsedLimit,

        ...(cursor
          ? {
              cursor,
            }
          : {}),
      });
    } catch (error) {
      if (
        error instanceof
        BadRequestException
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.message ===
          'Invalid cursor'
      ) {
        throw new BadRequestException(
          'Invalid cursor',
        );
      }

      throw error;
    }
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Param('walletId')
    walletId: string,
  ) {
    try {
      return await this.reconcileWalletUseCase.execute({
        walletId,
      });
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

  @Get(':walletId')
  async findById(
    @Param('walletId')
    walletId: string,
  ) {
    try {
      const result =
        await this.getWalletUseCase.execute({
          walletId,
        });

      return {
        id:
          result.id,

        playerId:
          result.playerId,

        balance: {
          amount:
            result.balance,

          currency:
            result.currency,
        },

        version:
          result.version,
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