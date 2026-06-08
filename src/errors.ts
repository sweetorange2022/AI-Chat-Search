/**
 * Unified error handling — Result type and domain-specific errors.
 * Enforces the principle: never swallow errors silently.
 */

/** Result type — forces callers to handle both success and failure */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Provider-specific error */
export class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${providerName}] ${message}`);
    this.name = 'ProviderError';
  }
}