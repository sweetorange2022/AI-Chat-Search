# AI Chat Search - 技术版本记录

本文档包含完整的项目信息和全部源码，可用于完整复现此插件。

## 2026-06-08 — v0.1.0 初版

### 项目概述

VS Code 扩展：跨会话搜索 Cline AI 聊天历史，自定义 Webview 预览，内置 Ctrl+F 搜索栏。

### 已实现功能

1. `Ctrl+Shift+;` 快捷键打开搜索框，从所有 Cline 历史对话中搜索关键词
2. 文档级去重 — 每个对话只显示一条结果，附带该对话中关键词出现总次数
3. 自定义 Webview 预览面板（markdown-it 渲染）
4. 预览内置 Ctrl+F 搜索栏（模仿 VS Code 原生查找体验）
5. 蛋黄色（#FFF176）高亮所有匹配项，亮黄色（#FFEE58）标记当前匹配项
6. 搜索计数器 `1 / N` + 键盘导航（Enter/Shift+Enter/Escape）
7. 智能噪音过滤（tool_call、thinking、environment_details、task_progress 等）
8. 模型名称显示（MiMo v2.5 Pro、Claude Sonnet 4 等）
9. 完整日期时间戳 `YYYY/MM/DD HH:MM:SS`
10. 对话摘要标题（首条消息前 30 字）
11. 连续助手消息合并
12. 多编辑器路径检测（VS Code / Cursor / VSCodium）
13. FileSystemWatcher 增量更新
14. 主题自适应（VS Code CSS 变量）

### 使用的技术

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 构建 | esbuild |
| Markdown 渲染 | markdown-it |
| VS Code API | WebviewPanel、QuickPick、TextDocumentContentProvider、FileSystemWatcher |
| 架构 | SOLID、DIP、SRP |

### 依赖

```json
{
  "dependencies": { "markdown-it": "^14.2.0" },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.22.0",
    "esbuild": "^0.19.11",
    "typescript": "^5.3.3"
  }
}
```

### 项目结构

```
ai-chat-search/
├── package.json
├── tsconfig.json
├── .vscodeignore
├── README.md
├── CHANGELOG.md
├── src/
│   ├── extension.ts
│   ├── errors.ts
│   ├── previewManager.ts
│   ├── types/
│   │   ├── conversation.ts
│   │   ├── provider.ts
│   │   └── search.ts
│   ├── providers/
│   │   └── cline.ts
│   ├── store/
│   │   ├── sessionStore.ts
│   │   └── sessionLoader.ts
│   ├── search/
│   │   └── searchEngine.ts
│   ├── ui/
│   │   ├── quickSearch.ts
│   │   └── conversationViewer.ts
│   └── infra/
│       └── fileWatcher.ts
├── media/
│   ├── preview.css
│   └── preview.js
└── dist/
    └── extension.js (esbuild output)
```

---

## 完整源码

以下包含全部源文件，按依赖关系从底层到上层排列。

---

### package.json

```json
{
  "name": "ai-chat-search",
  "displayName": "AI Chat Search",
  "description": "Search and navigate AI chat history from Cline, Continue, Copilot and more",
  "version": "0.1.0",
  "publisher": "ai-chat-tools",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "aiChatSearch.search", "title": "Search AI Chat History", "icon": "$(search)" },
      { "command": "aiChatSearch.refreshIndex", "title": "Refresh AI Chat Index", "icon": "$(refresh)" }
    ],
    "keybindings": [
      { "command": "aiChatSearch.search", "key": "ctrl+shift+;", "mac": "cmd+shift+;" }
    ],
    "configuration": {
      "title": "AI Chat Search",
      "properties": {
        "aiChatSearch.providers.cline.enabled": { "type": "boolean", "default": true, "description": "Enable Cline chat history search" },
        "aiChatSearch.providers.cline.dataPath": { "type": "string", "default": "", "description": "Custom Cline data path (auto-detected if empty)" },
        "aiChatSearch.maxResults": { "type": "number", "default": 50, "description": "Maximum search results to display" },
        "aiChatSearch.contextLines": { "type": "number", "default": 3, "description": "Number of context lines around each match" }
      }
    }
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --minify",
    "watch": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --sourcemap --watch",
    "lint": "tsc --noEmit",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.22.0",
    "esbuild": "^0.19.11",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "markdown-it": "^14.2.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

### .vscodeignore

```
src/
out/
node_modules/
tsconfig.json
.gitignore
.vscode/
**/*.map
*.py
portfolio-website/
tools/
security/
scripts/
design/
docs/
memory/
supabase/
.env*
.vscode-mcp/
.cursor/
.claude/
.cursorignore
.cursorrules
.mcp.json
```

---

### src/errors.ts — 统一错误处理

```typescript
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

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
```

---

### src/types/conversation.ts — 核心数据类型

```typescript
export const enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
  Tool = 'tool',
}

export interface ConversationMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
  readonly toolName?: string;
  readonly modelName?: string;
}

export interface ConversationSession {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
}
```

### src/types/provider.ts — Provider 接口

```typescript
import type { ConversationSession } from './conversation';

export interface ChatProvider {
  readonly name: string;
  readonly displayName: string;
  detect(): Promise<boolean>;
  loadAll(): Promise<readonly ConversationSession[]>;
}
```

### src/types/search.ts — 搜索类型

```typescript
import type { ConversationSession } from './conversation';

export interface SearchFilter {
  readonly source?: string;
  readonly afterTimestamp?: number;
}

export interface SearchQuery {
  readonly keyword: string;
  readonly filter?: SearchFilter;
  readonly maxResults?: number;
}

export interface SearchResult {
  readonly session: ConversationSession;
  readonly messageIndex: number;
  readonly contextSnippet: string;
  readonly score: number;
  readonly matchCount: number;
}

export interface SearchResultSet {
  readonly results: readonly SearchResult[];
  readonly totalCount: number;
  readonly truncated: boolean;
}
```

---

### src/providers/cline.ts — Cline 数据适配器

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ChatProvider } from '../types/provider';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
}

const CLINE_STORAGE_DIR = 'saoudrizwan.claude-dev';
const TASKS_DIR = 'tasks';
const UI_MESSAGES_FILE = 'ui_messages.json';
const API_HISTORY_FILE = 'api_conversation_history.json';
const TITLE_PREVIEW_LENGTH = 60;

const USER_SAY_TYPES = new Set(['task', 'user_feedback']);
const ASSISTANT_SAY_TYPES = new Set(['text']);
const ASSISTANT_ASK_TYPES = new Set(['plan_mode_respond']);
const FILTERED_SAY_TYPES = new Set([
  'reasoning', 'api_req_started', 'checkpoint_created', 'task_progress', 'error',
]);

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

export class ClineProvider implements ChatProvider {
  readonly name = 'cline';
  readonly displayName = 'Cline';
  private tasksPath: string;
  private appData: string = '';
  private static readonly EDITOR_PATHS = ['Code', 'Cursor', 'VSCodium'];

  constructor(customPath?: string) {
    if (customPath && customPath.length > 0) {
      this.tasksPath = customPath;
    } else {
      this.appData = process.env.APPDATA || path.join(os.homedir(), '.config');
      this.tasksPath = '';
    }
  }

  private async resolveTasksPath(): Promise<string> {
    if (this.tasksPath) return this.tasksPath;
    for (const editor of ClineProvider.EDITOR_PATHS) {
      const candidate = path.join(this.appData, editor, 'User', 'globalStorage', CLINE_STORAGE_DIR, TASKS_DIR);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) { this.tasksPath = candidate; return candidate; }
      } catch { /* try next */ }
    }
    this.tasksPath = path.join(this.appData, 'Code', 'User', 'globalStorage', CLINE_STORAGE_DIR, TASKS_DIR);
    return this.tasksPath;
  }

  async detect(): Promise<boolean> {
    const resolved = await this.resolveTasksPath();
    try { return (await fs.stat(resolved)).isDirectory(); } catch { return false; }
  }

  async loadAll(): Promise<readonly ConversationSession[]> {
    await this.resolveTasksPath();
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(this.tasksPath, { withFileTypes: true });
      entries = dirEntries.filter(e => e.isDirectory()).map(e => e.name);
    } catch { return []; }
    const sessions: ConversationSession[] = [];
    for (const entry of entries) {
      const session = await this.loadSession(entry);
      if (session !== null) sessions.push(session);
    }
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions;
  }

  private async loadSession(taskId: string): Promise<ConversationSession | null> {
    const taskDir = path.join(this.tasksPath, taskId);
    const messagesPath = path.join(taskDir, UI_MESSAGES_FILE);
    try { await fs.access(messagesPath); } catch { return null; }
    let raw: string;
    try { raw = await fs.readFile(messagesPath, 'utf-8'); } catch { return null; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!Array.isArray(parsed)) return null;
    const messages = this.parseMessages(parsed);
    if (messages.length === 0) return null;
    const modelNames = await this.loadModelNames(taskDir);
    const enriched = this.enrichWithModelNames(messages, modelNames);
    const timestamp = parseInt(taskId, 10);
    const createdAt = isNaN(timestamp) ? 0 : timestamp;
    const lastTimestamp = enriched[enriched.length - 1]?.timestamp ?? 0;
    return {
      id: taskId, source: this.name, title: this.extractTitle(enriched),
      createdAt, updatedAt: lastTimestamp > 0 ? lastTimestamp : createdAt, messages: enriched,
    };
  }

  private async loadModelNames(taskDir: string): Promise<readonly string[]> {
    const apiPath = path.join(taskDir, API_HISTORY_FILE);
    let raw: string;
    try { raw = await fs.readFile(apiPath, 'utf-8'); } catch { return []; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
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

  private enrichWithModelNames(messages: readonly ConversationMessage[], modelNames: readonly string[]): readonly ConversationMessage[] {
    let modelIdx = 0;
    return messages.map(msg => {
      if (msg.role === MessageRole.Assistant && modelIdx < modelNames.length) {
        const name = modelNames[modelIdx]; modelIdx++;
        return { ...msg, modelName: name };
      }
      return msg;
    });
  }

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
      if (isPartial) continue;
      if (say && FILTERED_SAY_TYPES.has(say)) continue;
      if (msgType === 'say' && say === 'checkpoint_created') continue;
      // User messages
      if (msgType === 'say' && say && USER_SAY_TYPES.has(say)) {
        const content = this.extractTextContent(text);
        if (content.length > 0) {
          messages.push({ role: MessageRole.User, content, timestamp: typeof record.ts === 'number' ? record.ts : 0 });
        }
        continue;
      }
      // Assistant text messages
      if (msgType === 'say' && say && ASSISTANT_SAY_TYPES.has(say)) {
        const content = this.extractTextContent(text);
        if (content.length > 0) {
          messages.push({ role: MessageRole.Assistant, content, timestamp: typeof record.ts === 'number' ? record.ts : 0 });
        }
        continue;
      }
      // Assistant ask responses (plan_mode_respond)
      if (msgType === 'ask' && ask && ASSISTANT_ASK_TYPES.has(ask)) {
        const content = this.extractResponseFromAsk(text);
        if (content.length > 0) {
          messages.push({ role: MessageRole.Assistant, content, timestamp: typeof record.ts === 'number' ? record.ts : 0 });
        }
        continue;
      }
    }
    return messages;
  }

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

  private extractResponseFromAsk(text: unknown): string {
    if (typeof text !== 'string') return '';
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && typeof parsed.response === 'string') return parsed.response;
    } catch { return text; }
    return '';
  }

  private extractTitle(messages: readonly ConversationMessage[]): string {
    const firstUserMsg = messages.find(m => m.role === MessageRole.User);
    if (!firstUserMsg) return 'Untitled';
    const firstLine = firstUserMsg.content.split('\n')[0].trim();
    if (firstLine.length === 0) return 'Untitled';
    return firstLine.length > TITLE_PREVIEW_LENGTH ? firstLine.substring(0, TITLE_PREVIEW_LENGTH) + '...' : firstLine;
  }
}
```

**Cline 数据格式说明：** Cline 将对话存储在 `%APPDATA%/{Editor}/User/globalStorage/saoudrizwan.claude-dev/tasks/{timestamp}/` 目录下，每个任务包含：
- `ui_messages.json`：UI 展示用消息数组，格式为 `[{ts, type:"say", say:"task"|"text"|"reasoning"|..., text, partial, modelInfo}]`
- `api_conversation_history.json`：API 调用历史，含 `modelInfo.modelId` 用于获取模型名称

**消息类型映射：**
- 用户消息：`type="say"`, `say="task"` 或 `say="user_feedback"`
- 助手文本：`type="say"`, `say="text"` (partial=false)
- 助手计划响应：`type="ask"`, `ask="plan_mode_respond"` (text 字段为 JSON，需解析 response 字段)
- 噪音（过滤）：`say` 为 `reasoning`、`api_req_started`、`checkpoint_created`、`task_progress`、`error`，以及 `partial=true`

---

### src/store/sessionStore.ts — 数据存储

```typescript
import type { ConversationSession } from '../types/conversation';

export class SessionStore {
  private readonly sessions = new Map<string, ConversationSession>();

  get(id: string): ConversationSession | undefined { return this.sessions.get(id); }
  getAll(): readonly ConversationSession[] { return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt); }
  getBySource(source: string): readonly ConversationSession[] { return this.getAll().filter(s => s.source === source); }
  upsert(session: ConversationSession): void { this.sessions.set(session.id, session); }
  upsertAll(sessions: readonly ConversationSession[]): void { for (const s of sessions) this.sessions.set(s.id, s); }
  remove(id: string): boolean { return this.sessions.delete(id); }
  clear(): void { this.sessions.clear(); }
  get size(): number { return this.sessions.size; }
}
```

### src/store/sessionLoader.ts — 加载编排

```typescript
import type { ChatProvider } from '../types/provider';
import type { SessionStore } from './sessionStore';
import type { Result } from '../errors';
import { ProviderError } from '../errors';

export class SessionLoader {
  constructor(private readonly store: SessionStore, private readonly providers: readonly ChatProvider[]) {}

  async loadAll(): Promise<Result<number, ProviderError>> {
    let totalLoaded = 0;
    for (const provider of this.providers) {
      const result = await this.loadProvider(provider);
      if (!result.ok) { console.error(`AI Chat Search: Failed to load ${provider.name}:`, result.error); continue; }
      totalLoaded += result.value;
    }
    return { ok: true, value: totalLoaded };
  }

  async loadProvider(provider: ChatProvider): Promise<Result<number, ProviderError>> {
    try {
      const isAvailable = await provider.detect();
      if (!isAvailable) return { ok: true, value: 0 };
      const sessions = await provider.loadAll();
      this.store.upsertAll(sessions);
      return { ok: true, value: sessions.length };
    } catch (cause) {
      return { ok: false, error: new ProviderError(provider.name, 'Failed to load sessions', cause) };
    }
  }

  getProviderNames(): readonly string[] { return this.providers.map(p => p.name); }
}
```

---

### src/search/searchEngine.ts — 搜索引擎（文档级去重）

```typescript
import type { SessionStore } from '../store/sessionStore';
import type { SearchQuery, SearchResult, SearchResultSet } from '../types/search';
import type { ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

const DEFAULT_MAX_RESULTS = 50;
const CONTEXT_LINES = 2;
const TITLE_MATCH_BONUS = 3;
const USER_ROLE_BONUS = 2;
const SNIPPET_MAX_LENGTH = 300;
const MATCH_NOT_FOUND = -1;

export class SearchEngine {
  constructor(private readonly store: SessionStore) {}

  search(query: SearchQuery): SearchResultSet {
    const keyword = query.keyword.toLowerCase();
    const maxResults = query.maxResults ?? DEFAULT_MAX_RESULTS;
    const filter = query.filter;
    if (keyword.length === 0) return { results: [], totalCount: 0, truncated: false };

    let sessions = this.store.getAll();
    if (filter?.source) sessions = sessions.filter(s => s.source === filter.source);
    if (filter?.afterTimestamp !== undefined) sessions = sessions.filter(s => s.updatedAt >= filter.afterTimestamp!);

    const allResults: SearchResult[] = [];
    for (const session of sessions) {
      const titleMatches = session.title.toLowerCase().includes(keyword);
      let matchCount = 0;
      let bestIndex = -1;
      let bestScore = -1;
      let bestSnippet = '';
      for (let i = 0; i < session.messages.length; i++) {
        const message = session.messages[i];
        if (!message.content.toLowerCase().includes(keyword)) continue;
        matchCount++;
        const score = this.calculateScore(message.role, titleMatches);
        if (score > bestScore) {
          bestScore = score; bestIndex = i;
          bestSnippet = this.buildSnippet(message, keyword);
        }
      }
      if (matchCount > 0 && bestIndex >= 0) {
        allResults.push({ session, messageIndex: bestIndex, contextSnippet: bestSnippet, score: bestScore, matchCount });
      }
    }

    allResults.sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return b.matchCount - a.matchCount; });
    const truncated = allResults.length > maxResults;
    return { results: allResults.slice(0, maxResults), totalCount: allResults.length, truncated };
  }

  private calculateScore(role: MessageRole, titleMatches: boolean): number {
    let score = 1;
    if (role === MessageRole.User) score += USER_ROLE_BONUS;
    if (titleMatches) score += TITLE_MATCH_BONUS;
    return score;
  }

  private buildSnippet(message: ConversationMessage, keyword: string): string {
    const lines = message.content.split('\n');
    const matchLineIndex = lines.findIndex(l => l.toLowerCase().includes(keyword.toLowerCase()));
    if (matchLineIndex === MATCH_NOT_FOUND) {
      return message.content.length > SNIPPET_MAX_LENGTH ? message.content.substring(0, SNIPPET_MAX_LENGTH) + '...' : message.content;
    }
    const start = Math.max(0, matchLineIndex - CONTEXT_LINES);
    const end = Math.min(lines.length, matchLineIndex + CONTEXT_LINES + 1);
    const snippet = lines.slice(start, end).join('\n');
    return snippet.length > SNIPPET_MAX_LENGTH ? snippet.substring(0, SNIPPET_MAX_LENGTH) + '...' : snippet;
  }
}
```

---

### src/ui/quickSearch.ts — QuickPick 搜索列表

```typescript
import * as vscode from 'vscode';
import type { SearchEngine } from '../search/searchEngine';
import type { SearchResult } from '../types/search';

const DEBOUNCE_DELAY_MS = 300;
const DEFAULT_MAX_RESULTS = 50;

export class QuickSearch implements vscode.Disposable {
  private quickPick: vscode.QuickPick<vscode.QuickPickItem> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private currentResults: readonly SearchResult[] = [];
  private suppressActiveChange = false;
  private currentActiveIndex = 0;

  constructor(
    private readonly searchEngine: SearchEngine,
    private readonly onResultSelected: (result: SearchResult, keyword: string) => void,
    private readonly countKeywordInSession?: (result: SearchResult, keyword: string) => number,
  ) {}

  show(): void {
    if (this.quickPick) this.quickPick.dispose();
    const qp = vscode.window.createQuickPick();
    this.quickPick = qp;
    qp.placeholder = 'Search AI chat history... (arrows to browse, Enter to open)';
    qp.matchOnDescription = false; qp.matchOnDetail = false; qp.canSelectMany = false;
    this.currentResults = []; this.suppressActiveChange = false;

    qp.onDidChangeValue(() => this.debounceSearch(qp));
    qp.onDidChangeActive(() => {
      if (this.suppressActiveChange) return;
      const active = qp.activeItems[0]; if (!active) return;
      const index = qp.items.indexOf(active);
      if (index >= 0 && index < this.currentResults.length) { this.currentActiveIndex = index; this.updateCounter(qp); }
    });
    qp.onDidAccept(() => {
      const selected = qp.selectedItems[0]; if (!selected) return;
      const index = qp.items.indexOf(selected);
      if (index >= 0 && index < this.currentResults.length) this.onResultSelected(this.currentResults[index], qp.value.trim());
      qp.hide();
    });
    qp.onDidHide(() => { qp.dispose(); this.quickPick = undefined; });
    qp.show();
  }

  private debounceSearch(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.executeSearch(qp), DEBOUNCE_DELAY_MS);
  }

  private executeSearch(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    const query = qp.value.trim();
    if (query.length === 0) { this.suppressActiveChange = true; qp.items = []; this.currentResults = []; this.suppressActiveChange = false; qp.busy = false; return; }
    qp.busy = true;
    setTimeout(() => {
      const resultSet = this.searchEngine.search({ keyword: query, maxResults: DEFAULT_MAX_RESULTS });
      this.suppressActiveChange = true; this.currentResults = resultSet.results;
      qp.items = resultSet.results.map(r => this.toQuickPickItem(r));
      this.suppressActiveChange = false; qp.busy = false;
      this.currentActiveIndex = 0;
      if (resultSet.totalCount > 0) {
        const truncMsg = resultSet.truncated ? ` (showing first ${DEFAULT_MAX_RESULTS})` : '';
        qp.placeholder = `Found ${resultSet.totalCount} documents${truncMsg} -- arrows to browse, Enter to open preview`;
        this.updateCounter(qp);
      } else { qp.placeholder = 'No matches found. Try a different keyword.'; }
    }, 0);
  }

  private toQuickPickItem(result: SearchResult): vscode.QuickPickItem {
    const session = result.session;
    return {
      label: `[${session.source}] ${session.title}`,
      description: `${new Date(session.createdAt).toLocaleDateString()}  (${result.matchCount} matches)`,
      detail: this.truncateSnippet(result.contextSnippet),
      alwaysShow: true,
    };
  }

  private truncateSnippet(text: string): string { return text.length <= 200 ? text : text.substring(0, 200) + '...'; }

  private updateCounter(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    if (this.currentResults.length === 0) return;
    const current = this.currentActiveIndex + 1, total = this.currentResults.length, keyword = qp.value.trim();
    if (this.countKeywordInSession) {
      const sc = this.countKeywordInSession(this.currentResults[this.currentActiveIndex], keyword);
      qp.placeholder = `[${current}/${total}] ${sc} keyword matches in this conversation -- arrows to browse, Enter to open`;
    } else { qp.placeholder = `[${current}/${total}] -- arrows to browse, Enter to open`; }
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) { clearTimeout(this.debounceTimer); this.debounceTimer = undefined; }
    if (this.quickPick) { this.quickPick.dispose(); this.quickPick = undefined; }
    this.currentResults = [];
  }
}
```

---

### src/ui/conversationViewer.ts — 对话渲染器

```typescript
import * as vscode from 'vscode';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

const HEADING_PREFIX = '### ';

const ROLE_EMOJI: Record<string, string> = {
  [MessageRole.User]: '👤', [MessageRole.Assistant]: '🤖', [MessageRole.System]: '⚙️', [MessageRole.Tool]: '🔧',
};
const ROLE_LABEL: Record<string, string> = {
  [MessageRole.User]: '用户', [MessageRole.Assistant]: '助手', [MessageRole.System]: '系统', [MessageRole.Tool]: '工具',
};

export class ConversationViewer implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private activeSession: ConversationSession | undefined;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    if (!this.activeSession) return 'No conversation loaded.';
    return this.renderMarkdown(this.activeSession);
  }

  countKeywordInSession(session: ConversationSession, keyword: string): number {
    const kw = keyword.toLowerCase(); let count = 0;
    for (const msg of session.messages) {
      const c = msg.content.toLowerCase(); let pos = 0;
      while (pos < c.length) { const idx = c.indexOf(kw, pos); if (idx === -1) break; count++; pos = idx + kw.length; }
    }
    return count;
  }

  getSessionTitle(session: ConversationSession): string {
    const title = session.title || '';
    return title.length <= 30 ? title || 'AI 对话' : title.substring(0, 30) + '...';
  }

  renderSessionMarkdown(session: ConversationSession): string { return this.renderMarkdown(session); }

  private renderMarkdown(session: ConversationSession): string {
    const date = session.createdAt > 0 ? new Date(session.createdAt).toLocaleString() : 'Unknown date';
    const merged = this.mergeConsecutiveAssistant(session.messages);
    const header = ['# ' + this.getSessionTitle(session), '> Source: ' + session.source.toUpperCase() + ' | Created: ' + date + ' | Messages: ' + merged.length, '', '---', ''].join('\n');
    const body = merged.map((msg, index) => this.renderMessage(msg, index)).filter(s => s.length > 0).join('\n\n---\n\n');
    return header + body;
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  private renderMessage(msg: ConversationMessage, index: number): string {
    const emoji = ROLE_EMOJI[msg.role] ?? '❓';
    const time = msg.timestamp > 0 ? this.formatTimestamp(msg.timestamp) : '';
    let label: string;
    if (msg.role === MessageRole.Assistant && msg.modelName) label = msg.modelName;
    else if (msg.role === MessageRole.User) label = '用户';
    else label = ROLE_LABEL[msg.role] ?? '助手';
    const heading = `### ${index + 1}. ${emoji} ${label}${time ? ' (' + time + ')' : ''}`;
    const cleaned = this.cleanContent(msg.content);
    if (cleaned.length === 0) return '';
    if (msg.role === MessageRole.User) return heading + '\n\n> ' + cleaned.replace(/\n/g, '\n> ');
    return heading + '\n\n' + cleaned;
  }

  private mergeConsecutiveAssistant(messages: readonly ConversationMessage[]): readonly ConversationMessage[] {
    const result: ConversationMessage[] = [];
    for (const msg of messages) {
      const cleaned = this.cleanContent(msg.content);
      if (cleaned.length === 0) continue;
      const lastIdx = result.length - 1;
      const lastMsg = lastIdx >= 0 ? result[lastIdx] : undefined;
      if (lastMsg && msg.role === MessageRole.Assistant && lastMsg.role === MessageRole.Assistant && msg.modelName === lastMsg.modelName) {
        result[lastIdx] = { ...lastMsg, content: lastMsg.content + '\n\n' + cleaned, timestamp: Math.max(lastMsg.timestamp, msg.timestamp) };
      } else { result.push({ ...msg, content: cleaned }); }
    }
    return result;
  }

  private cleanContent(content: string): string {
    let c = content;
    c = c.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
    c = c.replace(/<tool_call>[\s\S]*?(?=\n\n|$)/g, '');
    c = c.replace(/```tool_call[\s\S]*?```/g, '');
    c = c.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '');
    c = c.replace(/\s*<tool_call[\s>][\s\S]*?(?=\n\n|$)/gm, '');
    c = c.replace(/<\/?tool_call[^>]*>/g, '');
    c = c.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    c = c.replace(/<thinking>[\s\S]*?(?=\n\n|$)/g, '');
    c = c.replace(/^Let me (think|consider|analyze|check|look|see|review|examine|now|first|continue)[^\n]*$/gim, '');
    c = c.replace(/^Need to (update|fix|modify|change|add|remove|create|implement)[^\n]*$/gim, '');
    c = c.replace(/^I (need to|should|will|can|must|have)[^\n]*$/gim, '');
    c = c.replace(/^Now (I|let|we)[^\n]*$/gim, '');
    c = c.replace(/^(Good|Great|Okay|OK|Sure|Certainly|Alright)[,!.][^\n]*$/gim, '');
    c = c.replace(/^The file was (cleared|reverted)[^\n]*$/gim, '');
    c = c.replace(/^The user (is asking|wants|has|provided)[^\n]*$/gim, '');
    c = c.replace(/<environment_details>[\s\S]*?<\/environment_details>/g, '');
    c = c.replace(/<\/?environment_details>/g, '');
    c = c.replace(/<task_progress>[\s\S]*?<\/task_progress>/g, '');
    c = c.replace(/<\/?task_progress>/g, '');
    c = c.replace(/^# Visual Studio Code Visible Files[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Current Time.*$/gm, '');
    c = c.replace(/^# Current Working Directory.*$/gm, '');
    c = c.replace(/^# Workspace Configuration[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Detected CLI Tools[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Inactive Terminals[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Actively Running Terminals[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Current Mode.*$/gm, '');
    c = c.replace(/^# Context Window Usage.*$/gm, '');
    c = c.replace(/^# Open Tabs.*$/gm, '');
    c = c.replace(/^In this mode you should[\s\S]*?(?=\n\n\w|$)/gm, '');
    c = c.replace(/^# TODO LIST UPDATE REQUIRED[\s\S]*?(?=\n#|\n\n\w|$)/gm, '');
    c = c.replace(/\{"request":"\[.*?"tokensIn":\d+.*?\}/g, '');
    c = c.replace(/\{"tokensIn":\d+.*?"cost":[\d.]+\}/g, '');
    c = c.replace(/\[execute_command for .*?\] Result:[\s\S]*?(?=\n\n\w|\n#|$)/g, '');
    c = c.replace(/^### New Output[\s\S]*?(?=\n\n\w|\n#|$)/gm, '');
    c = c.replace(/^task_progress List.*$/gm, '');
    c = c.replace(/^While in PLAN MODE.*$/gm, '');
    c = c.replace(/^Reminder: how to use.*$/gm, '');
    c = c.replace(/\[task_progress\][\s\S]*?\[\/task_progress\]/g, '');
    c = c.replace(/^\*\*Current Progress:.*$/gm, '');
    c = c.replace(/^\*\*Note:.*items are complete.*$/gm, '');
    c = c.replace(/\n{3,}/g, '\n\n');
    return c.trim();
  }

  dispose(): void { this.onDidChangeEmitter.dispose(); }
}
```

---

### src/previewManager.ts — Webview 面板管理

```typescript
import * as vscode from 'vscode';
import MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

export class PreviewManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  constructor(private readonly extensionUri: vscode.Uri) {}

  openPreview(markdownContent: string, keyword?: string, title?: string): void {
    const htmlBody = md.render(markdownContent);
    const panelTitle = title || 'AI Chat Search';
    if (this.panel) {
      this.panel.title = panelTitle;
      this.panel.webview.postMessage({ command: 'render', html: htmlBody, keyword: keyword || '' });
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    this.panel = vscode.window.createWebviewPanel('aiChatSearchPreview', panelTitle,
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] });
    this.panel.webview.html = this.getWebviewContent(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'ready') {
        this.panel?.webview.postMessage({ command: 'render', html: htmlBody, keyword: keyword || '' });
      }
    });
    this.panel.onDidDispose(() => { this.panel = undefined; this.onDidDisposeEmitter.fire(); });
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css'));
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
<link rel="stylesheet" href="${stylesUri}"><title>AI Chat Search</title></head>
<body>
<div id="search-bar" class="search-bar hidden">
  <div class="search-input-wrapper">
    <input type="text" id="search-input" placeholder="Find" />
    <span id="search-count" class="search-count">No results</span>
  </div>
  <div class="search-actions">
    <button id="btn-prev" title="Previous (Shift+Enter)">&#9650;</button>
    <button id="btn-next" title="Next (Enter)">&#9660;</button>
    <button id="btn-close" title="Close (Escape)">&#10005;</button>
  </div>
</div>
<div id="content"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
  }

  private getNonce(): string {
    let text = ''; const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
  }

  dispose(): void { this.panel?.dispose(); this.onDidDisposeEmitter.dispose(); }
}
```

---

### src/infra/fileWatcher.ts — 文件监听

```typescript
import * as vscode from 'vscode';
import type { SessionStore } from '../store/sessionStore';
import type { SessionLoader } from '../store/sessionLoader';

export class FileWatcher implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  constructor(private readonly store: SessionStore, private readonly loader: SessionLoader) { this.setupWatchers(); }

  private setupWatchers(): void {
    const appData = process.env.APPDATA;
    if (!appData) return;
    const pattern = new vscode.RelativePattern(appData, 'Code/User/globalStorage/saoudrizwan.claude-dev/tasks/**/ui_messages.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(uri => this.handleFileChange(uri));
    watcher.onDidCreate(uri => this.handleFileChange(uri));
    watcher.onDidDelete(uri => this.handleFileDeletion(uri));
    this.watchers.push(watcher);
  }

  private handleFileChange(_uri: vscode.Uri): void {
    this.loader.loadAll().catch(err => console.error('AI Chat Search: Failed to reload:', err));
  }

  private handleFileDeletion(uri: vscode.Uri): void {
    const taskId = this.extractTaskId(uri.fsPath);
    if (taskId) this.store.remove(taskId);
  }

  private extractTaskId(filePath: string): string | null {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const tasksIdx = parts.indexOf('tasks');
    if (tasksIdx === -1 || tasksIdx + 1 >= parts.length) return null;
    return parts[tasksIdx + 1] || null;
  }

  dispose(): void { for (const w of this.watchers) w.dispose(); this.watchers.length = 0; }
}
```

---

### src/extension.ts — 入口文件

```typescript
import * as vscode from 'vscode';
import { ClineProvider } from './providers/cline';
import { SessionStore } from './store/sessionStore';
import { SessionLoader } from './store/sessionLoader';
import { SearchEngine } from './search/searchEngine';
import { QuickSearch } from './ui/quickSearch';
import { ConversationViewer } from './ui/conversationViewer';
import { PreviewManager } from './previewManager';
import { FileWatcher } from './infra/fileWatcher';

const VIEWER_SCHEME = 'ai-chat-viewer';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('aiChatSearch');
  const clineEnabled = config.get<boolean>('providers.cline.enabled', true);
  const clineCustomPath = config.get<string>('providers.cline.dataPath', '');

  const store = new SessionStore();
  const providers = [];
  if (clineEnabled) providers.push(new ClineProvider(clineCustomPath || undefined));

  const loader = new SessionLoader(store, providers);
  const searchEngine = new SearchEngine(store);
  const viewer = new ConversationViewer();
  const previewManager = new PreviewManager(context.extensionUri);

  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(VIEWER_SCHEME, viewer));

  const loadResult = await loader.loadAll();
  if (!loadResult.ok) vscode.window.showWarningMessage('AI Chat Search: Some providers failed to load.');

  const fileWatcher = new FileWatcher(store, loader);
  context.subscriptions.push(fileWatcher);

  const quickSearch = new QuickSearch(
    searchEngine,
    async (result, keyword) => {
      const mdContent = viewer.renderSessionMarkdown(result.session);
      const title = viewer.getSessionTitle(result.session);
      previewManager.openPreview(mdContent, keyword, title);
    },
    (result, keyword) => viewer.countKeywordInSession(result.session, keyword),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiChatSearch.search', () => quickSearch.show()),
    vscode.commands.registerCommand('aiChatSearch.refreshIndex', async () => {
      store.clear();
      const r = await loader.loadAll();
      if (r.ok) vscode.window.showInformationMessage(`AI Chat Search: Index refreshed. ${r.value} sessions loaded.`);
      else vscode.window.showErrorMessage('AI Chat Search: Failed to refresh index.');
    }),
    quickSearch, viewer, previewManager,
  );
}

export function deactivate(): void {}
```

---

### media/preview.css — Webview 样式

```css
* { box-sizing: border-box; }
body { color: var(--vscode-editor-foreground, #ccc); background-color: var(--vscode-editor-background, #1e1e1e); font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif); font-size: var(--vscode-editor-font-size, 14px); line-height: 1.6; padding: 0; margin: 0; overflow-x: hidden; }

.search-bar { position: sticky; top: 0; z-index: 1000; background-color: var(--vscode-editorWidget-background, #252526); color: var(--vscode-editorWidget-foreground, #ccc); border-bottom: 1px solid var(--vscode-widget-border, #333); padding: 2px 8px; display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 13px; }
.search-bar.hidden { display: none; }
.search-input-wrapper { display: flex; align-items: center; gap: 4px; flex: 0 1 auto; }
.search-bar input[type="text"] { background: var(--vscode-input-background, #3c3c3c); color: var(--vscode-input-foreground, #ccc); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 2px; padding: 2px 6px; font-size: 13px; font-family: var(--vscode-editor-font-family, sans-serif); outline: none; width: 200px; }
.search-bar input[type="text"]:focus { border-color: var(--vscode-focusBorder, #007acc); }
.search-bar input[type="text"].no-match { border-color: var(--vscode-inputValidation-errorBorder, #f44); background-color: var(--vscode-inputValidation-errorBackground, rgba(244,68,68,0.1)); }
.search-count { font-size: 12px; color: var(--vscode-descriptionForeground, #999); min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; user-select: none; white-space: nowrap; }
.search-actions { display: flex; align-items: center; gap: 1px; flex-shrink: 0; }
.search-bar button { background: transparent; color: var(--vscode-editorWidget-foreground, #ccc); border: none; border-radius: 3px; padding: 1px 4px; cursor: pointer; font-size: 12px; line-height: 1.2; flex-shrink: 0; }
.search-bar button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); }

#content { word-wrap: break-word; overflow-wrap: break-word; padding: 16px 24px; }
#content h1, #content h2, #content h3, #content h4 { border-bottom: 1px solid var(--vscode-panel-border, #333); padding-bottom: 4px; margin-top: 24px; }
#content h1 { font-size: 1.8em; border-bottom-width: 2px; }
#content h2 { font-size: 1.4em; }
#content h3 { font-size: 1.15em; border-bottom: none; }
#content hr { border: none; border-top: 1px solid var(--vscode-panel-border, #333); margin: 16px 0; }
#content blockquote { border-left: 4px solid var(--vscode-textBlockQuote-border, #3794ff); padding: 4px 16px; margin: 8px 0; background-color: var(--vscode-textBlockQuote-background, rgba(55,148,255,0.06)); color: var(--vscode-descriptionForeground, #999); }
#content code { background-color: var(--vscode-textCodeBlock-background, #2a2a2a); padding: 2px 5px; border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }
#content pre { background-color: var(--vscode-textCodeBlock-background, #1e1e1e); border: 1px solid var(--vscode-panel-border, #333); border-radius: 4px; padding: 12px; overflow-x: auto; }
#content pre code { background: none; padding: 0; }
#content a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
#content a:hover { text-decoration: underline; }
#content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
#content th, #content td { border: 1px solid var(--vscode-panel-border, #333); padding: 6px 12px; text-align: left; }
#content th { background-color: var(--vscode-editorWidget-background, #252526); }
#content ul, #content ol { padding-left: 24px; }
#content li { margin: 4px 0; }
#content img { max-width: 100%; height: auto; }

.search-highlight { background-color: #FFF176; color: inherit; border-radius: 2px; padding: 1px 0; transition: background-color 0.12s; }
.search-highlight.active { background-color: #FFEE58; outline: 2px solid #FBC02D; outline-offset: 1px; }
```

---

### media/preview.js — Webview 搜索交互

```javascript
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();
  var currentIndex = 0, totalMatches = 0, currentKeyword = '', debounceTimer = null;
  var searchBar = document.getElementById('search-bar');
  var searchInput = document.getElementById('search-input');
  var searchCount = document.getElementById('search-count');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
  var btnClose = document.getElementById('btn-close');
  var contentEl = document.getElementById('content');

  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.command === 'render') {
      contentEl.innerHTML = msg.html; clearHighlights();
      if (msg.keyword) openSearchBar(msg.keyword); else hideSearchBar();
    } else if (msg.command === 'search') { if (msg.keyword) openSearchBar(msg.keyword); }
    else if (msg.command === 'clear') { clearHighlights(); hideSearchBar(); }
  });

  function openSearchBar(initialKeyword) {
    searchBar.classList.remove('hidden');
    if (initialKeyword) searchInput.value = initialKeyword;
    searchInput.focus(); searchInput.select();
    if (searchInput.value.trim()) performSearch(searchInput.value.trim());
  }

  function hideSearchBar() {
    searchBar.classList.add('hidden'); clearHighlights();
    searchInput.value = ''; updateCount(0, 0); searchInput.classList.remove('no-match');
  }

  function updateCount(current, total) {
    searchCount.textContent = total === 0 ? 'No results' : (current + 1) + ' / ' + total;
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (searchBar.classList.contains('hidden')) openSearchBar(''); else { searchInput.focus(); searchInput.select(); }
      return;
    }
    if (e.key === 'Escape' && !searchBar.classList.contains('hidden')) { e.preventDefault(); hideSearchBar(); }
  });

  searchInput.addEventListener('input', function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var kw = searchInput.value.trim();
      if (kw) performSearch(kw); else { clearHighlights(); updateCount(0, 0); searchInput.classList.remove('no-match'); }
    }, 100);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); jumpTo(e.shiftKey ? currentIndex - 1 : currentIndex + 1); }
  });

  btnNext.addEventListener('click', function () { jumpTo(currentIndex + 1); });
  btnPrev.addEventListener('click', function () { jumpTo(currentIndex - 1); });
  btnClose.addEventListener('click', function () { hideSearchBar(); });

  function performSearch(kw) {
    clearHighlights(); currentKeyword = kw;
    if (!kw) { updateCount(0, 0); searchInput.classList.remove('no-match'); return; }
    var skipTags = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE']);
    var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentNode && skipTags.has(node.parentNode.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = []; while (walker.nextNode()) textNodes.push(walker.currentNode);
    var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp(escaped, 'gi');
    textNodes.forEach(function (node) {
      var text = node.textContent; if (!regex.test(text)) return; regex.lastIndex = 0;
      var fragment = document.createDocumentFragment(), lastIndex = 0, match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        var mark = document.createElement('mark'); mark.className = 'search-highlight'; mark.textContent = match[0];
        fragment.appendChild(mark); lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      node.parentNode.replaceChild(fragment, node);
    });
    var all = document.querySelectorAll('.search-highlight'); totalMatches = all.length;
    searchInput.classList.toggle('no-match', totalMatches === 0);
    if (totalMatches > 0) jumpTo(0); else { currentIndex = 0; updateCount(0, 0); }
  }

  function jumpTo(index) {
    var all = document.querySelectorAll('.search-highlight'); if (all.length === 0) return;
    all.forEach(function (el) { el.classList.remove('active'); });
    if (index < 0) index = all.length - 1; if (index >= all.length) index = 0;
    currentIndex = index;
    var target = all[currentIndex]; target.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateCount(currentIndex, totalMatches);
  }

  function clearHighlights() {
    document.querySelectorAll('.search-highlight').forEach(function (mark) {
      var parent = mark.parentNode; if (parent) { parent.replaceChild(document.createTextNode(mark.textContent), mark); parent.normalize(); }
    });
    currentIndex = 0; totalMatches = 0; currentKeyword = '';
  }
})();
```

---

### 构建与打包

```bash
# 安装依赖
npm install

# 构建
npm run build  # → dist/extension.js (172kb)

# 打包 VSIX
npx vsce package --allow-missing-repository --no-dependencies

# 安装
code --install-extension ai-chat-search-0.1.0.vsix --force
```

### 支持的模型名称映射

- MiMo v2.5 Pro / MiMo v2 Pro / MiMo v2 Lite
- Claude Sonnet 4 / Claude Sonnet 4.5 / Claude Sonnet 3.5 / Claude Opus 3 / Claude Haiku 3
- GPT-4o / GPT-4 Turbo / GPT-4o Mini
- DeepSeek V3 / DeepSeek R1
- 未映射的 modelId 直接显示原始 ID