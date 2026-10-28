import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Money } from '../../domain/shared/value-objects/money.js';
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

import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';

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
    private readonly walletRepository: WalletRepository,

    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTransactionRepository: WagerTransactionRepository,

    @Inject(WALLET_LEDGER_ENTRY_REPOSITORY)
    private readonly ledgerRepository: WalletLedgerEntryRepository,

    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManager,
  ) {}

  async execute(
    input: ProcessWagerInput,
  ): Promise<ProcessWagerOutput> {
    const existingTransaction =
      await this.wagerTransactionRepository.findByProviderAndIdempotencyKey(
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
        transactionId: existingTransaction.id,
        status: existingTransaction.status,

        ...(existingTransaction.resultBalance
          ? {
              balance:
                existingTransaction.resultBalance.toString(),
            }
          : {}),

        ...(existingTransaction.failureCode
          ? {
              failureCode:
                existingTransaction.failureCode,
            }
          : {}),

        idempotentReplay: true,
      };
    }

    if (
      input.kind !== WagerTransactionKind.Bet &&
      input.kind !== WagerTransactionKind.Win &&
      input.kind !== WagerTransactionKind.Loss &&
      input.kind !== WagerTransactionKind.Refund &&
      input.kind !== WagerTransactionKind.Rollback
    ) {
      throw new Error(
        'Only BET, WIN, LOSS, REFUND and ROLLBACK processing are implemented for now',
      );
    }

    const money = Money.from({
      amount: input.amount,
      currency: input.currency,
    });

    const transaction = WagerTransaction.create({
      id: input.id,
      providerId: input.providerId,
      externalTransactionId:
        input.externalTransactionId,
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,

      walletId: input.walletId,
      playerId: input.playerId,

      roundId: input.roundId,
      gameId: input.gameId,

      kind: input.kind,
      money,

      referenceExternalTransactionId:
        input.referenceExternalTransactionId,
    });

    return this.transactionManager.execute(
      async () => {
        const wallet =
          await this.walletRepository.findByIdForUpdate(
            input.walletId,
          );

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        await this.wagerTransactionRepository.save(
          transaction,
        );

        /*
         * LOSS
         */
        if (
          input.kind === WagerTransactionKind.Loss
        ) {
          transaction.markProcessed(
            undefined,
            new Date(),
            wallet.balance,
          );

          await this.wagerTransactionRepository.save(
            transaction,
          );

          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance: wallet.balance.toString(),
            idempotentReplay: false,
          };
        }

        /*
         * ROLLBACK
         *
         * Primeiro caso implementado:
         * reverter uma BET PROCESSED.
         *
         * BET debitou o saldo.
         * Portanto, o ROLLBACK faz o efeito inverso:
         * CREDIT do mesmo valor.
         */
        if (
          input.kind === WagerTransactionKind.Rollback
        ) {
          if (!input.referenceExternalTransactionId) {
            throw new Error(
              'ROLLBACK requires a reference transaction',
            );
          }

          const referencedTransaction =
            await this.wagerTransactionRepository.findByProviderAndExternalTransactionId(
              input.providerId,
              input.referenceExternalTransactionId,
            );

          if (!referencedTransaction) {
            transaction.markPendingReference();

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              idempotentReplay: false,
            };
          }

          /*
           * ROLLBACK pode reverter somente
           * BET, WIN ou REFUND já processados.
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

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * O ROLLBACK deve corresponder exatamente
           * à operação que está revertendo.
           */
          if (
            referencedTransaction.money.currency !==
              money.currency ||
            !referencedTransaction.money.equals(money) ||
            referencedTransaction.walletId !==
              input.walletId ||
            referencedTransaction.playerId !==
              input.playerId ||
            referencedTransaction.roundId !==
              input.roundId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * A mesma transação não pode receber
           * dois ROLLBACKs processados.
           */
          const previousRollback =
            await this.wagerTransactionRepository.findProcessedByReferenceTransactionIdAndKind(
              referencedTransaction.id,
              WagerTransactionKind.Rollback,
            );

          if (previousRollback) {
            transaction.reject(
              FailureCode.DuplicateReversal,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * O ROLLBACK aplica o efeito inverso
           * da transação referenciada:
           *
           * BET fez DEBIT    -> ROLLBACK faz CREDIT.
           * WIN fez CREDIT   -> ROLLBACK faz DEBIT.
           * REFUND fez CREDIT -> ROLLBACK faz DEBIT.
           */
          const rollbackDirection =
            transaction.ledgerDirectionFor(
              referencedTransaction,
            );

          let balanceChange;

          if (
            rollbackDirection ===
            LedgerDirection.Credit
          ) {
            balanceChange = wallet.credit(money);
          } else {
            try {
              balanceChange = wallet.debit(money);
            } catch (error) {
              if (
                error instanceof Error &&
                error.message ===
                  'Insufficient funds'
              ) {
                transaction.reject(
                  FailureCode.ReversalInsufficientFunds,
                  wallet.balance,
                );

                await this.wagerTransactionRepository.save(
                  transaction,
                );

                return {
                  transactionId: transaction.id,
                  status: transaction.status,
                  balance: wallet.balance.toString(),
                  failureCode:
                    transaction.failureCode,
                  idempotentReplay: false,
                };
              }

              throw error;
            }
          }

          const ledgerEntry =
            WalletLedgerEntry.create({
              id: randomUUID(),
              walletId: wallet.id,
              transactionId: transaction.id,
              direction: rollbackDirection,
              money,
              balanceBefore:
                balanceChange.balanceBefore,
              balanceAfter:
                balanceChange.balanceAfter,
            });

          transaction.markProcessed(
            referencedTransaction.id,
            new Date(),
            balanceChange.balanceAfter,
          );

          await this.walletRepository.save(wallet);

          await this.ledgerRepository.append(
            ledgerEntry,
          );

          await this.wagerTransactionRepository.save(
            transaction,
          );

          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance:
              balanceChange.balanceAfter.toString(),
            idempotentReplay: false,
          };
        }

        /*
         * REFUND
         */
        if (
          input.kind === WagerTransactionKind.Refund
        ) {
          if (!input.referenceExternalTransactionId) {
            throw new Error(
              'REFUND requires a reference transaction',
            );
          }

          const referencedTransaction =
            await this.wagerTransactionRepository.findByProviderAndExternalTransactionId(
              input.providerId,
              input.referenceExternalTransactionId,
            );

          if (!referencedTransaction) {
            transaction.markPendingReference();

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              idempotentReplay: false,
            };
          }

          /*
           * A referência precisa ser uma BET
           * já processada.
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

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * A moeda precisa ser a mesma.
           */
          if (
            referencedTransaction.money.currency !==
            money.currency
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * O valor precisa ser exatamente o mesmo.
           */
          if (
            !referencedTransaction.money.equals(
              money,
            )
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * A wallet precisa ser a mesma.
           */
          if (
            referencedTransaction.walletId !==
            input.walletId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * O player precisa ser o mesmo.
           */
          if (
            referencedTransaction.playerId !==
            input.playerId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * O round precisa ser exatamente o mesmo
           * da BET original.
           */
          if (
            referencedTransaction.roundId !==
            input.roundId
          ) {
            transaction.reject(
              FailureCode.InvalidReference,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          /*
           * Uma mesma BET não pode receber dois
           * REFUNDs processados.
           *
           * Essa consulta acontece depois do lock
           * da wallet, então operações concorrentes
           * da mesma wallet ficam serializadas.
           */
          const previousRefund =
            await this.wagerTransactionRepository.findProcessedByReferenceTransactionIdAndKind(
              referencedTransaction.id,
              WagerTransactionKind.Refund,
            );

          if (previousRefund) {
            transaction.reject(
              FailureCode.DuplicateReversal,
              wallet.balance,
            );

            await this.wagerTransactionRepository.save(
              transaction,
            );

            return {
              transactionId: transaction.id,
              status: transaction.status,
              balance: wallet.balance.toString(),
              failureCode:
                transaction.failureCode,
              idempotentReplay: false,
            };
          }

          const balanceChange =
            wallet.credit(money);

          const ledgerEntry =
            WalletLedgerEntry.create({
              id: randomUUID(),
              walletId: wallet.id,
              transactionId: transaction.id,
              direction:
                LedgerDirection.Credit,
              money,
              balanceBefore:
                balanceChange.balanceBefore,
              balanceAfter:
                balanceChange.balanceAfter,
            });

          transaction.markProcessed(
            referencedTransaction.id,
            new Date(),
            balanceChange.balanceAfter,
          );

          await this.walletRepository.save(wallet);

          await this.ledgerRepository.append(
            ledgerEntry,
          );

          await this.wagerTransactionRepository.save(
            transaction,
          );

          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance:
              balanceChange.balanceAfter.toString(),
            idempotentReplay: false,
          };
        }

        /*
         * BET
         */
        if (
          input.kind === WagerTransactionKind.Bet
        ) {
          let balanceChange;

          try {
            balanceChange = wallet.debit(money);
          } catch (error) {
            if (
              error instanceof Error &&
              error.message ===
                'Insufficient funds'
            ) {
              transaction.reject(
                FailureCode.InsufficientFunds,
                wallet.balance,
              );

              await this.wagerTransactionRepository.save(
                transaction,
              );

              return {
                transactionId: transaction.id,
                status: transaction.status,
                balance:
                  wallet.balance.toString(),
                failureCode:
                  transaction.failureCode,
                idempotentReplay: false,
              };
            }

            throw error;
          }

          const ledgerEntry =
            WalletLedgerEntry.create({
              id: randomUUID(),
              walletId: wallet.id,
              transactionId: transaction.id,
              direction:
                LedgerDirection.Debit,
              money,
              balanceBefore:
                balanceChange.balanceBefore,
              balanceAfter:
                balanceChange.balanceAfter,
            });

          transaction.markProcessed(
            undefined,
            new Date(),
            balanceChange.balanceAfter,
          );

          await this.walletRepository.save(wallet);

          await this.ledgerRepository.append(
            ledgerEntry,
          );

          await this.wagerTransactionRepository.save(
            transaction,
          );

          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance:
              balanceChange.balanceAfter.toString(),
            idempotentReplay: false,
          };
        }

        /*
         * WIN
         */
        const balanceChange =
          wallet.credit(money);

        const ledgerEntry =
          WalletLedgerEntry.create({
            id: randomUUID(),
            walletId: wallet.id,
            transactionId: transaction.id,
            direction:
              LedgerDirection.Credit,
            money,
            balanceBefore:
              balanceChange.balanceBefore,
            balanceAfter:
              balanceChange.balanceAfter,
          });

        transaction.markProcessed(
          undefined,
          new Date(),
          balanceChange.balanceAfter,
        );

        await this.walletRepository.save(wallet);

        await this.ledgerRepository.append(
          ledgerEntry,
        );

        await this.wagerTransactionRepository.save(
          transaction,
        );

        return {
          transactionId: transaction.id,
          status: transaction.status,
          balance:
            balanceChange.balanceAfter.toString(),
          idempotentReplay: false,
        };
      },
    );
  }
}
