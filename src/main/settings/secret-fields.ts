const SECRET_FIELD_PATTERNS = [
  /secret/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer/i,
  /credential/i,
  /password/i
];

export class SecretFieldError extends Error {
  readonly fieldPath: string;

  constructor(fieldPath: string) {
    super(`Settings cannot store secret field "${fieldPath}". Use credential storage instead.`);
    this.name = 'SecretFieldError';
    this.fieldPath = fieldPath;
  }
}

export function rejectSecretFields(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new SecretFieldError(nextPath.join('.'));
    }

    rejectSecretFields(nestedValue, nextPath);
  }
}
