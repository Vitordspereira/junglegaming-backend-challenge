import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';

import type { Response } from 'express';

import { randomUUID } from 'node:crypto';

import { IdempotencyConflictError } from '../../application/errors/idempotency-conflict.error.js';

import { createPayloadHash } from '../../application/shared/canonical-payload-hash.js';

import { GetWagerTransactionUseCase } from '../../application/use-cases/get-wager-transaction.use-case.js';

import { ProcessWagerUseCase } from '../../application/use-cases/process-wager.use-case.js';

import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction.js';

import { ProcessWagerRequestDto } from './dto/process-wager.dto.js';

@Controller('wagering/transactions')
export class WageringTransactionsController {
  constructor(
    private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase,
    private readonly processWagerUseCase: ProcessWagerUseCase,
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

  @Post()
  async create(
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,

    @Body()
    body: ProcessWagerRequestDto,

    @Res({ passthrough: true })
    response?: Response,
  ) {
    if (
      !idempotencyKey ||
      idempotencyKey.trim().length === 0
    ) {
      throw new BadRequestException(
        'Idempotency-Key header is required',
      );
    }

    const payloadHash =
      createPayloadHash({
        providerId:
          body.providerId,

        externalTransactionId:
          body.externalTransactionId,

        playerId:
          body.playerId,

        walletId:
          body.walletId,

        roundId:
          body.roundId,

        gameId:
          body.gameId,

        kind:
          body.kind,

        money: {
          amount:
            body.money.amount,

          currency:
            body.money.currency,
        },

        ...(body.referenceExternalTransactionId
          ? {
              referenceExternalTransactionId:
                body.referenceExternalTransactionId,
            }
          : {}),
      });

    try {
      const result =
        await this.processWagerUseCase.execute({
          id:
            randomUUID(),

          providerId:
            body.providerId,

          externalTransactionId:
            body.externalTransactionId,

          idempotencyKey:
            idempotencyKey.trim(),

          payloadHash,

          walletId:
            body.walletId,

          playerId:
            body.playerId,

          roundId:
            body.roundId,

          gameId:
            body.gameId,

          kind:
            body.kind,

          amount:
            body.money.amount,

          currency:
            body.money.currency,

          ...(body.referenceExternalTransactionId
            ? {
                referenceExternalTransactionId:
                  body.referenceExternalTransactionId,
              }
            : {}),
        });

      if (
        result.status ===
          WagerTransactionStatus.PendingReference &&
        response
      ) {
        response.status(
          HttpStatus.ACCEPTED,
        );
      }

      if (
        result.status ===
          WagerTransactionStatus.Rejected &&
        response
      ) {
        response.status(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return {
        transactionId:
          result.transactionId,

        status:
          result.status,

        ...(result.balance
          ? {
              balance: {
                amount:
                  result.balance,

                currency:
                  body.money.currency,
              },
            }
          : {}),

        idempotentReplay:
          result.idempotentReplay,

        ...(result.failureCode
          ? {
              failureCode:
                result.failureCode,
            }
          : {}),
      };
    } catch (error) {
      if (
        error instanceof
        IdempotencyConflictError
      ) {
        throw new ConflictException(
          'Idempotency key was already used with a different payload',
        );
      }

      throw error;
    }
  }
}