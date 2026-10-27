import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import { Money } from '../../src/domain/shared/value-objects/money.js';
import { Wallet } from '../../src/domain/wallet/wallet.js';
import { WalletEntity } from '../../src/infrastructure/database/entities/wallet.entity.js';
import { MikroOrmWalletRepository } from '../../src/infrastructure/database/repositories/mikro-orm-wallet.repository.js';
import mikroOrmConfig from '../../src/mikro-orm.config.js';

describe('MikroOrmWalletRepository integration', () => {
  const walletId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const playerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);

    await orm.em.fork().nativeDelete(WalletEntity, {
      id: walletId,
    });
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(WalletEntity, {
      id: walletId,
    });

    await orm.close(true);
  });

  it('saves and finds a wallet in PostgreSQL', async () => {
    const entityManager = orm.em.fork();
    const repository = new MikroOrmWalletRepository(entityManager);

    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    });

    await repository.save(wallet);

    const savedWallet = await repository.findById(walletId);

    expect(savedWallet).not.toBeNull();
    expect(savedWallet?.id).toBe(walletId);
    expect(savedWallet?.playerId).toBe(playerId);
    expect(savedWallet?.currency).toBe('BRL');
    expect(savedWallet?.balance.toString()).toBe('100.00');
    expect(savedWallet?.version).toBe(1);

    const walletByPlayerAndCurrency =
      await repository.findByPlayerAndCurrency(playerId, 'BRL');

    expect(walletByPlayerAndCurrency).not.toBeNull();
    expect(walletByPlayerAndCurrency?.id).toBe(walletId);

    wallet.credit(
      Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    );

    await repository.save(wallet);

    const updatedWallet = await repository.findById(walletId);

    expect(updatedWallet?.balance.toString()).toBe('125.00');
    expect(updatedWallet?.version).toBe(2);
  });
});