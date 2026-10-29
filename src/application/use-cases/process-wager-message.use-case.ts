import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  InboxMessage,
} from '../../domain/messaging/inbox-message.js';

import {
  IdempotencyConflictError,
} from '../errors/idempotency-conflict.error.js';

import {
  PermanentMessageProcessingError,
} from '../errors/permanent-message-processing.error.js';

import type {
  WagerTransactionRequestedMessage,
} from '../messaging/wager-transaction-requested.message.js';

import {
  INBOX_MESSAGE_REPOSITORY,
  type InboxMessageRepository,
} from '../ports/inbox-message.repository.js';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction-manager.js';

import {
  createPayloadHash,
} from '../shared/canonical-payload-hash.js';

import {
  ProcessWagerUseCase,
  type ProcessWagerOutput,
} from './process-wager.use-case.js';

export interface ProcessWagerMessageOutput {
  alreadyProcessed: boolean;
  result?: ProcessWagerOutput;
}

@Injectable()
export class ProcessWagerMessageUseCase {
  private static readonly CONSUMER_NAME =
    'wager-transaction-consumer';

  constructor(
    @Inject(INBOX_MESSAGE_REPOSITORY)
    private readonly inboxRepository:
      InboxMessageRepository,

    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager:
      TransactionManager,

    private readonly processWagerUseCase:
      ProcessWagerUseCase,
  ) {}

  async execute(
    message:
      WagerTransactionRequestedMessage,
  ): Promise<ProcessWagerMessageOutput> {
    return this.transactionManager.execute(
      async () => {
        const existingInbox =
          await this.inboxRepository
            .findByConsumerAndMessageId(
              ProcessWagerMessageUseCase
                .CONSUMER_NAME,
              message.messageId,
            );

        if (
          existingInbox?.isProcessed()
        ) {
          return {
            alreadyProcessed:
              true,
          };
        }

        let inbox =
          existingInbox;

        if (!inbox) {
          inbox =
            InboxMessage.create({
              id:
                randomUUID(),

              consumerName:
                ProcessWagerMessageUseCase
                  .CONSUMER_NAME,

              messageId:
                message.messageId,
            });

          await this.inboxRepository.save(
            inbox,
          );
        }

        const data =
          message.data;

        const payloadHash =
          createPayloadHash({
            providerId:
              data.providerId,

            externalTransactionId:
              data.externalTransactionId,

            playerId:
              data.playerId,

            walletId:
              data.walletId,

            roundId:
              data.roundId,

            gameId:
              data.gameId,

            kind:
              data.kind,

            money: {
              amount:
                data.money.amount,

              currency:
                data.money.currency,
            },

            ...(data.referenceExternalTransactionId
              ? {
                  referenceExternalTransactionId:
                    data.referenceExternalTransactionId,
                }
              : {}),
          });

        let result:
          ProcessWagerOutput;

        try {
          result =
            await this.processWagerUseCase.execute({
              id:
                randomUUID(),

              providerId:
                data.providerId,

              externalTransactionId:
                data.externalTransactionId,

              idempotencyKey:
                data.idempotencyKey,

              payloadHash,

              walletId:
                data.walletId,

              playerId:
                data.playerId,

              roundId:
                data.roundId,

              gameId:
                data.gameId,

              kind:
                data.kind,

              amount:
                data.money.amount,

              currency:
                data.money.currency,

              ...(data.referenceExternalTransactionId
                ? {
                    referenceExternalTransactionId:
                      data.referenceExternalTransactionId,
                  }
                : {}),
            });
        } catch (error) {
          /*
           * Mesmo idempotencyKey com payload
           * diferente não é uma indisponibilidade
           * temporária.
           *
           * Repetir a mensagem nunca fará esse
           * conflito desaparecer.
           */
          if (
            error instanceof
            IdempotencyConflictError
          ) {
            throw new PermanentMessageProcessingError(
              'Idempotency key was already used with a different payload',
            );
          }

          /*
           * Demais exceções ainda são consideradas
           * transitórias por padrão.
           *
           * O consumer aplicará retry/backoff.
           */
          throw error;
        }

        inbox =
          inbox.markProcessed(
            new Date(),
          );

        await this.inboxRepository.save(
          inbox,
        );

        return {
          alreadyProcessed:
            false,

          result,
        };
      },
    );
  }
}