import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

import {
  WalletBalanceChangedEvent,
} from '../../domain/messaging/events/wallet-balance-changed.event.js';

import {
  WagerTransactionProcessedEvent,
} from '../../domain/messaging/events/wager-transaction-processed.event.js';

import {
  WagerTransactionRejectedEvent,
} from '../../domain/messaging/events/wager-transaction-rejected.event.js';

import {
  WagerTransactionPendingReferenceEvent,
} from '../../domain/messaging/events/wager-transaction-pending-reference.event.js';


import {
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

import {
  Money,
} from '../../domain/shared/value-objects/money.js';

import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wagering/wager-transaction.js';

import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../domain/wallet/wallet-ledger-entry.js';

import {
  IdempotencyConflictError,
} from '../errors/idempotency-conflict.error.js';

import {
  OUTBOX_MESSAGE_REPOSITORY,
  type OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction-manager.js';

import {
  WAGER_TRANSACTION_REPOSITORY,
  type WagerTransactionRepository,
} from '../ports/wager-transaction.repository.js';

import {
  WALLET_LEDGER_ENTRY_REPOSITORY,
  type WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../ports/wallet.repository.js';

export interface ProcessWagerInput {
  id: string;

  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;

  walletId: string;
  playerId: string;

  roundId: string;
  gameId: string;

  kind: WagerTransactionKind;

  amount: string;
  currency: string;

  referenceExternalTransactionId?: string;

  correlationId?: string;
  causationId?: string;
}

export interface ProcessWagerOutput {
  transactionId: string;

  status: WagerTransactionStatus;

  balance?: string;

  failureCode?: FailureCode;

  idempotentReplay: boolean;
}

@Injectable()
export class ProcessWagerUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository:
      WalletRepository,

    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTransactionRepository:
      WagerTransactionRepository,

    @Inject(WALLET_LEDGER_ENTRY_REPOSITORY)
    private readonly ledgerRepository:
      WalletLedgerEntryRepository,

    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager:
      TransactionManager,

    @Optional()
    @Inject(OUTBOX_MESSAGE_REPOSITORY)
    private readonly outboxRepository?:
      OutboxMessageRepository,
  ) {}

  async execute(
    input: ProcessWagerInput,
  ): Promise<ProcessWagerOutput> {
    /*
     * IDEMPOTÊNCIA
     */
    const existingTransaction =
      await this
        .wagerTransactionRepository
        .findByProviderAndIdempotencyKey(
          input.providerId,
          input.idempotencyKey,
        );

    if (existingTransaction) {
      if (
        !existingTransaction.matchesPayload(
          input.payloadHash,
        )
      ) {
        throw new IdempotencyConflictError();
      }

      return {
        transactionId:
          existingTransaction.id,

        status:
          existingTransaction.status,

        ...(existingTransaction.resultBalance
          ? {
              balance:
                existingTransaction
                  .resultBalance
                  .toString(),
            }
          : {}),

        ...(existingTransaction.failureCode
          ? {
              failureCode:
                existingTransaction
                  .failureCode,
            }
          : {}),

        idempotentReplay:
          true,
      };
    }

    /*
     * Operações suportadas.
     */
    if (
      input.kind !==
        WagerTransactionKind.Bet &&
      input.kind !==
        WagerTransactionKind.Win &&
      input.kind !==
        WagerTransactionKind.Loss &&
      input.kind !==
        WagerTransactionKind.Refund &&
      input.kind !==
        WagerTransactionKind.Rollback
    ) {
      throw new Error(
        'Only BET, WIN, LOSS, REFUND and ROLLBACK processing are implemented for now',
      );
    }

    const money =
      Money.from({
        amount:
          input.amount,

        currency:
          input.currency,
      });

    const transaction =
      WagerTransaction.create({
        id:
          input.id,

        providerId:
          input.providerId,

        externalTransactionId:
          input.externalTransactionId,

        idempotencyKey:
          input.idempotencyKey,

        payloadHash:
          input.payloadHash,

        walletId:
          input.walletId,

        playerId:
          input.playerId,

        roundId:
          input.roundId,

        gameId:
          input.gameId,

        kind:
          input.kind,

        money,

        referenceExternalTransactionId:
          input.referenceExternalTransactionId,
      });

    return this.transactionManager.execute(
      async () => {
        /*
         * Lock pessimista da wallet.
         */
        const wallet =
          await this
            .walletRepository
            .findByIdForUpdate(
              input.walletId,
            );

        if (!wallet) {
          throw new Error(
            'Wallet not found',
          );
        }

        /*
         * Persistimos inicialmente a
         * transação em PENDING.
         */
        await this
          .wagerTransactionRepository
          .save(
            transaction,
          );

        /*
         * ======================================
         * LOSS
         * ======================================
         *
         * LOSS não movimenta saldo.
         * Não produz ledger.
         */
        if (
          input.kind ===
          WagerTransactionKind.Loss
        ) {
          const processedAt =
            new Date();

          transaction.markProcessed(
            undefined,
            processedAt,
            wallet.balance,
          );

          await this
            .wagerTransactionRepository
            .save(
              transaction,
            );

          if (
            this.outboxRepository
          ) {
            const event =
              new WagerTransactionProcessedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  transaction.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  transactionId:
                    transaction.id,

                  providerId:
                    input.providerId,

                  externalTransactionId:
                    input.externalTransactionId,

                  walletId:
                    input.walletId,

                  playerId:
                    input.playerId,

                  roundId:
                    input.roundId,

                  gameId:
                    input.gameId,

                  kind:
                    input.kind,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balance: {
                    amount:
                      wallet.balance
                        .toString(),

                    currency:
                      wallet.balance
                        .currency,
                  },
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  event,
                ),
              );
          }

          return {
            transactionId:
              transaction.id,

            status:
              transaction.status,

            balance:
              wallet.balance
                .toString(),

            idempotentReplay:
              false,
          };
        }

        /*
         * ======================================
         * ROLLBACK
         * ======================================
         */
        if (
          input.kind ===
          WagerTransactionKind.Rollback
        ) {
          if (
            !input
              .referenceExternalTransactionId
          ) {
            throw new Error(
              'ROLLBACK requires a reference transaction',
            );
          }

          const referencedTransaction =
            await this
              .wagerTransactionRepository
              .findByProviderAndExternalTransactionId(
                input.providerId,
                input
                  .referenceExternalTransactionId,
              );

          /*
           * Referência ainda não chegou.
           */
          if (
            !referencedTransaction
          ) {
            transaction
              .markPendingReference();

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const pendingReferenceEvent =
                new WagerTransactionPendingReferenceEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    referenceExternalTransactionId:
                      input.referenceExternalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    pendingReferenceEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              idempotentReplay:
                false,
            };
          }

          /*
           * ROLLBACK pode reverter
           * BET, WIN ou REFUND processados.
           */
          if (
            (
              referencedTransaction.kind !==
                WagerTransactionKind.Bet &&
              referencedTransaction.kind !==
                WagerTransactionKind.Win &&
              referencedTransaction.kind !==
                WagerTransactionKind.Refund
            ) ||
            referencedTransaction.status !==
              WagerTransactionStatus.Processed
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          /*
           * A referência precisa pertencer
           * à mesma operação financeira.
           */
          if (
            referencedTransaction
              .money.currency !==
              money.currency ||
            !referencedTransaction
              .money.equals(
                money,
              ) ||
            referencedTransaction
              .walletId !==
              input.walletId ||
            referencedTransaction
              .playerId !==
              input.playerId ||
            referencedTransaction
              .roundId !==
              input.roundId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          /*
           * Apenas um ROLLBACK processado
           * para cada referência.
           */
          const previousRollback =
            await this
              .wagerTransactionRepository
              .findProcessedByReferenceTransactionIdAndKind(
                referencedTransaction.id,
                WagerTransactionKind.Rollback,
              );

          if (
            previousRollback
          ) {
            transaction.reject(
              FailureCode.DuplicateReversal,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.DuplicateReversal,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          /*
           * Define o efeito inverso da
           * transação original.
           */
          const rollbackDirection =
            transaction
              .ledgerDirectionFor(
                referencedTransaction,
              );

          let balanceChange;

          if (
            rollbackDirection ===
            LedgerDirection.Credit
          ) {
            balanceChange =
              wallet.credit(
                money,
              );
          } else {
            try {
              balanceChange =
                wallet.debit(
                  money,
                );
            } catch (error) {
              if (
                error instanceof
                  Error &&
                error.message ===
                  'Insufficient funds'
              ) {
                transaction.reject(
                  FailureCode
                    .ReversalInsufficientFunds,

                  wallet.balance,
                );

                await this
                  .wagerTransactionRepository
                  .save(
                    transaction,
                  );

                if (
                  this.outboxRepository
                ) {
                  const rejectedEvent =
                    new WagerTransactionRejectedEvent({
                      eventId:
                        randomUUID(),

                      aggregateId:
                        transaction.id,

                      correlationId:
                        input.correlationId ??
                        input.idempotencyKey,

                      ...(input.causationId
                        ? {
                            causationId:
                              input.causationId,
                          }
                        : {}),

                      occurredAt:
                        new Date(),

                      data: {
                        transactionId:
                          transaction.id,

                        providerId:
                          input.providerId,

                        externalTransactionId:
                          input.externalTransactionId,

                        walletId:
                          input.walletId,

                        playerId:
                          input.playerId,

                        roundId:
                          input.roundId,

                        gameId:
                          input.gameId,

                        kind:
                          input.kind,

                        money: {
                          amount:
                            money.toString(),

                          currency:
                            money.currency,
                        },

                        failureCode:
                          FailureCode
                            .ReversalInsufficientFunds,

                        balance: {
                          amount:
                            wallet.balance
                              .toString(),

                          currency:
                            wallet.balance
                              .currency,
                        },
                      },
                    });

                  await this
                    .outboxRepository
                    .save(
                      OutboxMessage.enqueue(
                        rejectedEvent,
                      ),
                    );
                }

                return {
                  transactionId:
                    transaction.id,

                  status:
                    transaction.status,

                  balance:
                    wallet.balance
                      .toString(),

                  failureCode:
                    transaction
                      .failureCode,

                  idempotentReplay:
                    false,
                };
              }

              throw error;
            }
          }

          const ledgerEntry =
            WalletLedgerEntry.create({
              id:
                randomUUID(),

              walletId:
                wallet.id,

              transactionId:
                transaction.id,

              direction:
                rollbackDirection,

              money,

              balanceBefore:
                balanceChange
                  .balanceBefore,

              balanceAfter:
                balanceChange
                  .balanceAfter,
            });

          const processedAt =
            new Date();

          transaction.markProcessed(
            referencedTransaction.id,
            processedAt,
            balanceChange.balanceAfter,
          );

          await this
            .walletRepository
            .save(
              wallet,
            );

          await this
            .ledgerRepository
            .append(
              ledgerEntry,
            );

          await this
            .wagerTransactionRepository
            .save(
              transaction,
            );

          if (
            this.outboxRepository
          ) {
            /*
             * WagerTransactionProcessed
             */
            const processedEvent =
              new WagerTransactionProcessedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  transaction.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  transactionId:
                    transaction.id,

                  providerId:
                    input.providerId,

                  externalTransactionId:
                    input.externalTransactionId,

                  walletId:
                    input.walletId,

                  playerId:
                    input.playerId,

                  roundId:
                    input.roundId,

                  gameId:
                    input.gameId,

                  kind:
                    input.kind,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balance: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  processedEvent,
                ),
              );

            /*
             * WalletBalanceChanged
             */
            const walletBalanceChangedEvent =
              new WalletBalanceChangedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  wallet.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  walletId:
                    wallet.id,

                  transactionId:
                    transaction.id,

                  direction:
                    rollbackDirection,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balanceBefore: {
                    amount:
                      balanceChange
                        .balanceBefore
                        .toString(),

                    currency:
                      balanceChange
                        .balanceBefore
                        .currency,
                  },

                  balanceAfter: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },

                  walletVersion:
                    wallet.version,
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  walletBalanceChangedEvent,
                ),
              );
          }

          return {
            transactionId:
              transaction.id,

            status:
              transaction.status,

            balance:
              balanceChange
                .balanceAfter
                .toString(),

            idempotentReplay:
              false,
          };
        }

        /*
         * ======================================
         * REFUND
         * ======================================
         */
        if (
          input.kind ===
          WagerTransactionKind.Refund
        ) {
          if (
            !input
              .referenceExternalTransactionId
          ) {
            throw new Error(
              'REFUND requires a reference transaction',
            );
          }

          const referencedTransaction =
            await this
              .wagerTransactionRepository
              .findByProviderAndExternalTransactionId(
                input.providerId,
                input
                  .referenceExternalTransactionId,
              );

          /*
           * Referência ainda não chegou.
           */
          if (
            !referencedTransaction
          ) {
            transaction
              .markPendingReference();

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const pendingReferenceEvent =
                new WagerTransactionPendingReferenceEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    referenceExternalTransactionId:
                      input.referenceExternalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    pendingReferenceEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              idempotentReplay:
                false,
            };
          }

          /*
           * REFUND só pode referenciar
           * uma BET processada.
           */
          if (
            referencedTransaction.kind !==
              WagerTransactionKind.Bet ||
            referencedTransaction.status !==
              WagerTransactionStatus.Processed
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          if (
            referencedTransaction
              .money.currency !==
            money.currency
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          if (
            !referencedTransaction
              .money.equals(
                money,
              )
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          if (
            referencedTransaction
              .walletId !==
            input.walletId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          if (
            referencedTransaction
              .playerId !==
            input.playerId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          if (
            referencedTransaction
              .roundId !==
            input.roundId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.InvalidReference,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          /*
           * Apenas um REFUND processado
           * para cada BET.
           */
          const previousRefund =
            await this
              .wagerTransactionRepository
              .findProcessedByReferenceTransactionIdAndKind(
                referencedTransaction.id,
                WagerTransactionKind.Refund,
              );

          if (
            previousRefund
          ) {
            transaction.reject(
              FailureCode.DuplicateReversal,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            if (
              this.outboxRepository
            ) {
              const rejectedEvent =
                new WagerTransactionRejectedEvent({
                  eventId:
                    randomUUID(),

                  aggregateId:
                    transaction.id,

                  correlationId:
                    input.correlationId ??
                    input.idempotencyKey,

                  ...(input.causationId
                    ? {
                        causationId:
                          input.causationId,
                      }
                    : {}),

                  occurredAt:
                    new Date(),

                  data: {
                    transactionId:
                      transaction.id,

                    providerId:
                      input.providerId,

                    externalTransactionId:
                      input.externalTransactionId,

                    walletId:
                      input.walletId,

                    playerId:
                      input.playerId,

                    roundId:
                      input.roundId,

                    gameId:
                      input.gameId,

                    kind:
                      input.kind,

                    money: {
                      amount:
                        money.toString(),

                      currency:
                        money.currency,
                    },

                    failureCode:
                      FailureCode.DuplicateReversal,

                    balance: {
                      amount:
                        wallet.balance
                          .toString(),

                      currency:
                        wallet.balance
                          .currency,
                    },
                  },
                });

              await this
                .outboxRepository
                .save(
                  OutboxMessage.enqueue(
                    rejectedEvent,
                  ),
                );
            }

            return {
              transactionId:
                transaction.id,

              status:
                transaction.status,

              balance:
                wallet.balance
                  .toString(),

              failureCode:
                transaction.failureCode,

              idempotentReplay:
                false,
            };
          }

          const balanceChange =
            wallet.credit(
              money,
            );

          const ledgerEntry =
            WalletLedgerEntry.create({
              id:
                randomUUID(),

              walletId:
                wallet.id,

              transactionId:
                transaction.id,

              direction:
                LedgerDirection.Credit,

              money,

              balanceBefore:
                balanceChange
                  .balanceBefore,

              balanceAfter:
                balanceChange
                  .balanceAfter,
            });

          const processedAt =
            new Date();

          transaction.markProcessed(
            referencedTransaction.id,
            processedAt,
            balanceChange.balanceAfter,
          );

          await this
            .walletRepository
            .save(
              wallet,
            );

          await this
            .ledgerRepository
            .append(
              ledgerEntry,
            );

          await this
            .wagerTransactionRepository
            .save(
              transaction,
            );

          if (
            this.outboxRepository
          ) {
            /*
             * WagerTransactionProcessed
             */
            const processedEvent =
              new WagerTransactionProcessedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  transaction.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  transactionId:
                    transaction.id,

                  providerId:
                    input.providerId,

                  externalTransactionId:
                    input.externalTransactionId,

                  walletId:
                    input.walletId,

                  playerId:
                    input.playerId,

                  roundId:
                    input.roundId,

                  gameId:
                    input.gameId,

                  kind:
                    input.kind,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balance: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  processedEvent,
                ),
              );

            /*
             * WalletBalanceChanged
             */
            const walletBalanceChangedEvent =
              new WalletBalanceChangedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  wallet.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  walletId:
                    wallet.id,

                  transactionId:
                    transaction.id,

                  direction:
                    LedgerDirection.Credit,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balanceBefore: {
                    amount:
                      balanceChange
                        .balanceBefore
                        .toString(),

                    currency:
                      balanceChange
                        .balanceBefore
                        .currency,
                  },

                  balanceAfter: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },

                  walletVersion:
                    wallet.version,
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  walletBalanceChangedEvent,
                ),
              );
          }

          return {
            transactionId:
              transaction.id,

            status:
              transaction.status,

            balance:
              balanceChange
                .balanceAfter
                .toString(),

            idempotentReplay:
              false,
          };
        }

        /*
         * ======================================
         * BET
         * ======================================
         */
        if (
          input.kind ===
          WagerTransactionKind.Bet
        ) {
          let balanceChange;

          try {
            balanceChange =
              wallet.debit(
                money,
              );
          } catch (error) {
            /*
             * BET rejeitada por saldo
             * insuficiente.
             */
            if (
              error instanceof
                Error &&
              error.message ===
                'Insufficient funds'
            ) {
              transaction.reject(
                FailureCode
                  .InsufficientFunds,

                wallet.balance,
              );

              await this
                .wagerTransactionRepository
                .save(
                  transaction,
                );

              /*
               * Como a transação foi
               * rejeitada por regra de
               * negócio, publicamos
               * WagerTransactionRejected.
               *
               * Não existe ledger nem
               * WalletBalanceChanged porque
               * o saldo não mudou.
               */
              if (
                this.outboxRepository
              ) {
                const rejectedEvent =
                  new WagerTransactionRejectedEvent({
                    eventId:
                      randomUUID(),

                    aggregateId:
                      transaction.id,

                    correlationId:
                      input.correlationId ??
                      input.idempotencyKey,

                    ...(input.causationId
                      ? {
                          causationId:
                            input.causationId,
                        }
                      : {}),

                    occurredAt:
                      new Date(),

                    data: {
                      transactionId:
                        transaction.id,

                      providerId:
                        input.providerId,

                      externalTransactionId:
                        input.externalTransactionId,

                      walletId:
                        input.walletId,

                      playerId:
                        input.playerId,

                      roundId:
                        input.roundId,

                      gameId:
                        input.gameId,

                      kind:
                        input.kind,

                      money: {
                        amount:
                          money.toString(),

                        currency:
                          money.currency,
                      },

                      failureCode:
                        FailureCode
                          .InsufficientFunds,

                      balance: {
                        amount:
                          wallet.balance
                            .toString(),

                        currency:
                          wallet.balance
                            .currency,
                      },
                    },
                  });

                await this
                  .outboxRepository
                  .save(
                    OutboxMessage.enqueue(
                      rejectedEvent,
                    ),
                  );
              }

              return {
                transactionId:
                  transaction.id,

                status:
                  transaction.status,

                balance:
                  wallet.balance
                    .toString(),

                failureCode:
                  transaction
                    .failureCode,

                idempotentReplay:
                  false,
              };
            }

            throw error;
          }

          const ledgerEntry =
            WalletLedgerEntry.create({
              id:
                randomUUID(),

              walletId:
                wallet.id,

              transactionId:
                transaction.id,

              direction:
                LedgerDirection.Debit,

              money,

              balanceBefore:
                balanceChange
                  .balanceBefore,

              balanceAfter:
                balanceChange
                  .balanceAfter,
            });

          const processedAt =
            new Date();

          transaction.markProcessed(
            undefined,
            processedAt,
            balanceChange.balanceAfter,
          );

          await this
            .walletRepository
            .save(
              wallet,
            );

          await this
            .ledgerRepository
            .append(
              ledgerEntry,
            );

          await this
            .wagerTransactionRepository
            .save(
              transaction,
            );

          if (
            this.outboxRepository
          ) {
            /*
             * WagerTransactionProcessed
             */
            const processedEvent =
              new WagerTransactionProcessedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  transaction.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  transactionId:
                    transaction.id,

                  providerId:
                    input.providerId,

                  externalTransactionId:
                    input.externalTransactionId,

                  walletId:
                    input.walletId,

                  playerId:
                    input.playerId,

                  roundId:
                    input.roundId,

                  gameId:
                    input.gameId,

                  kind:
                    input.kind,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balance: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  processedEvent,
                ),
              );

            /*
             * WalletBalanceChanged
             */
            const walletBalanceChangedEvent =
              new WalletBalanceChangedEvent({
                eventId:
                  randomUUID(),

                aggregateId:
                  wallet.id,

                correlationId:
                  input.correlationId ??
                  input.idempotencyKey,

                ...(input.causationId
                  ? {
                      causationId:
                        input.causationId,
                    }
                  : {}),

                occurredAt:
                  processedAt,

                data: {
                  walletId:
                    wallet.id,

                  transactionId:
                    transaction.id,

                  direction:
                    LedgerDirection.Debit,

                  money: {
                    amount:
                      money.toString(),

                    currency:
                      money.currency,
                  },

                  balanceBefore: {
                    amount:
                      balanceChange
                        .balanceBefore
                        .toString(),

                    currency:
                      balanceChange
                        .balanceBefore
                        .currency,
                  },

                  balanceAfter: {
                    amount:
                      balanceChange
                        .balanceAfter
                        .toString(),

                    currency:
                      balanceChange
                        .balanceAfter
                        .currency,
                  },

                  walletVersion:
                    wallet.version,
                },
              });

            await this
              .outboxRepository
              .save(
                OutboxMessage.enqueue(
                  walletBalanceChangedEvent,
                ),
              );
          }

          return {
            transactionId:
              transaction.id,

            status:
              transaction.status,

            balance:
              balanceChange
                .balanceAfter
                .toString(),

            idempotentReplay:
              false,
          };
        }

        /*
         * ======================================
         * WIN
         * ======================================
         */
        const balanceChange =
          wallet.credit(
            money,
          );

        const ledgerEntry =
          WalletLedgerEntry.create({
            id:
              randomUUID(),

            walletId:
              wallet.id,

            transactionId:
              transaction.id,

            direction:
              LedgerDirection.Credit,

            money,

            balanceBefore:
              balanceChange
                .balanceBefore,

            balanceAfter:
              balanceChange
                .balanceAfter,
          });

        const processedAt =
          new Date();

        transaction.markProcessed(
          undefined,
          processedAt,
          balanceChange.balanceAfter,
        );

        await this
          .walletRepository
          .save(
            wallet,
          );

        await this
          .ledgerRepository
          .append(
            ledgerEntry,
          );

        await this
          .wagerTransactionRepository
          .save(
            transaction,
          );

        if (
          this.outboxRepository
        ) {
          /*
           * WagerTransactionProcessed
           */
          const processedEvent =
            new WagerTransactionProcessedEvent({
              eventId:
                randomUUID(),

              aggregateId:
                transaction.id,

              correlationId:
                input.correlationId ??
                input.idempotencyKey,

              ...(input.causationId
                ? {
                    causationId:
                      input.causationId,
                  }
                : {}),

              occurredAt:
                processedAt,

              data: {
                transactionId:
                  transaction.id,

                providerId:
                  input.providerId,

                externalTransactionId:
                  input.externalTransactionId,

                walletId:
                  input.walletId,

                playerId:
                  input.playerId,

                roundId:
                  input.roundId,

                gameId:
                  input.gameId,

                kind:
                  input.kind,

                money: {
                  amount:
                    money.toString(),

                  currency:
                    money.currency,
                },

                balance: {
                  amount:
                    balanceChange
                      .balanceAfter
                      .toString(),

                  currency:
                    balanceChange
                      .balanceAfter
                      .currency,
                },
              },
            });

          await this
            .outboxRepository
            .save(
              OutboxMessage.enqueue(
                processedEvent,
              ),
            );

          /*
           * WalletBalanceChanged
           */
          const walletBalanceChangedEvent =
            new WalletBalanceChangedEvent({
              eventId:
                randomUUID(),

              aggregateId:
                wallet.id,

              correlationId:
                input.correlationId ??
                input.idempotencyKey,

              ...(input.causationId
                ? {
                    causationId:
                      input.causationId,
                  }
                : {}),

              occurredAt:
                processedAt,

              data: {
                walletId:
                  wallet.id,

                transactionId:
                  transaction.id,

                direction:
                  LedgerDirection.Credit,

                money: {
                  amount:
                    money.toString(),

                  currency:
                    money.currency,
                },

                balanceBefore: {
                  amount:
                    balanceChange
                      .balanceBefore
                      .toString(),

                  currency:
                    balanceChange
                      .balanceBefore
                      .currency,
                },

                balanceAfter: {
                  amount:
                    balanceChange
                      .balanceAfter
                      .toString(),

                  currency:
                    balanceChange
                      .balanceAfter
                      .currency,
                },

                walletVersion:
                  wallet.version,
              },
            });

          await this
            .outboxRepository
            .save(
              OutboxMessage.enqueue(
                walletBalanceChangedEvent,
              ),
            );
        }

        return {
          transactionId:
            transaction.id,

          status:
            transaction.status,

          balance:
            balanceChange
              .balanceAfter
              .toString(),

          idempotentReplay:
            false,
        };
      },
    );
  }
}
