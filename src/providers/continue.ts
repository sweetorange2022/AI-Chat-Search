import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ChatProvider } from '../types/provider';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

const CONTINUE_DIR = '.continue';
const SESSIONS_DIR = 'sessions';
const SESSIONS_INDEX = 'sessions.json';

/** Continue sessions.json entry */
interface ContinueSessionMeta {
  readonly sessionId: string;
  readonly title: string;
  readonly dateCreated: string;  // epoch ms as string
  readonly workspaceDirectory?: string;
  readonly messageCount?: number;
}

/** Continue history entry (inside individual session file) */
interface ContinueHistoryEntry {
  readonly message: {
    readonly role: string;
    readonly content: string | readonly { readonly type?: string; readonly text?: string }[];
    readonly id?: string;
  };
  readonly promptLogs?: readonly { readonly modelTitle?: string; readonly modelProvider?: string }[];
}

/** Roles to include as messages */
const USER_ROLES = new Set(['user']);
const ASSISTANT_ROLES = new Set(['assistant']);

/** Roles to skip (noise) */
const FILTERED_ROLES = new Set(['thinking', 'tool']);

/**
 * Continue data provider.
 * Reads Continue's session data from ~/.continue/sessions/.
 * Format: sessions.json (index) + {sessionId}.json (individual sessions).
 */
export class ContinueProvider implements ChatProvider {
  readonly name = 'continue';
  readonly displayName = 'Continue';

  private sessionsPath: string;

  constructor(customPath?: string) {
    if (customPath && customPath.length > 0) {
      this.sessionsPath = customPath;
    } else {
      const homeDir = os.homedir();
      this.sessionsPath = path.join(homeDir, CONTINUE_DIR, SESSIONS_DIR);
    }
  }

  async detect(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.sessionsPath);
      if (!stat.isDirectory()) return false;
      // Check if sessions.json exists
      const indexPath = path.join(this.sessionsPath, SESSIONS_INDEX);
      await fs.access(indexPath);
      return true;
    } catch {
      return false;
    }
  }

  async loadAll(): Promise<readonly ConversationSession[]> {
    const indexPath = path.join(this.sessionsPath, SESSIONS_INDEX);
    let raw: string;
    try {
      raw = await fs.readFile(indexPath, 'utf-8');
    } catch {
      return [];
    }

    let metaList: ContinueSessionMeta[];
    try {
      metaList = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(metaList)) return [];

    const sessions: ConversationSession[] = [];
    for (const meta of metaList) {
      const session = await this.loadSession(meta);
      if (session !== null) {
        sessions.push(session);
      }
    }

    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions;
  }

  private async loadSession(meta: ContinueSessionMeta): Promise<ConversationSession | null> {
    const sessionFile = path.join(this.sessionsPath, meta.sessionId + '.json');
    let raw: string;
    try {
      raw = await fs.readFile(sessionFile, 'utf-8');
    } catch {
      return null;
    }

    let parsed: { history?: ContinueHistoryEntry[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!parsed.history || !Array.isArray(parsed.history)) return null;

    const messages = this.parseMessages(parsed.history);
    if (messages.length === 0) return null;

    const createdAt = parseInt(meta.dateCreated, 10);
    const lastTimestamp = messages[messages.length - 1]?.timestamp ?? 0;

    return {
      id: meta.sessionId,
      source: this.name,
      title: meta.title || 'Untitled',
      createdAt: isNaN(createdAt) ? 0 : createdAt,
      updatedAt: lastTimestamp > 0 ? lastTimestamp : createdAt,
      messages,
    };
  }

  private parseMessages(history: readonly ContinueHistoryEntry[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    for (const entry of history) {
      const msg = entry.message;
      if (!msg || !msg.role) continue;

      // Skip filtered roles (thinking, tool results)
      if (FILTERED_ROLES.has(msg.role)) continue;

      const content = this.extractContent(msg.content);
      if (content.length === 0) continue;

      // Extract model name from promptLogs if available
      const modelName = this.extractModelName(entry);

      if (USER_ROLES.has(msg.role)) {
        messages.push({
          role: MessageRole.User,
          content,
          timestamp: 0, // Continue doesn't store per-message timestamps
        });
      } else if (ASSISTANT_ROLES.has(msg.role)) {
        messages.push({
          role: MessageRole.Assistant,
          content,
          timestamp: 0,
          modelName,
        });
      }
    }

    return messages;
  }

  private extractContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;

    if (Array.isArray(raw)) {
      return raw
        .filter((b): b is { readonly type?: string; readonly text?: string } =>
          typeof b === 'object' && b !== null)
        .map(b => b.text ?? '')
        .filter(t => t.length > 0)
        .join('\n');
    }

    return '';
  }

  private extractModelName(entry: ContinueHistoryEntry): string | undefined {
    if (!entry.promptLogs || entry.promptLogs.length === 0) return undefined;
    const firstLog = entry.promptLogs[0];
    if (firstLog.modelTitle && firstLog.modelTitle.length > 0) {
      return firstLog.modelTitle;
    }
    return undefined;
  }
}