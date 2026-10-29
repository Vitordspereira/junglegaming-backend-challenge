import type {
  IntegrationEvent,
} from './integration-event.js';

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export interface CreateOutboxMessageProps {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

export class OutboxMessage {
  private static readonly BASE_RETRY_SECONDS =
    5;

  private static readonly MAX_RETRY_SECONDS =
    300;

  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Record<string, unknown>,
    public readonly occurredAt: Date,
    public readonly attempts: number,
    public readonly nextAttemptAt?: Date,
    public readonly publishedAt?: Date,
  ) {}

  static create(
    props: CreateOutboxMessageProps,
  ): OutboxMessage {
    if (
      props.aggregateId.trim().length === 0
    ) {
      throw new Error(
        'Outbox aggregate id is required',
      );
    }

    if (
      props.eventType.trim().length === 0
    ) {
      throw new Error(
        'Outbox event type is required',
      );
    }

    return new OutboxMessage(
      props.id,
      props.aggregateId,
      props.eventType,
      props.payload,
      props.occurredAt ?? new Date(),
      0,
    );
  }

  static enqueue<
    TData extends Record<string, unknown>,
  >(
    event: IntegrationEvent<TData>,
  ): OutboxMessage {
    return OutboxMessage.create({
      id:
        event.eventId,

      aggregateId:
        event.aggregateId,

      eventType:
        event.eventType,

      payload:
        event.toJSON(),

      occurredAt:
        event.occurredAt,
    });
  }

  static rehydrate(
    state: OutboxMessageState,
  ): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  isPublished(): boolean {
    return (
      this.publishedAt !== undefined
    );
  }

  isPending(): boolean {
    return !this.isPublished();
  }

  isDue(
    now: Date = new Date(),
  ): boolean {
    if (!this.isPending()) {
      return false;
    }

    if (!this.nextAttemptAt) {
      return true;
    }

    return (
      this.nextAttemptAt.getTime() <=
      now.getTime()
    );
  }

  markPublished(
    at: Date = new Date(),
  ): OutboxMessage {
    if (this.publishedAt) {
      return this;
    }

    return new OutboxMessage(
      this.id,
      this.aggregateId,
      this.eventType,
      this.payload,
      this.occurredAt,
      this.attempts,
      undefined,
      at,
    );
  }

  scheduleRetry(
    now: Date = new Date(),
  ): OutboxMessage {
    if (this.isPublished()) {
      return this;
    }

    const nextAttempts =
      this.attempts + 1;

    const delaySeconds =
      Math.min(
        OutboxMessage
          .BASE_RETRY_SECONDS *
          2 **
            (nextAttempts - 1),

        OutboxMessage
          .MAX_RETRY_SECONDS,
      );

    const nextAttemptAt =
      new Date(
        now.getTime() +
          delaySeconds * 1000,
      );

    return new OutboxMessage(
      this.id,
      this.aggregateId,
      this.eventType,
      this.payload,
      this.occurredAt,
      nextAttempts,
      nextAttemptAt,
      this.publishedAt,
    );
  }
}