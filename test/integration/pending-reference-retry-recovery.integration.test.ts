import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import {
  randomUUID,
} from 'node:crypto';

import {
  MikroORM,
} from '@mikro-orm/postgresql';

import {
  ProcessWagerUseCase,
} from '../../src/application/use-cases/process-wager.use-case.js';

import {
  Money,
} from '../../src/domain/shared/value-objects/money.js';

import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';

import {
  Wallet,
} from '../../src/domain/wallet/wallet.js';

import {
  MikroOrmTransactionManager,
} from '../../src/infrastructure/database/mikro-orm-transaction-manager.js';

import {
  MikroOrmPendingReferenceRetryRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-pending-reference-retry.repository.js';

import {
  MikroOrmWagerTransactionRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';

import {
  MikroOrmWalletLedgerEntryRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-wallet-ledger-entry.repository.js';

import {
  MikroOrmWalletRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-wallet.repository.js';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe(
  'PendingReference retry recovery integration',
  () => {
    let orm: MikroORM;

    beforeAll(
      async () => {
        orm =
          await MikroORM.init(
            mikroOrmConfig,
          );
      },
    );

    afterAll(
      async () => {
        await orm.close(true);
      },
    );

    it(
      'recovers a committed PENDING_REFERENCE after restart',
      async () => {
        const walletId =
          randomUUID();

        const playerId =
          randomUUID();

        const transactionId =
          randomUUID();

        /*
         * ========================================
         * FASE 1
         *
         * Aplicação recebe REFUND antes da BET.
         * ========================================
         */

        const processingEm =
          orm.em.fork();

        await processingEm.begin();

        try {
          const walletRepository =
            new MikroOrmWalletRepository(
              processingEm,
            );

          const wagerRepository =
            new MikroOrmWagerTransactionRepository(
              processingEm,
            );

          const ledgerRepository =
            new MikroOrmWalletLedgerEntryRepository(
              processingEm,
            );

          const transactionManager =
            new MikroOrmTransactionManager(
              processingEm,
            );

          const processWager =
            new ProcessWagerUseCase(
              walletRepository,
              wagerRepository,
              ledgerRepository,
              transactionManager,
            );

          const wallet =
            Wallet.open({
              id:
                walletId,

              playerId,

              initialBalance:
                Money.from({
                  amount:
                    '75.00',

                  currency:
                    'BRL',
                }),
            });

          await walletRepository.save(
            wallet,
          );

          /*
           * REFUND chega antes da BET
           * referenciada.
           */
          const result =
            await processWager.execute({
              id:
                transactionId,

              providerId:
                'pending-recovery-provider',

              externalTransactionId:
                randomUUID(),

              idempotencyKey:
                randomUUID(),

              payloadHash:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',

              walletId,

              playerId,

              roundId:
                'pending-recovery-round',

              gameId:
                'pending-recovery-game',

              kind:
                WagerTransactionKind
                  .Refund,

              amount:
                '25.00',

              currency:
                'BRL',

              referenceExternalTransactionId:
                randomUUID(),
            });

          expect(
            result.status,
          ).toBe(
            WagerTransactionStatus
              .PendingReference,
          );

          /*
           * Confirma que realmente ficou
           * persistido como PENDING_REFERENCE.
           */
          const pending =
            await wagerRepository.findById(
              transactionId,
            );

          expect(
            pending,
          ).not.toBeNull();

          expect(
            pending?.status,
          ).toBe(
            WagerTransactionStatus
              .PendingReference,
          );

          /*
           * Aqui simulamos:
           *
           * PostgreSQL confirmou o commit.
           */
          await processingEm.commit();
        } catch (error) {
          try {
            await processingEm.rollback();
          } catch {
            /*
             * Ignora rollback se a transação
             * já tiver sido encerrada.
             */
          }

          throw error;
        }

        /*
         * ========================================
         * FASE 2
         *
         * Processo morreu / aplicação reiniciou.
         *
         * Novo EntityManager = nova instância.
         * ========================================
         */

        const recoveryEm =
          orm.em.fork();

        try {
          const retryRepository =
            new MikroOrmPendingReferenceRetryRepository(
              recoveryEm,
            );

          /*
           * Antes da recuperação ainda não
           * existe estado operacional de retry.
           */
          const beforeRecovery =
            await retryRepository
              .findByTransactionId(
                transactionId,
              );

          expect(
            beforeRecovery,
          ).toBeNull();

          /*
           * Worker iniciando após restart.
           *
           * Ele procura transações
           * PENDING_REFERENCE sem retry.
           */
          await retryRepository
            .ensureForPendingReferences();

          recoveryEm.clear();

          const recovered =
            await retryRepository
              .findByTransactionId(
                transactionId,
              );

          expect(
            recovered,
          ).not.toBeNull();

          expect(
            recovered?.transactionId,
          ).toBe(
            transactionId,
          );

          expect(
            recovered?.attempts,
          ).toBe(0);

          expect(
            recovered?.nextAttemptAt
              .getTime(),
          ).toBeGreaterThan(
            recovered?.createdAt
              .getTime() ?? 0,
          );

          /*
           * Executar recuperação novamente
           * precisa ser idempotente.
           *
           * ON CONFLICT DO NOTHING impede
           * duplicação/reset do retry.
           */
          await retryRepository
            .ensureForPendingReferences();

          recoveryEm.clear();

          const recoveredAgain =
            await retryRepository
              .findByTransactionId(
                transactionId,
              );

          expect(
            recoveredAgain,
          ).not.toBeNull();

          expect(
            recoveredAgain?.transactionId,
          ).toBe(
            transactionId,
          );

          expect(
            recoveredAgain?.attempts,
          ).toBe(0);

          expect(
            recoveredAgain?.createdAt
              .getTime(),
          ).toBe(
            recovered?.createdAt
              .getTime(),
          );

          expect(
            recoveredAgain?.nextAttemptAt
              .getTime(),
          ).toBe(
            recovered?.nextAttemptAt
              .getTime(),
          );
        } finally {
          /*
           * ========================================
           * LIMPEZA
           * ========================================
           */

          const cleanupEm =
            orm.em.fork();

          await cleanupEm
            .getConnection()
            .execute(
              `
                DELETE FROM pending_reference_retries
                WHERE transaction_id = ?
              `,
              [
                transactionId,
              ],
            );

          await cleanupEm
            .getConnection()
            .execute(
              `
                DELETE FROM wager_transactions
                WHERE id = ?
              `,
              [
                transactionId,
              ],
            );

          await cleanupEm
            .getConnection()
            .execute(
              `
                DELETE FROM wallets
                WHERE id = ?
              `,
              [
                walletId,
              ],
            );
        }
      },
    );
  },
);