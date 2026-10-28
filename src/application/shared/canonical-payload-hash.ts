import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      canonicalize(item),
    );
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    const object =
      value as Record<string, unknown>;

    const sortedKeys =
      Object.keys(object).sort();

    const canonicalObject:
      Record<string, unknown> = {};

    for (const key of sortedKeys) {
      canonicalObject[key] =
        canonicalize(object[key]);
    }

    return canonicalObject;
  }

  return value;
}

export function canonicalJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalize(value),
  );
}

export function createPayloadHash(
  value: unknown,
): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex');
}