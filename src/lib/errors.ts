/**
 * Central application error types.
 *
 * Every server boundary throws one of these. The UI layer maps them to
 * user-friendly German messages (see `src/lib/i18n/de.ts`). Technical detail
 * stays in `cause`/logs and is never sent to the client.
 */

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'AppError';
    this.code = code;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Nicht angemeldet.', cause?: unknown) {
    super('UNAUTHENTICATED', message, cause);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Keine Berechtigung.', cause?: unknown) {
    super('FORBIDDEN', message, cause);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Nicht gefunden.', cause?: unknown) {
    super('NOT_FOUND', message, cause);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors?: Record<string, string[]>;
  constructor(
    message = 'Ungültige Eingabe.',
    fieldErrors?: Record<string, string[]>,
    cause?: unknown,
  ) {
    super('VALIDATION', message, cause);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Konflikt: Die Daten wurden zwischenzeitlich geändert.', cause?: unknown) {
    super('CONFLICT', message, cause);
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Zu viele Versuche. Bitte später erneut versuchen.', cause?: unknown) {
    super('RATE_LIMITED', message, cause);
    this.name = 'RateLimitedError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
