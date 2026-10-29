import {
  PendingReferenceRetryPolicy,
} from './pending-reference-retry-policy.js';

export interface CreatePendingReferenceRetryProps {
  transactionId: string;
  createdAt?: Date;
}

export interface PendingReferenceRetryState {
  transactionId: string;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
}

export class PendingReferenceRetry {
  private constructor(
    public readonly transactionId: string,
    public readonly createdAt: Date,
    private _attempts: number,
    private _nextAttemptAt: Date,
  ) {}

  static create(
    props: CreatePendingReferenceRetryProps,
    policy:
      PendingReferenceRetryPolicy =
        new PendingReferenceRetryPolicy(),
  ): PendingReferenceRetry {
    const createdAt =
      props.createdAt ??
      new Date();

    return new PendingReferenceRetry(
      props.transactionId,
      createdAt,
      0,
      policy.nextAttemptAt(
        createdAt,
        0,
      ),
    );
  }

  static rehydrate(
    state: PendingReferenceRetryState,
  ): PendingReferenceRetry {
    return new PendingReferenceRetry(
      state.transactionId,
      state.createdAt,
      state.attempts,
      state.nextAttemptAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date {
    return this._nextAttemptAt;
  }

  isDue(
    now: Date,
  ): boolean {
    return (
      this._nextAttemptAt.getTime() <=
      now.getTime()
    );
  }

  shouldReject(
    now: Date,
    policy:
      PendingReferenceRetryPolicy =
        new PendingReferenceRetryPolicy(),
  ): boolean {
    return policy.shouldReject(
      this.createdAt,
      this._attempts,
      now,
    );
  }

  scheduleNextAttempt(
    now: Date,
    policy:
      PendingReferenceRetryPolicy =
        new PendingReferenceRetryPolicy(),
  ): void {
    this._attempts += 1;

    this._nextAttemptAt =
      policy.nextAttemptAt(
        now,
        this._attempts,
      );
  }
}
