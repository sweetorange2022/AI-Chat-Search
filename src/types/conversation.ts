/**
 * Unified conversation types — the single source of truth for all message and session data.
 * All providers must map their native data into these types.
 */

/** Role enum — eliminates magic strings */
export const enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
  Tool = 'tool',
}

/** A single conversation message in unified format */
export interface ConversationMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
  readonly toolName?: string;
  /** Model name for assistant messages (e.g. "mimo-v2.5-pro") */
  readonly modelName?: string;
}

/** A conversation session (maps to one task/chat/thread from any provider) */
export interface ConversationSession {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
}