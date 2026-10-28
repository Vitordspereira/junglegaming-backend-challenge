import { Injectable } from '@nestjs/common';
import {
  EntityManager,
  LockMode,
} from '@mikro-orm/postgresql';

import type { WalletRepository } from '../../../application/ports/wallet.repository.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { WalletMapper } from '../mappers/wallet.mapper.js';

@Injectable()
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.entityManager.findOne(
      WalletEntity,
      { id },
    );

    if (!entity) {
      return null;
    }

    return WalletMapper.toDomain(entity);
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.entityManager.findOne(
      WalletEntity,
      { id },
      {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      },
    );

    if (!entity) {
      return null;
    }

    return WalletMapper.toDomain(entity);
  }

  async findByPlayerAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.entityManager.findOne(
      WalletEntity,
      {
        playerId,
        currency,
      },
    );

    if (!entity) {
      return null;
    }

    return WalletMapper.toDomain(entity);
  }

  async save(wallet: Wallet): Promise<void> {
    const existingEntity = await this.entityManager.findOne(
      WalletEntity,
      {
        id: wallet.id,
      },
    );

    if (!existingEntity) {
      const newEntity = WalletMapper.toPersistence(wallet);

      this.entityManager.persist(newEntity);
      await this.entityManager.flush();

      return;
    }

    existingEntity.playerId = wallet.playerId;
    existingEntity.currency = wallet.currency;
    existingEntity.balance = wallet.balance.toString();
    existingEntity.version = wallet.version;
    existingEntity.updatedAt = wallet.updatedAt;

    await this.entityManager.flush();
  }
}