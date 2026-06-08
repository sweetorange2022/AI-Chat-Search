import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ChatProvider } from '../types/provider';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

/** Structure of a block in ui_messages.json content array */
interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
}

/** Constants */
const CLINE_STORAGE_DIR = 'saoudrizwan.claude-dev';
const TASKS_DIR = 'tasks';
const UI_MESSAGES_FILE = 'ui_messages.json';
const API_HISTORY_FILE = 'api_conversation_history.json';
const TITLE_PREVIEW_LENGTH = 60;

/** say values that represent user messages */
const USER_SAY_TYPES = new Set(['task', 'user_feedback']);

/** say values that represent assistant text output (kept) */
const ASSISTANT_SAY_TYPES = new Set(['text']);

/** ask values that represent assistant responses (kept) */
const ASSISTANT_ASK_TYPES = new Set(['plan_mode_respond']);

/** say values to filter out (noise) */
const FILTERED_SAY_TYPES = new Set([
  'reasoning',
  'api_req_started',
  'checkpoint_created',
  'task_progress',
  'error',
]);

/** Model display name mapping */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'mimo-v2.5-pro': 'MiMo v2.5 Pro',
  'mimo-v2-pro': 'MiMo v2 Pro',
  'mimo-v2-lite': 'MiMo v2 Lite',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-sonnet-4-5-20250514': 'Claude Sonnet 4.5',
  'claude-3-5-sonnet-20241022': 'Claude Sonnet 3.5',
  'claude-3-opus-20240229': 'Claude Opus 3',
  'claude-3-haiku-20240307': 'Claude Haiku 3',
  'gpt-4o': 'GPT-4o',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4o-mini': 'GPT-4o Mini',
  'deepseek-v3': 'DeepSeek V3',
  'deepseek-r1': 'DeepSeek R1',
};

/**
 * Cline data provider.
 * Reads Cline's ui_messages.json which uses {type, say, text} format (not {role, content}).
 */
export class ClineProvider implements ChatProvider {
  readonly name = 'cline';
  readonly displayName = 'Cline';

  private tasksPath: string;

  private static readonly EDITOR_PATHS = ['Code', 'Cursor', 'VSCodium'];

  constructor(customPath?: string) {
    if (customPath && customPath.length > 0) {
      this.tasksPath = customPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
      // Will be resolved lazily in detect/loadAll
      this.tasksPath = '';
      this.appData = appData;
    }
  }

  /** Resolve tasksPath by checking VS Code, Cursor, VSCodium paths */
  private async resolveTasksPath(): Promise<string> {
    if (this.tasksPath) return this.tasksPath;

    for (const editor of ClineProvider.EDITOR_PATHS) {
      const candidate = path.join(
        this.appData, editor, 'User', 'globalStorage',
        CLINE_STORAGE_DIR, TASKS_DIR,
      );
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          this.tasksPath = candidate;
          return candidate;
        }
      } catch {
        // Not found, try next
      }
    }

    // Fallback to VS Code path even if not found
    this.tasksPath = path.join(
      this.appData, 'Code', 'User', 'globalStorage',
      CLINE_STORAGE_DIR, TASKS_DIR,
    );
    return this.tasksPath;
  }

  private appData: string = '';

  async detect(): Promise<boolean> {
    const resolved = await this.resolveTasksPath();
    try {
      const stat = await fs.stat(resolved);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async loadAll(): Promise<readonly ConversationSession[]> {
    await this.resolveTasksPath();
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(this.tasksPath, { withFileTypes: true });
      entries = dirEntries
        .filter((e: import('fs').Dirent) => e.isDirectory())
        .map((e: import('fs').Dirent) => e.name);
    } catch {
      return [];
    }

    const sessions: ConversationSession[] = [];

    for (const entry of entries) {
      const session = await this.loadSession(entry);
      if (session !== null) {
        sessions.push(session);
      }
    }

    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions;
  }

  private async loadSession(taskId: string): Promise<ConversationSession | null> {
    const taskDir = path.join(this.tasksPath, taskId);
    const messagesPath = path.join(taskDir, UI_MESSAGES_FILE);

    try {
      await fs.access(messagesPath);
    } catch {
      return null;
    }

    let raw: string;
    try {
      raw = await fs.readFile(messagesPath, 'utf-8');
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!Array.isArray(parsed)) {
      return null;
    }

    const messages = this.parseMessages(parsed);
    if (messages.length === 0) {
      return null;
    }

    const modelNames = await this.loadModelNames(taskDir);
    const enriched = this.enrichWithModelNames(messages, modelNames);

    const timestamp = parseInt(taskId, 10);
    const createdAt = isNaN(timestamp) ? 0 : timestamp;
    const lastTimestamp = enriched[enriched.length - 1]?.timestamp ?? 0;

    return {
      id: taskId,
      source: this.name,
      title: this.extractTitle(enriched),
      createdAt,
      updatedAt: lastTimestamp > 0 ? lastTimestamp : createdAt,
      messages: enriched,
    };
  }

  private async loadModelNames(taskDir: string): Promise<readonly string[]> {
    const apiPath = path.join(taskDir, API_HISTORY_FILE);

    let raw: string;
    try {
      raw = await fs.readFile(apiPath, 'utf-8');
    } catch {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const modelNames: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (record.role !== 'assistant') continue;

      const modelInfo = record.modelInfo as Record<string, unknown> | undefined;
      const modelId = modelInfo?.modelId;
      if (typeof modelId === 'string' && modelId.length > 0) {
        modelNames.push(MODEL_DISPLAY_NAMES[modelId] ?? modelId);
      }
    }

    return modelNames;
  }

  private enrichWithModelNames(
    messages: readonly ConversationMessage[],
    modelNames: readonly string[],
  ): readonly ConversationMessage[] {
    let modelIdx = 0;

    return messages.map(msg => {
      if (msg.role === MessageRole.Assistant && modelIdx < modelNames.length) {
        const name = modelNames[modelIdx];
        modelIdx++;
        return { ...msg, modelName: name };
      }
      return msg;
    });
  }

  /**
   * Parse Cline ui_messages.json format.
   * Format: [{ts, type, say/ask, text, modelInfo, partial, ...}, ...]
   *
   * User messages: type=say, say=task or say=user_feedback
   * Assistant messages: type=say, say=text (non-partial) or type=ask, ask=plan_mode_respond
   * Filtered out: say=reasoning, say=api_req_started, say=checkpoint_created, say=task_progress, partial=true
   */
  private parseMessages(raw: readonly unknown[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;

      const msgType = record.type as string | undefined;
      const say = record.say as string | undefined;
      const ask = record.ask as string | undefined;
      const text = record.text;
      const isPartial = record.partial === true;

      // Skip partial streaming messages (incomplete)
      if (isPartial) continue;

      // Skip filtered noise types
      if (say && FILTERED_SAY_TYPES.has(say)) continue;
      if (msgType === 'say' && say === 'checkpoint_created') continue;

      // --- User messages ---
      if (msgType === 'say' && say && USER_SAY_TYPES.has(say)) {
        const content = this.extractTextContent(text);
        if (content.length > 0) {
          messages.push({
            role: MessageRole.User,
            content,
            timestamp: typeof record.ts === 'number' ? record.ts : 0,
          });
        }
        continue;
      }

      // --- Assistant text messages ---
      if (msgType === 'say' && say && ASSISTANT_SAY_TYPES.has(say)) {
        const content = this.extractTextContent(text);
        if (content.length > 0) {
          messages.push({
            role: MessageRole.Assistant,
            content,
            timestamp: typeof record.ts === 'number' ? record.ts : 0,
          });
        }
        continue;
      }

      // --- Assistant ask responses (e.g. plan_mode_respond) ---
      if (msgType === 'ask' && ask && ASSISTANT_ASK_TYPES.has(ask)) {
        const content = this.extractResponseFromAsk(text);
        if (content.length > 0) {
          messages.push({
            role: MessageRole.Assistant,
            content,
            timestamp: typeof record.ts === 'number' ? record.ts : 0,
          });
        }
        continue;
      }
    }

    return messages;
  }

  /** Extract text content, handling string or content block arrays */
  private extractTextContent(raw: unknown): string {
    if (typeof raw === 'string') return raw;

    if (Array.isArray(raw)) {
      return raw
        .filter((b): b is ContentBlock => typeof b === 'object' && b !== null && 'type' in b)
        .map(b => b.text ?? '')
        .filter(t => t.length > 0)
        .join('\n');
    }

    return '';
  }

  /** Extract response text from ask messages (JSON with "response" field) */
  private extractResponseFromAsk(text: unknown): string {
    if (typeof text !== 'string') return '';

    // Try to parse as JSON and extract "response" field
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && typeof parsed.response === 'string') {
        return parsed.response;
      }
    } catch {
      // Not JSON, return as-is
      return text;
    }

    return '';
  }

  private extractTitle(messages: readonly ConversationMessage[]): string {
    const firstUserMsg = messages.find(m => m.role === MessageRole.User);
    if (!firstUserMsg) return 'Untitled';

    const content = firstUserMsg.content;
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length === 0) return 'Untitled';

    return firstLine.length > TITLE_PREVIEW_LENGTH
      ? firstLine.substring(0, TITLE_PREVIEW_LENGTH) + '...'
      : firstLine;
  }
}