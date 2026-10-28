import { Money } from '../../../domain/shared/value-objects/money.js';
import {
  WagerTransaction,
} from '../../../domain/wagering/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

export class WagerTransactionMapper {
  static toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId,
      createdAt: entity.createdAt,
      status: entity.status,
      referenceTransactionId: entity.referenceTransactionId,
      failureCode: entity.failureCode,
      processedAt: entity.processedAt,
      resultBalance: entity.resultBalance
        ? Money.from({
            amount: entity.resultBalance,
            currency: entity.currency,
          })
        : undefined,
    });
  }

  static toPersistence(
    transaction: WagerTransaction,
  ): WagerTransactionEntity {
    const entity = new WagerTransactionEntity();

    entity.id = transaction.id;
    entity.providerId = transaction.providerId;
    entity.externalTransactionId =
      transaction.externalTransactionId;
    entity.idempotencyKey = transaction.idempotencyKey;
    entity.payloadHash = transaction.payloadHash;
    entity.walletId = transaction.walletId;
    entity.playerId = transaction.playerId;
    entity.roundId = transaction.roundId;
    entity.gameId = transaction.gameId;
    entity.kind = transaction.kind;
    entity.amount = transaction.money.toString();
    entity.currency = transaction.money.currency;
    entity.referenceExternalTransactionId =
      transaction.referenceExternalTransactionId;
    entity.status = transaction.status;
    entity.referenceTransactionId =
      transaction.referenceTransactionId;
    entity.failureCode = transaction.failureCode;
    entity.createdAt = transaction.createdAt;
    entity.processedAt = transaction.processedAt;
    entity.resultBalance =
      transaction.resultBalance?.toString();

    return entity;
  }
}