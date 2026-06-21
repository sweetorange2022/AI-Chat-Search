import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ChatProvider } from '../types/provider';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

/** Copilot Chat JSONL line types */
interface CopilotSessionInit {
  readonly kind: 0;
  readonly v: {
    readonly sessionId: string;
    readonly creationDate: number;
    readonly requests: readonly CopilotRequest[];
  };
}

interface CopilotStatePatch {
  readonly kind: 1;
  readonly k: readonly string[];
  readonly v?: unknown;
}

interface CopilotRequest {
  readonly message?: {
    readonly role: string;
    readonly content: string | readonly { readonly type?: string; readonly value?: string }[];
  };
  readonly variables?: unknown;
  readonly response?: readonly CopilotResponsePart[];
}

interface CopilotResponsePart {
  readonly value?: string;
  readonly kind?: string;
}

type CopilotJsonlLine = CopilotSessionInit | CopilotStatePatch;

/** Roles to keep */
const USER_ROLES = new Set(['user']);
const ASSISTANT_ROLES = new Set(['assistant']);
const FILTERED_ROLES = new Set(['system', 'tool']);

const MAX_SESSIONS_DEFAULT = 50;

/**
 * Copilot Chat provider.
 * Reads VS Code Copilot Chat session data from JSONL files.
 * 
 * Data locations:
 * - Workspace: %APPDATA%/Code/User/workspaceStorage/{id}/chatSessions/{sessionId}.jsonl
 * - Empty window: %APPDATA%/Code/User/globalStorage/emptyWindowChatSessions/{sessionId}.jsonl
 */
export class CopilotProvider implements ChatProvider {
  readonly name = 'copilot';
  readonly displayName = 'Copilot Chat';

  private readonly appData: string;
  private readonly editorDirs: readonly string[];
  private readonly maxSessions: number;

  constructor(customPath?: string, maxSessions?: number) {
    this.appData = customPath || process.env.APPDATA || path.join(os.homedir(), '.config');
    this.maxSessions = maxSessions ?? MAX_SESSIONS_DEFAULT;
    this.editorDirs = customPath ? [path.basename(path.dirname(customPath)) || 'Code'] : ['Code', 'Cursor'];
  }

  async detect(): Promise<boolean> {
    for (const editor of this.editorDirs) {
      const codeDir = path.join(this.appData, editor, 'User');
      try {
        const stat = await fs.stat(codeDir);
        if (stat.isDirectory()) return true;
      } catch { /* not found, try next */ }
    }
    return false;
  }

  async loadAll(): Promise<readonly ConversationSession[]> {
    const sessions: ConversationSession[] = [];

    for (const editor of this.editorDirs) {
      const userDir = path.join(this.appData, editor, 'User');

      // 1. Load from workspace storage chatSessions
      await this.loadFromPath(
        path.join(userDir, 'workspaceStorage'),
        'chatSessions',
        sessions,
      );

      // 2. Load from empty window chat sessions
      await this.loadFromPath(
        path.join(userDir, 'globalStorage'),
        'emptyWindowChatSessions',
        sessions,
      );
    }

    // Sort by creation date descending, limit
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    if (this.maxSessions > 0 && sessions.length > this.maxSessions) {
      return sessions.slice(0, this.maxSessions);
    }
    return sessions;
  }

  /**
   * Scan directory tree for chatSessions/*.jsonl or *.jsonl files.
   */
  private async loadFromPath(baseDir: string, subDir: string, result: ConversationSession[]): Promise<void> {
    let entries: string[];
    try {
      const all = await fs.readdir(baseDir, { withFileTypes: true });
      entries = all.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return;
    }

    for (const entry of entries) {
      const chatDir = path.join(baseDir, entry, subDir);
      let files: string[];
      try {
        const stat = await fs.stat(chatDir);
        if (!stat.isDirectory()) continue;
        const fileList = await fs.readdir(chatDir);
        files = fileList.filter(f => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        const session = await this.loadJsonl(path.join(chatDir, file));
        if (session !== null) {
          result.push(session);
        }
      }
    }
  }

  private async loadJsonl(filePath: string): Promise<ConversationSession | null> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }

    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Parse initial state (kind:0)
    let sessionId = '';
    let creationDate = 0;
    let requests: CopilotRequest[] = [];

    for (const line of lines) {
      let parsed: CopilotJsonlLine;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.kind === 0) {
        const init = parsed as CopilotSessionInit;
        sessionId = init.v.sessionId || '';
        creationDate = init.v.creationDate || 0;
        requests = [...(init.v.requests || [])];
      } else if (parsed.kind === 1) {
        // State patch - check if it patches the requests array
        const patch = parsed as CopilotStatePatch;
        if (patch.k && patch.k.length >= 1 && patch.k[0] === 'requests') {
          // Full requests replacement
          if (Array.isArray(patch.v)) {
            requests = patch.v as unknown as CopilotRequest[];
          }
        }
      }
    }

    if (!sessionId) return null;

    const messages = this.parseRequests(requests);
    if (messages.length === 0) return null;

    // Generate title from first user message
    const firstUser = messages.find(m => m.role === MessageRole.User);
    const title = firstUser ? firstUser.content.split('\n')[0].substring(0, 60) || 'Copilot Chat' : 'Copilot Chat';

    const lastTimestamp = messages[messages.length - 1]?.timestamp ?? 0;

    return {
      id: 'copilot-' + sessionId,
      source: this.name,
      title,
      createdAt: creationDate,
      updatedAt: lastTimestamp > 0 ? lastTimestamp : creationDate,
      messages,
    };
  }

  private parseRequests(requests: readonly CopilotRequest[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    for (const req of requests) {
      if (!req.message) continue;
      const role = req.message.role;

      if (FILTERED_ROLES.has(role)) continue;

      const content = this.extractContent(req.message.content);
      if (content.length === 0) continue;

      if (USER_ROLES.has(role)) {
        messages.push({
          role: MessageRole.User,
          content,
          timestamp: 0,
        });
      } else if (ASSISTANT_ROLES.has(role)) {
        // Try to extract response text
        const responseText = req.response
          ?.map(r => r.value ?? '')
          .filter(t => t.length > 0)
          .join('\n') ?? '';

        const finalContent = responseText.length > 0 ? responseText : content;
        if (finalContent.length > 0) {
          messages.push({
            role: MessageRole.Assistant,
            content: finalContent,
            timestamp: 0,
          });
        }
      }
    }

    return messages;
  }

  private extractContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      return raw
        .map(b => {
          if (typeof b === 'string') return b;
          if (typeof b === 'object' && b !== null && 'value' in b) return (b as { value?: string }).value ?? '';
          if (typeof b === 'object' && b !== null && 'text' in b) return (b as { text?: string }).text ?? '';
          return '';
        })
        .filter(t => t.length > 0)
        .join('\n');
    }
    return '';
  }
}