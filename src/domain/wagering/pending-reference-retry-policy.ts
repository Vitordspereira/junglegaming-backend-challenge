export interface PendingReferenceRetryPolicyOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  ttlMs?: number;
}

export class PendingReferenceRetryPolicy {
  static readonly DEFAULT_BASE_DELAY_MS = 5_000;
  static readonly DEFAULT_MAX_DELAY_MS = 60_000;
  static readonly DEFAULT_MAX_ATTEMPTS = 5;
  static readonly DEFAULT_TTL_MS = 5 * 60_000;

  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number;
  readonly ttlMs: number;

  constructor(
    options: PendingReferenceRetryPolicyOptions = {},
  ) {
    this.baseDelayMs =
      options.baseDelayMs ??
      PendingReferenceRetryPolicy.DEFAULT_BASE_DELAY_MS;

    this.maxDelayMs =
      options.maxDelayMs ??
      PendingReferenceRetryPolicy.DEFAULT_MAX_DELAY_MS;

    this.maxAttempts =
      options.maxAttempts ??
      PendingReferenceRetryPolicy.DEFAULT_MAX_ATTEMPTS;

    this.ttlMs =
      options.ttlMs ??
      PendingReferenceRetryPolicy.DEFAULT_TTL_MS;

    if (this.baseDelayMs <= 0) {
      throw new Error(
        'Pending reference base delay must be positive',
      );
    }

    if (this.maxDelayMs < this.baseDelayMs) {
      throw new Error(
        'Pending reference max delay must be greater than or equal to base delay',
      );
    }

    if (
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts <= 0
    ) {
      throw new Error(
        'Pending reference max attempts must be a positive integer',
      );
    }

    if (this.ttlMs <= 0) {
      throw new Error(
        'Pending reference TTL must be positive',
      );
    }
  }

  calculateDelayMs(
    attemptsAlreadyMade: number,
  ): number {
    if (
      !Number.isInteger(attemptsAlreadyMade) ||
      attemptsAlreadyMade < 0
    ) {
      throw new Error(
        'Pending reference attempts must be a non-negative integer',
      );
    }

    const exponentialDelay =
      this.baseDelayMs *
      2 ** attemptsAlreadyMade;

    return Math.min(
      exponentialDelay,
      this.maxDelayMs,
    );
  }

  nextAttemptAt(
    now: Date,
    attemptsAlreadyMade: number,
  ): Date {
    return new Date(
      now.getTime() +
        this.calculateDelayMs(
          attemptsAlreadyMade,
        ),
    );
  }

  hasExceededAttempts(
    attempts: number,
  ): boolean {
    return attempts >= this.maxAttempts;
  }

  hasExceededTtl(
    createdAt: Date,
    now: Date,
  ): boolean {
    return (
      now.getTime() -
        createdAt.getTime() >=
      this.ttlMs
    );
  }

  shouldReject(
    createdAt: Date,
    attempts: number,
    now: Date,
  ): boolean {
    return (
      this.hasExceededAttempts(
        attempts,
      ) ||
      this.hasExceededTtl(
        createdAt,
        now,
      )
    );
  }
}
