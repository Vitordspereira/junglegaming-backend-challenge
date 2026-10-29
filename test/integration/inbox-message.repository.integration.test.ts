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

import mikroOrmConfig from '../../src/mikro-orm.config.js';

import {
  InboxMessage,
} from '../../src/domain/messaging/inbox-message.js';

import {
  InboxMessageEntity,
} from '../../src/infrastructure/database/entities/inbox-message.entity.js';

import {
  MikroOrmInboxMessageRepository,
} from '../../src/infrastructure/database/repositories/mikro-orm-inbox-message.repository.js';

describe('MikroOrmInboxMessageRepository integration', () => {
  let orm: MikroORM;

  const consumerName =
    'wager-transaction-consumer';

  const messageId =
    'integration-msg-duplicate-123';

  beforeAll(async () => {
    orm =
      await MikroORM.init(
        mikroOrmConfig,
      );

    await orm.em
      .fork()
      .nativeDelete(
        InboxMessageEntity,
        {
          consumerName,
          messageId,
        },
      );
  });

  afterAll(async () => {
    await orm.em
      .fork()
      .nativeDelete(
        InboxMessageEntity,
        {
          consumerName,
          messageId,
        },
      );

    await orm.close(true);
  });

  it('should persist and retrieve an inbox message', async () => {
    const entityManager =
      orm.em.fork();

    const repository =
      new MikroOrmInboxMessageRepository(
        entityManager,
      );

    const inbox =
      InboxMessage.create({
        id:
          crypto.randomUUID(),

        consumerName,
        messageId,
      });

    await repository.save(
      inbox,
    );

    const found =
      await repository
        .findByConsumerAndMessageId(
          consumerName,
          messageId,
        );

    expect(
      found,
    ).not.toBeNull();

    expect(
      found?.consumerName,
    ).toBe(
      consumerName,
    );

    expect(
      found?.messageId,
    ).toBe(
      messageId,
    );
  });

  it('should reject duplicate consumerName and messageId using the database unique constraint', async () => {
    const firstEntityManager =
      orm.em.fork();

    const firstRepository =
      new MikroOrmInboxMessageRepository(
        firstEntityManager,
      );

    const existing =
      await firstRepository
        .findByConsumerAndMessageId(
          consumerName,
          messageId,
        );

    expect(
      existing,
    ).not.toBeNull();

    const secondEntityManager =
      orm.em.fork();

    const secondRepository =
      new MikroOrmInboxMessageRepository(
        secondEntityManager,
      );

    const duplicate =
      InboxMessage.create({
        id:
          crypto.randomUUID(),

        consumerName,
        messageId,
      });

    let duplicateRejected =
      false;

    try {
      await secondRepository.save(
        duplicate,
      );
    } catch {
      duplicateRejected =
        true;
    }

    expect(
      duplicateRejected,
    ).toBe(true);

    const verificationRepository =
      new MikroOrmInboxMessageRepository(
        orm.em.fork(),
      );

    const persisted =
      await verificationRepository
        .findByConsumerAndMessageId(
          consumerName,
          messageId,
        );

    expect(
      persisted,
    ).not.toBeNull();
  });

    it('should persist the processed state of an inbox message', async () => {
      const entityManager =
        orm.em.fork();

      const repository =
        new MikroOrmInboxMessageRepository(
          entityManager,
        );

      const processedConsumerName =
        'wager-transaction-consumer-processed';

      const processedMessageId =
        `processed-${crypto.randomUUID()}`;

      const inbox =
        InboxMessage.create({
          id:
            crypto.randomUUID(),

          consumerName:
            processedConsumerName,

          messageId:
            processedMessageId,
        });

      await repository.save(
        inbox,
      );

      expect(
        inbox.isProcessed(),
      ).toBe(false);

      const processedAt =
        new Date();

      const processed =
        inbox.markProcessed(
          processedAt,
        );

      await repository.save(
        processed,
      );

      const found =
        await repository
          .findByConsumerAndMessageId(
            processedConsumerName,
            processedMessageId,
          );

      expect(
        found,
      ).not.toBeNull();

      expect(
        found?.isProcessed(),
      ).toBe(true);

      expect(
        found?.processedAt?.getTime(),
      ).toBe(
        processedAt.getTime(),
      );

      await orm.em
        .fork()
        .nativeDelete(
          InboxMessageEntity,
          {
            consumerName:
              processedConsumerName,

            messageId:
              processedMessageId,
          },
        );
    });
});