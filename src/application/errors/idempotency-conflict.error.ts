export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used with a different payload');

    this.name = 'IdempotencyConflictError';
  }
}