import type { ConversationSession } from '../types/conversation';

/**
 * Pure data container — SRP: only responsible for session data CRUD.
 * All data is held in memory. No side effects, no I/O.
 */
export class SessionStore {
  private readonly sessions = new Map<string, ConversationSession>();

  /** Get a session by ID */
  get(id: string): ConversationSession | undefined {
    return this.sessions.get(id);
  }

  /** Get all sessions sorted by updatedAt descending */
  getAll(): readonly ConversationSession[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get sessions filtered by source */
  getBySource(source: string): readonly ConversationSession[] {
    return this.getAll().filter(s => s.source === source);
  }

  /** Add or update a session */
  upsert(session: ConversationSession): void {
    this.sessions.set(session.id, session);
  }

  /** Bulk write sessions */
  upsertAll(sessions: readonly ConversationSession[]): void {
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }
  }

  /** Remove a session by ID. Returns true if it existed. */
  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** Clear all sessions */
  clear(): void {
    this.sessions.clear();
  }

  /** Number of sessions in the store */
  get size(): number {
    return this.sessions.size;
  }
}