import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import { Money } from '../../src/domain/shared/value-objects/money.js';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wagering/wager-transaction.js';
import { WagerTransactionEntity } from '../../src/infrastructure/database/entities/wager-transaction.entity.js';
import { MikroOrmWagerTransactionRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository.js';
import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('MikroOrmWagerTransactionRepository integration', () => {
  const transactionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const walletId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const playerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const providerId = 'provider-test';
  const externalTransactionId = 'external-123';
  const idempotencyKey = 'idempotency-123';

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);

    await orm.em.fork().nativeDelete(WagerTransactionEntity, {
      id: transactionId,
    });
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(WagerTransactionEntity, {
      id: transactionId,
    });

    await orm.close(true);
  });

  it('saves and finds a wager transaction in PostgreSQL', async () => {
    const entityManager = orm.em.fork();

    const repository =
      new MikroOrmWagerTransactionRepository(entityManager);

    const transaction = WagerTransaction.create({
      id: transactionId,
      providerId,
      externalTransactionId,
      idempotencyKey,
      payloadHash:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      walletId,
      playerId,
      roundId: 'round-123',
      gameId: 'game-123',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    });

    await repository.save(transaction);

    transaction.markProcessed(
      undefined,
      new Date(),
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    );

    await repository.save(transaction);

    const savedTransaction =
      await repository.findById(transactionId);

    expect(savedTransaction).not.toBeNull();
    expect(savedTransaction?.id).toBe(transactionId);
    expect(savedTransaction?.kind).toBe(
      WagerTransactionKind.Bet,
    );
    expect(savedTransaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );
    expect(savedTransaction?.money.toString()).toBe('25.00');
    expect(savedTransaction?.resultBalance?.toString()).toBe('75.00');

    const byExternalTransaction =
      await repository.findByProviderAndExternalTransactionId(
        providerId,
        externalTransactionId,
      );

    expect(byExternalTransaction).not.toBeNull();
    expect(byExternalTransaction?.id).toBe(transactionId);

    const byIdempotencyKey =
      await repository.findByProviderAndIdempotencyKey(
        providerId,
        idempotencyKey,
      );

    expect(byIdempotencyKey).not.toBeNull();
    expect(byIdempotencyKey?.id).toBe(transactionId);
    expect(byIdempotencyKey?.resultBalance?.toString()).toBe('75.00');
  });
});