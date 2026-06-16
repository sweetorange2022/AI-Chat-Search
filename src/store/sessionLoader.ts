import type { ChatProvider } from '../types/provider';
import type { SessionStore } from './sessionStore';
import type { Result } from '../errors';
import { ProviderError } from '../errors';

/**
 * Session loader — SRP: orchestrates loading data from Providers into the Store.
 * Does not hold data itself. Single responsibility: load coordination.
 */
export class SessionLoader {
  constructor(
    private readonly store: SessionStore,
    private readonly providers: readonly ChatProvider[],
  ) {}

  /** Load data from all providers. Returns total number of sessions loaded. */
  async loadAll(): Promise<Result<number, ProviderError>> {
    let totalLoaded = 0;

    for (const provider of this.providers) {
      const result = await this.loadProvider(provider);
      if (!result.ok) {
        console.error(`AI Chat Search: Failed to load ${provider.name}:`, result.error);
        continue;
      }
      console.log(`AI Chat Search: ${provider.name} loaded ${result.value} sessions.`);
      totalLoaded += result.value;
    }

    return { ok: true, value: totalLoaded };
  }

  /** Load data from a single provider */
  async loadProvider(provider: ChatProvider): Promise<Result<number, ProviderError>> {
    try {
      const isAvailable = await provider.detect();
      if (!isAvailable) {
        console.warn(`AI Chat Search: ${provider.name} detect() returned false — skipped.`);
        return { ok: true, value: 0 };
      }

      const sessions = await provider.loadAll();
      this.store.upsertAll(sessions);
      return { ok: true, value: sessions.length };
    } catch (cause) {
      return {
        ok: false,
        error: new ProviderError(provider.name, 'Failed to load sessions', cause),
      };
    }
  }

  /** Get the list of registered provider names */
  getProviderNames(): readonly string[] {
    return this.providers.map(p => p.name);
  }
}