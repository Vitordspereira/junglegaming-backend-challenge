import {
  randomUUID,
} from 'node:crypto';

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
  OutboxMessage,
} from '../../domain/messaging/outbox-message.js';

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
  OUTBOX_MESSAGE_REPOSITORY,
  type OutboxMessageRepository,
} from '../ports/outbox-message.repository.js';

import {
  PENDING_REFERENCE_RETRY_REPOSITORY,
  type PendingReferenceRetryRepository,
} from '../ports/pending-reference-retry.repository.js';

import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction-manager.js';

import {
  WAGER_TRANSACTION_REPOSITORY,
  type WagerTransactionRepository,
} from '../ports/wager-transaction.repository.js';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../ports/wallet.repository.js';

import {
  WALLET_LEDGER_ENTRY_REPOSITORY,
  type WalletLedgerEntryRepository,
} from '../ports/wallet-ledger-entry.repository.js';

export const REFERENCE_NOT_FOUND_FAILURE_CODE =
  'REFERENCE_NOT_FOUND' as FailureCode;

export interface ProcessPendingReferenceRetriesInput {
  now: Date;
  limit: number;
}

export interface ProcessPendingReferenceRetriesOutput {
  found: number;
  rescheduled: number;
  referenceFound: number;
  exhausted: number;
  cleaned: number;
}

@Injectable()
export class ProcessPendingReferenceRetriesUseCase {
  constructor(
    @Inject(
      PENDING_REFERENCE_RETRY_REPOSITORY,
    )
    private readonly retryRepository:
      PendingReferenceRetryRepository,

    @Inject(
      WAGER_TRANSACTION_REPOSITORY,
    )
    private readonly wagerTransactionRepository:
      WagerTransactionRepository,

    @Inject(
      WALLET_REPOSITORY,
    )
    private readonly walletRepository:
      WalletRepository,

    @Inject(
      OUTBOX_MESSAGE_REPOSITORY,
    )
    private readonly outboxRepository:
      OutboxMessageRepository,

    @Inject(
      TRANSACTION_MANAGER,
    )
    private readonly transactionManager:
      TransactionManager,

    @Optional()
    @Inject(
      WALLET_LEDGER_ENTRY_REPOSITORY,
    )
    private readonly ledgerRepository?:
      WalletLedgerEntryRepository,
  ) {}

  async execute(
    input:
      ProcessPendingReferenceRetriesInput,
  ): Promise<
    ProcessPendingReferenceRetriesOutput
  > {
    return this.transactionManager.execute(
      async () => {
        await this.retryRepository
          .ensureForPendingReferences();

        const retries =
          await this.retryRepository
            .findDueForProcessing(
              input.now,
              input.limit,
            );

        let rescheduled = 0;
        let referenceFound = 0;
        let exhausted = 0;
        let cleaned = 0;

        for (
          const retry of retries
        ) {
          const transaction =
            await this
              .wagerTransactionRepository
              .findById(
                retry.transactionId,
              );

          /*
           * Retry órfão.
           */
          if (!transaction) {
            await this.retryRepository
              .delete(
                retry.transactionId,
              );

            cleaned += 1;

            continue;
          }

          /*
           * Transação já deixou de ser
           * PENDING_REFERENCE.
           */
          if (
            transaction.status !==
            WagerTransactionStatus
              .PendingReference
          ) {
            await this.retryRepository
              .delete(
                retry.transactionId,
              );

            cleaned += 1;

            continue;
          }

          const referenceExternalTransactionId =
            transaction
              .referenceExternalTransactionId;

          if (
            !referenceExternalTransactionId
          ) {
            await this.retryRepository
              .delete(
                retry.transactionId,
              );

            cleaned += 1;

            continue;
          }

          const referencedTransaction =
            await this
              .wagerTransactionRepository
              .findByProviderAndExternalTransactionId(
                transaction.providerId,
                referenceExternalTransactionId,
              );

          /*
           * =====================================
           * REFERÊNCIA ENCONTRADA
           * =====================================
           */
          if (
            referencedTransaction
          ) {
            await this.processFoundReference(
              transaction,
              referencedTransaction,
              retry.transactionId,
              input.now,
            );

            referenceFound += 1;

            continue;
          }

          /*
           * =====================================
           * RETRIES / TTL ESGOTADOS
           * =====================================
           */
          if (
            retry.shouldReject(
              input.now,
            )
          ) {
            const wallet =
              await this.walletRepository
                .findByIdForUpdate(
                  transaction.walletId,
                );

            if (!wallet) {
              throw new Error(
                'Wallet not found for pending reference retry',
              );
            }

            transaction.reject(
              REFERENCE_NOT_FOUND_FAILURE_CODE,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(
                transaction,
              );

            await this.enqueueRejected(
              transaction,
              REFERENCE_NOT_FOUND_FAILURE_CODE,
              wallet.balance.toString(),
              wallet.balance.currency,
              input.now,
            );

            await this.retryRepository
              .delete(
                retry.transactionId,
              );

            exhausted += 1;

            continue;
          }

          /*
           * Referência continua ausente.
           */
          retry.scheduleNextAttempt(
            input.now,
          );

          await this.retryRepository.save(
            retry,
          );

          rescheduled += 1;
        }

        return {
          found:
            retries.length,

          rescheduled,

          referenceFound,

          exhausted,

          cleaned,
        };
      },
    );
  }

  private async processFoundReference(
    transaction:
      WagerTransaction,

    referencedTransaction:
      WagerTransaction,

    retryTransactionId:
      string,

    now:
      Date,
  ): Promise<void> {
    const wallet =
      await this.walletRepository
        .findByIdForUpdate(
          transaction.walletId,
        );

    if (!wallet) {
      throw new Error(
        'Wallet not found for pending reference retry',
      );
    }

    /*
     * =====================================
     * VALIDAÇÃO DA REFERÊNCIA
     * =====================================
     */

    const sameFinancialContext =
      referencedTransaction.walletId ===
        transaction.walletId &&
      referencedTransaction.playerId ===
        transaction.playerId &&
      referencedTransaction.roundId ===
        transaction.roundId &&
      referencedTransaction
        .money.currency ===
        transaction.money.currency &&
      referencedTransaction
        .money
        .equals(
          transaction.money,
        );

    let allowedReference =
      false;

    /*
     * REFUND:
     * somente BET processada.
     */
    if (
      transaction.kind ===
      WagerTransactionKind.Refund
    ) {
      allowedReference =
        referencedTransaction.kind ===
          WagerTransactionKind.Bet &&
        referencedTransaction.status ===
          WagerTransactionStatus
            .Processed;
    }

    /*
     * ROLLBACK:
     * BET, WIN ou REFUND processados.
     */
    if (
      transaction.kind ===
      WagerTransactionKind.Rollback
    ) {
      allowedReference =
        (
          referencedTransaction.kind ===
            WagerTransactionKind.Bet ||
          referencedTransaction.kind ===
            WagerTransactionKind.Win ||
          referencedTransaction.kind ===
            WagerTransactionKind.Refund
        ) &&
        referencedTransaction.status ===
          WagerTransactionStatus
            .Processed;
    }

    if (
      !allowedReference ||
      !sameFinancialContext
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

      await this.enqueueRejected(
        transaction,
        FailureCode.InvalidReference,
        wallet.balance.toString(),
        wallet.balance.currency,
        now,
      );

      await this.retryRepository
        .delete(
          retryTransactionId,
        );

      return;
    }

    /*
     * =====================================
     * DUPLICIDADE DE REVERSÃO
     * =====================================
     */

    const previousReversal =
      await this
        .wagerTransactionRepository
        .findProcessedByReferenceTransactionIdAndKind(
          referencedTransaction.id,
          transaction.kind,
        );

    if (
      previousReversal
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

      await this.enqueueRejected(
        transaction,
        FailureCode.DuplicateReversal,
        wallet.balance.toString(),
        wallet.balance.currency,
        now,
      );

      await this.retryRepository
        .delete(
          retryTransactionId,
        );

      return;
    }

    if (
      !this.ledgerRepository
    ) {
      throw new Error(
        'Ledger repository is required to process pending reference',
      );
    }

    /*
     * =====================================
     * DIREÇÃO DO MOVIMENTO
     * =====================================
     */

    let direction:
      LedgerDirection;

    if (
      transaction.kind ===
      WagerTransactionKind.Refund
    ) {
      /*
       * BET debitou.
       * REFUND devolve.
       */
      direction =
        LedgerDirection.Credit;
    } else {
      /*
       * ROLLBACK usa exatamente o efeito
       * inverso da referência.
       */
      direction =
        transaction
          .ledgerDirectionFor(
            referencedTransaction,
          );
    }

    let balanceChange;

    if (
      direction ===
      LedgerDirection.Credit
    ) {
      balanceChange =
        wallet.credit(
          transaction.money,
        );
    } else {
      try {
        balanceChange =
          wallet.debit(
            transaction.money,
          );
      } catch (error) {
        /*
         * Caso importante:
         *
         * ROLLBACK de WIN/REFUND pode
         * precisar debitar.
         *
         * Se não houver saldo suficiente,
         * rejeitamos explicitamente.
         */
        if (
          error instanceof Error &&
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

          await this.enqueueRejected(
            transaction,
            FailureCode
              .ReversalInsufficientFunds,
            wallet.balance.toString(),
            wallet.balance.currency,
            now,
          );

          await this.retryRepository
            .delete(
              retryTransactionId,
            );

          return;
        }

        throw error;
      }
    }

    /*
     * =====================================
     * LEDGER
     * =====================================
     */

    const ledgerEntry =
      WalletLedgerEntry.create({
        id:
          randomUUID(),

        walletId:
          wallet.id,

        transactionId:
          transaction.id,

        direction,

        money:
          transaction.money,

        balanceBefore:
          balanceChange.balanceBefore,

        balanceAfter:
          balanceChange.balanceAfter,
      });

    /*
     * =====================================
     * PENDING_REFERENCE -> PROCESSED
     * =====================================
     */

    transaction.markProcessed(
      referencedTransaction.id,
      now,
      balanceChange.balanceAfter,
    );

    /*
     * Tudo ocorre na mesma transação:
     *
     * wallet
     * ledger
     * wager
     * outbox
     * retry
     */

    await this.walletRepository
      .save(
        wallet,
      );

    await this.ledgerRepository
      .append(
        ledgerEntry,
      );

    await this
      .wagerTransactionRepository
      .save(
        transaction,
      );

    /*
     * =====================================
     * WagerTransactionProcessed
     * =====================================
     */

    const processedEvent =
      new WagerTransactionProcessedEvent({
        eventId:
          randomUUID(),

        aggregateId:
          transaction.id,

        correlationId:
          transaction.idempotencyKey,

        occurredAt:
          now,

        data: {
          transactionId:
            transaction.id,

          providerId:
            transaction.providerId,

          externalTransactionId:
            transaction
              .externalTransactionId,

          walletId:
            transaction.walletId,

          playerId:
            transaction.playerId,

          roundId:
            transaction.roundId,

          gameId:
            transaction.gameId,

          kind:
            transaction.kind,

          money: {
            amount:
              transaction.money
                .toString(),

            currency:
              transaction.money
                .currency,
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

    await this.outboxRepository
      .save(
        OutboxMessage.enqueue(
          processedEvent,
        ),
      );

    /*
     * =====================================
     * WalletBalanceChanged
     * =====================================
     */

    const balanceChangedEvent =
      new WalletBalanceChangedEvent({
        eventId:
          randomUUID(),

        aggregateId:
          wallet.id,

        correlationId:
          transaction.idempotencyKey,

        occurredAt:
          now,

        data: {
          walletId:
            wallet.id,

          transactionId:
            transaction.id,

          direction,

          money: {
            amount:
              transaction.money
                .toString(),

            currency:
              transaction.money
                .currency,
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

    await this.outboxRepository
      .save(
        OutboxMessage.enqueue(
          balanceChangedEvent,
        ),
      );

    /*
     * Retry concluído.
     */
    await this.retryRepository
      .delete(
        retryTransactionId,
      );
  }

  private async enqueueRejected(
    transaction:
      WagerTransaction,

    failureCode:
      FailureCode,

    balance:
      string,

    currency:
      string,

    occurredAt:
      Date,
  ): Promise<void> {
    const rejectedEvent =
      new WagerTransactionRejectedEvent({
        eventId:
          randomUUID(),

        aggregateId:
          transaction.id,

        correlationId:
          transaction.idempotencyKey,

        occurredAt,

        data: {
          transactionId:
            transaction.id,

          providerId:
            transaction.providerId,

          externalTransactionId:
            transaction
              .externalTransactionId,

          walletId:
            transaction.walletId,

          playerId:
            transaction.playerId,

          roundId:
            transaction.roundId,

          gameId:
            transaction.gameId,

          kind:
            transaction.kind,

          money: {
            amount:
              transaction.money
                .toString(),

            currency:
              transaction.money
                .currency,
          },

          failureCode,

          balance: {
            amount:
              balance,

            currency,
          },
        },
      });

    await this.outboxRepository
      .save(
        OutboxMessage.enqueue(
          rejectedEvent,
        ),
      );
  }
}