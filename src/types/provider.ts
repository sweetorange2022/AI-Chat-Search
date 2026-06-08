import type { ConversationSession } from './conversation';

/**
 * Data source adapter interface (ISP: minimal interface).
 * Responsible only for reading session data from a local source.
 * File watching is handled externally by FileWatcher.
 */
export interface ChatProvider {
  readonly name: string;
  readonly displayName: string;

  /** Detect whether this platform's data exists */
  detect(): Promise<boolean>;

  /** Load all sessions (one-shot call) */
  loadAll(): Promise<readonly ConversationSession[]>;
}