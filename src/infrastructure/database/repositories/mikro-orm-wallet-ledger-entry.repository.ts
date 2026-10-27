import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import type { WalletLedgerEntryRepository } from '../../../application/ports/wallet-ledger-entry.repository.js';
import { WalletLedgerEntry } from '../../../domain/wallet/wallet-ledger-entry.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';
import { WalletLedgerEntryMapper } from '../mappers/wallet-ledger-entry.mapper.js';

@Injectable()
export class MikroOrmWalletLedgerEntryRepository
  implements WalletLedgerEntryRepository
{
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: string): Promise<WalletLedgerEntry | null> {
    const entity = await this.entityManager.findOne(
      WalletLedgerEntryEntity,
      { id },
    );

    if (!entity) {
      return null;
    }

    return WalletLedgerEntryMapper.toDomain(entity);
  }

  async findByWalletAndTransaction(
    walletId: string,
    transactionId: string,
  ): Promise<WalletLedgerEntry | null> {
    const entity = await this.entityManager.findOne(
      WalletLedgerEntryEntity,
      {
        walletId,
        transactionId,
      },
    );

    if (!entity) {
      return null;
    }

    return WalletLedgerEntryMapper.toDomain(entity);
  }

  async append(entry: WalletLedgerEntry): Promise<void> {
    const entity = WalletLedgerEntryMapper.toPersistence(entry);

    this.entityManager.persist(entity);
    await this.entityManager.flush();
  }
}