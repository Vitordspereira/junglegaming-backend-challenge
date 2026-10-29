import {
  PendingReferenceRetry,
} from '../../domain/wagering/pending-reference-retry.js';

export const PENDING_REFERENCE_RETRY_REPOSITORY =
  Symbol(
    'PENDING_REFERENCE_RETRY_REPOSITORY',
  );

export interface PendingReferenceRetryRepository {
  /**
   * Recupera qualquer PENDING_REFERENCE
   * que ainda não possui estado de retry.
   *
   * ON CONFLICT garante segurança caso
   * várias instâncias executem isso juntas.
   */
  ensureForPendingReferences(): Promise<void>;

  findByTransactionId(
    transactionId: string,
  ): Promise<PendingReferenceRetry | null>;

  findDueForProcessing(
    now: Date,
    limit: number,
  ): Promise<PendingReferenceRetry[]>;

  save(
    retry: PendingReferenceRetry,
  ): Promise<void>;

  delete(
    transactionId: string,
  ): Promise<void>;
}