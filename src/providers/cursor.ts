import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { ChatProvider } from '../types/provider';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';
import {
  openReadOnly,
  type ComposerMeta,
  type BubbleData,
} from './cursorDb';

const GLOBAL_STORAGE_DIR = 'globalStorage';
const STATE_DB_FILE = 'state.vscdb';
const TITLE_PREVIEW_LENGTH = 60;
const DEFAULT_MAX_SESSIONS = 10;
const USER_MESSAGE_TYPE = 1;
const ASSISTANT_MESSAGE_TYPE = 2;

/**
 * Cursor native chat provider.
 * Uses Cursor's bundled node.exe subprocess (node:sqlite) for large state.vscdb files.
 */
export class CursorProvider implements ChatProvider {
  readonly name = 'cursor';
  readonly displayName = 'Cursor';

  private dbPath: string;
  private wasmPath: string;
  private extensionPath: string;

  constructor(
    customPath?: string,
    private readonly maxSessions: number = DEFAULT_MAX_SESSIONS,
    extensionPath?: string,
    extensionUri?: vscode.Uri,
    wasmPathOverride?: string,
  ) {
    this.dbPath = this.resolveDbPath(customPath);
    this.extensionPath = extensionPath ?? '';
    if (wasmPathOverride) {
      this.wasmPath = wasmPathOverride;
    } else if (extensionUri) {
      this.wasmPath = vscode.Uri.joinPath(extensionUri, 'dist', 'sql-wasm.wasm').fsPath;
    } else {
      this.wasmPath = path.join(__dirname, 'sql-wasm.wasm');
    }
  }

  private resolveDbPath(customPath?: string): string {
    if (customPath && customPath.length > 0) {
      const normalized = customPath.trim();
      if (normalized.endsWith('.vscdb')) return normalized;
      if (normalized.endsWith(GLOBAL_STORAGE_DIR)) {
        return path.join(normalized, STATE_DB_FILE);
      }
      return path.join(normalized, GLOBAL_STORAGE_DIR, STATE_DB_FILE);
    }

    const baseDir = this.getDefaultUserDir();
    return path.join(baseDir, GLOBAL_STORAGE_DIR, STATE_DB_FILE);
  }

  private getDefaultUserDir(): string {
    const home = os.homedir();
    switch (process.platform) {
      case 'darwin':
        return path.join(home, 'Library', 'Application Support', 'Cursor', 'User');
      case 'win32':
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User');
      default:
        return path.join(home, '.config', 'Cursor', 'User');
    }
  }

  /** Cursor/VS Code ships a standalone Node 22+ at resources/helpers/node.exe */
  private resolveHelperNode(): string | null {
    const appRoot = vscode.env.appRoot;
    if (!appRoot) return null;
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const candidate = path.join(appRoot, 'resources', 'helpers', nodeName);
    return existsSync(candidate) ? candidate : null;
  }

  private workerScriptPath(): string {
    return path.join(this.extensionPath, 'dist', 'cursor-worker.js');
  }

  private runWorkerStreaming(command: 'detect' | 'load'): Promise<string> {
    return new Promise((resolve, reject) => {
      const nodeExe = this.resolveHelperNode();
      const workerScript = this.workerScriptPath();

      if (!nodeExe || !existsSync(workerScript)) {
        reject(new Error('Cursor worker unavailable (helper node or cursor-worker.js missing)'));
        return;
      }

      const args = command === 'detect'
        ? [workerScript, 'detect', this.dbPath]
        : [workerScript, 'load', this.dbPath, String(this.maxSessions)];

      console.log(`AI Chat Search: Running cursor worker (spawn) via ${nodeExe}`);

      const child = spawn(nodeExe, args, { windowsHide: true });

      let stdout = '';
      let stderr = '';
      const sessions: ConversationSession[] = [];
      let buffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed && parsed.id && parsed.source === 'cursor') {
              // Streamed session – upsert immediately for progressive indexing
              // Note: store is not directly accessible here; we collect and let loadAll upsert
              sessions.push(parsed as ConversationSession);
            } else if (parsed && parsed.__done__) {
              // completion marker, ignore
            }
          } catch {
            // partial or non-JSON line, ignore
          }
        }
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const detail = stderr.trim() || `exit code ${code}`;
          reject(new Error(`Cursor worker failed: ${detail}`));
          return;
        }

        if (command === 'load') {
          // Return the collected sessions as JSON array for compatibility
          resolve(JSON.stringify(sessions));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async detect(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.dbPath);
      if (!stat.isFile()) return false;

      const helperNode = this.resolveHelperNode();
      if (helperNode && existsSync(this.workerScriptPath())) {
        const stdout = await this.runWorkerStreaming('detect');
        const result = JSON.parse(stdout) as { available?: boolean };
        return result.available === true;
      }

      const db = await openReadOnly(this.dbPath, this.wasmPath);
      try {
        return db.hasCursorDiskKV();
      } finally {
        db.close();
      }
    } catch (err) {
      console.error('AI Chat Search: CursorProvider detect() failed:', err);
      return false;
    }
  }

  async loadAll(): Promise<readonly ConversationSession[]> {
    try {
      const helperNode = this.resolveHelperNode();
      if (helperNode && existsSync(this.workerScriptPath())) {
        const stdout = await this.runWorkerStreaming('load');
        const sessions = JSON.parse(stdout) as ConversationSession[];
        console.log(`AI Chat Search: Cursor worker loaded ${sessions.length} sessions.`);
        return sessions;
      }

      return this.loadAllInProcess();
    } catch (err) {
      console.error('AI Chat Search: CursorProvider loadAll() failed:', err);
      return [];
    }
  }

  private async loadAllInProcess(): Promise<readonly ConversationSession[]> {
    const db = await openReadOnly(this.dbPath, this.wasmPath);

    try {
      const metas = db.queryComposerData();
      const sorted = metas
        .map(m => ({ meta: m, sortKey: this.getSortTimestamp(m) }))
        .sort((a, b) => b.sortKey - a.sortKey);

      const limit = this.maxSessions > 0 ? this.maxSessions : sorted.length;
      const selected = sorted.slice(0, limit);

      const sessions: ConversationSession[] = [];
      for (const { meta } of selected) {
        const bubbles = db.queryBubbles(meta.composerId);
        const session = this.buildSession(meta, bubbles);
        if (session !== null) sessions.push(session);
      }

      return sessions;
    } finally {
      db.close();
    }
  }

  private getSortTimestamp(meta: ComposerMeta): number {
    return meta.lastUpdatedAt > 0 ? meta.lastUpdatedAt : meta.createdAt;
  }

  private buildSession(
    meta: ComposerMeta,
    bubbles: Map<string, BubbleData>,
  ): ConversationSession | null {
    const messages = this.parseMessages(meta, bubbles);
    if (messages.length === 0) return null;

    const lastTimestamp = messages[messages.length - 1]?.timestamp ?? 0;
    const updatedAt = lastTimestamp > 0 ? lastTimestamp : this.getSortTimestamp(meta);

    return {
      id: meta.composerId,
      source: this.name,
      title: this.extractTitle(meta, messages),
      createdAt: meta.createdAt,
      updatedAt,
      messages,
    };
  }

  private parseMessages(
    meta: ComposerMeta,
    bubbles: Map<string, BubbleData>,
  ): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    const hasV3Bubbles = bubbles.size > 0;
    const mapHasContent = Object.values(meta.conversationMap).some(
      e => (e.text?.length ?? 0) > 0,
    );

    for (const header of meta.headers) {
      let text = '';
      let timestamp = 0;
      let type = header.type;

      if (hasV3Bubbles) {
        const bubble = bubbles.get(header.bubbleId);
        if (bubble) {
          text = bubble.text;
          timestamp = bubble.createdAt;
          type = bubble.type;
        }
      } else if (mapHasContent) {
        const entry = meta.conversationMap[header.bubbleId];
        if (entry) {
          text = entry.text ?? '';
          timestamp = entry.createdAt ?? 0;
          type = entry.type ?? header.type;
        }
      }

      if (text.length === 0) continue;

      const role = this.mapRole(type);
      if (role === null) continue;

      messages.push({
        role,
        content: text,
        timestamp,
        modelName: role === MessageRole.Assistant ? meta.modelName : undefined,
      });
    }

    return messages;
  }

  private mapRole(type: number): MessageRole | null {
    if (type === USER_MESSAGE_TYPE) return MessageRole.User;
    if (type === ASSISTANT_MESSAGE_TYPE) return MessageRole.Assistant;
    return null;
  }

  private extractTitle(
    meta: ComposerMeta,
    messages: readonly ConversationMessage[],
  ): string {
    if (meta.name.length > 0) {
      return meta.name.length > TITLE_PREVIEW_LENGTH
        ? meta.name.substring(0, TITLE_PREVIEW_LENGTH) + '...'
        : meta.name;
    }

    const firstUser = messages.find(m => m.role === MessageRole.User);
    if (!firstUser) return 'Untitled';

    const firstLine = firstUser.content.split('\n')[0].trim();
    if (firstLine.length === 0) return 'Untitled';

    return firstLine.length > TITLE_PREVIEW_LENGTH
      ? firstLine.substring(0, TITLE_PREVIEW_LENGTH) + '...'
      : firstLine;
  }
}
