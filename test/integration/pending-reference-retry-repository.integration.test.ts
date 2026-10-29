import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';

import {
  MikroORM,
} from '@mikro-orm/postgresql';

import {
  PendingReferenceRetry,
} from '../../src/domain/wagering/pending-reference-retry.js';

import {
  MikroOrmPendingReferenceRetryRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-pending-reference-retry.repository.js';

import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe(
  'MikroOrmPendingReferenceRetryRepository integration',
  () => {
    let orm: MikroORM;

    beforeAll(
      async () => {
        orm =
          await MikroORM.init(
            mikroOrmConfig,
          );
      },
      10_000,
    );

    afterAll(
      async () => {
        /*
         * Da um pequeno intervalo para que a conexao
         * utilizada pela transacao seja devolvida ao pool
         * antes de encerrarmos o MikroORM.
         */
        await new Promise<void>(
          (resolve) => {
            setTimeout(
              resolve,
              1_000,
            );
          },
        );

        await orm.close(true);
      },
      10_000,
    );

    it(
      'persists a pending reference retry and returns it when it is due',
      async () => {
        const transactionId =
          '77777777-7777-4777-8777-777777777777';

        const createdAt =
          new Date(
            '2026-10-29T17:00:00.000Z',
          );

        /*
         * O MikroORM gerencia a abertura,
         * commit e liberacao da transacao.
         */
        await orm.em.transactional(
          async (entityManager) => {
            const repository =
              new MikroOrmPendingReferenceRetryRepository(
                entityManager,
              );

            const retry =
              PendingReferenceRetry.create({
                transactionId,
                createdAt,
              });

            /*
             * Persiste o retry inicial.
             */
            await repository.save(
              retry,
            );

            entityManager.clear();

            /*
             * Confirma que o retry foi persistido.
             */
            const persisted =
              await repository.findByTransactionId(
                transactionId,
              );

            expect(
              persisted,
            ).not.toBeNull();

            expect(
              persisted?.transactionId,
            ).toBe(
              transactionId,
            );

            expect(
              persisted?.attempts,
            ).toBe(0);

            expect(
              persisted?.createdAt
                .toISOString(),
            ).toBe(
              '2026-10-29T17:00:00.000Z',
            );

            expect(
              persisted?.nextAttemptAt
                .toISOString(),
            ).toBe(
              '2026-10-29T17:00:05.000Z',
            );

            /*
             * Antes do horario agendado,
             * o retry ainda nao deve ser retornado.
             */
            const notDue =
              await repository.findDueForProcessing(
                new Date(
                  '2026-10-29T17:00:04.999Z',
                ),
                10,
              );

            expect(
              notDue.some(
                (item) =>
                  item.transactionId ===
                  transactionId,
              ),
            ).toBe(false);

            /*
             * No horario exato do retry,
             * ele deve estar disponivel.
             */
            const due =
              await repository.findDueForProcessing(
                new Date(
                  '2026-10-29T17:00:05.000Z',
                ),
                10,
              );

            const dueRetry =
              due.find(
                (item) =>
                  item.transactionId ===
                  transactionId,
              );

            expect(
              dueRetry,
            ).toBeDefined();

            expect(
              dueRetry?.attempts,
            ).toBe(0);

            /*
             * Agenda uma nova tentativa.
             */
            retry.scheduleNextAttempt(
              new Date(
                '2026-10-29T17:00:05.000Z',
              ),
            );

            await repository.save(
              retry,
            );

            entityManager.clear();

            /*
             * Confirma que o novo estado
             * foi persistido corretamente.
             */
            const updated =
              await repository.findByTransactionId(
                transactionId,
              );

            expect(
              updated,
            ).not.toBeNull();

            expect(
              updated?.attempts,
            ).toBe(1);

            expect(
              updated?.nextAttemptAt
                .toISOString(),
            ).toBe(
              '2026-10-29T17:00:15.000Z',
            );
          },
        );

        /*
         * transactional() realizou COMMIT.
         *
         * Por isso removemos o registro criado
         * pelo teste usando um EntityManager novo.
         */
        const cleanupEntityManager =
          orm.em.fork();

        const cleanupRepository =
          new MikroOrmPendingReferenceRetryRepository(
            cleanupEntityManager,
          );

        await cleanupRepository.delete(
          transactionId,
        );

        cleanupEntityManager.clear();
      },
      10_000,
    );
  },
);