import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs/promises';
import { statSync } from 'fs';

/** Parsed composer metadata from composerData:{id} */
export interface ComposerMeta {
  readonly composerId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly lastUpdatedAt: number;
  readonly modelName?: string;
  readonly headers: readonly ConversationHeader[];
  readonly conversationMap: Readonly<Record<string, ConversationMapEntry>>;
}

export interface ConversationHeader {
  readonly bubbleId: string;
  readonly type: number;
}

export interface ConversationMapEntry {
  readonly text?: string;
  readonly type?: number;
  readonly createdAt?: number;
}

export interface BubbleData {
  readonly text: string;
  readonly type: number;
  readonly createdAt: number;
}

/** Unified read-only DB connection (node:sqlite or sql.js backend) */
export interface CursorDbConnection {
  hasCursorDiskKV(): boolean;
  queryComposerData(): ComposerMeta[];
  queryBubbles(composerId: string): Map<string, BubbleData>;
  close(): void;
}

const COMPOSER_DATA_PREFIX = 'composerData:';
/** Node.js fs.readFile limit is ~2 GiB — use node:sqlite for larger files */
const SQLJS_MAX_BYTES = 1_800_000_000;

let sqlJsInit: Promise<SqlJsStatic> | undefined;

/** Open state.vscdb in read-only mode (better-sqlite3 → node:sqlite → sql.js) */
export async function openReadOnly(
  dbPath: string,
  wasmPath: string,
): Promise<CursorDbConnection> {
  const betterSqlite = tryOpenBetterSqlite(dbPath);
  if (betterSqlite !== null) {
    console.log('AI Chat Search: Using better-sqlite3 for state.vscdb');
    return betterSqlite;
  }

  const nodeSqlite = tryOpenNodeSqlite(dbPath);
  if (nodeSqlite !== null) {
    console.log('AI Chat Search: Using node:sqlite for state.vscdb');
    return nodeSqlite;
  }

  const fileSize = statSync(dbPath).size;
  if (fileSize > SQLJS_MAX_BYTES) {
    throw new Error(
      `state.vscdb is ${(fileSize / 1024 / 1024 / 1024).toFixed(1)} GB — too large for sql.js. ` +
      'Install better-sqlite3 (bundled in extension) or use Node.js 22+ with node:sqlite.',
    );
  }

  console.log('AI Chat Search: Using sql.js for state.vscdb');
  return openSqlJs(dbPath, wasmPath);
}

interface NativeSqliteBackend {
  queryGet(sql: string, ...params: unknown[]): Record<string, unknown> | undefined;
  queryAll(sql: string, ...params: unknown[]): Record<string, unknown>[];
  close(): void;
}

class NativeSqliteConnection implements CursorDbConnection {
  constructor(private readonly db: NativeSqliteBackend) {}

  hasCursorDiskKV(): boolean {
    const row = this.db.queryGet(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'",
    );
    return row !== undefined;
  }

  queryComposerData(): ComposerMeta[] {
    const rows = this.db.queryAll(
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
    ) as Array<{ key: string; value: string }>;

    const metas: ComposerMeta[] = [];
    for (const row of rows) {
      const meta = parseComposerData(row.key, row.value);
      if (meta !== null) metas.push(meta);
    }
    return metas;
  }

  queryBubbles(composerId: string): Map<string, BubbleData> {
    const pattern = `bubbleId:${composerId}:%`;
    const rows = this.db.queryAll(
      'SELECT key, value FROM cursorDiskKV WHERE key LIKE ?',
      pattern,
    ) as Array<{ key: string; value: string }>;

    const bubbles = new Map<string, BubbleData>();
    for (const row of rows) {
      const bubbleId = extractBubbleId(row.key, composerId);
      if (!bubbleId) continue;
      const bubble = parseBubble(row.value);
      if (bubble !== null) bubbles.set(bubbleId, bubble);
    }
    return bubbles;
  }

  close(): void {
    this.db.close();
  }
}

function tryOpenBetterSqlite(dbPath: string): CursorDbConnection | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (
      path: string,
      opts?: { readonly?: boolean; fileMustExist?: boolean },
    ) => {
      prepare(sql: string): {
        get(...params: unknown[]): Record<string, unknown> | undefined;
        all(...params: unknown[]): Record<string, unknown>[];
      };
      close(): void;
    };
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const backend: NativeSqliteBackend = {
      queryGet(sql, ...params) { return db.prepare(sql).get(...params); },
      queryAll(sql, ...params) { return db.prepare(sql).all(...params); },
      close() { db.close(); },
    };
    return new NativeSqliteConnection(backend);
  } catch (err) {
    console.warn('AI Chat Search: better-sqlite3 unavailable:', err);
    return null;
  }
}

function tryOpenNodeSqlite(dbPath: string): CursorDbConnection | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => {
        prepare(sql: string): {
          get(...params: unknown[]): Record<string, unknown> | undefined;
          all(...params: unknown[]): Record<string, unknown>[];
        };
        close(): void;
      };
    };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const backend: NativeSqliteBackend = {
      queryGet(sql, ...params) { return db.prepare(sql).get(...params); },
      queryAll(sql, ...params) { return db.prepare(sql).all(...params); },
      close() { db.close(); },
    };
    return new NativeSqliteConnection(backend);
  } catch {
    return null;
  }
}

async function openSqlJs(dbPath: string, wasmPath: string): Promise<CursorDbConnection> {
  if (!sqlJsInit) {
    sqlJsInit = initSqlJs({ locateFile: () => wasmPath });
  }
  const SQL = await sqlJsInit;
  const buffer = await fs.readFile(dbPath);
  const db = new SQL.Database(new Uint8Array(buffer));
  return new SqlJsConnection(db);
}

class SqlJsConnection implements CursorDbConnection {
  constructor(private readonly db: Database) {}

  hasCursorDiskKV(): boolean {
    const result = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'",
    );
    return result.length > 0 && (result[0].values?.length ?? 0) > 0;
  }

  queryComposerData(): ComposerMeta[] {
    const stmt = this.db.prepare(
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
    );
    const metas: ComposerMeta[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as { key: string; value: string };
      const meta = parseComposerData(row.key, row.value);
      if (meta !== null) metas.push(meta);
    }
    stmt.free();
    return metas;
  }

  queryBubbles(composerId: string): Map<string, BubbleData> {
    const bubbles = new Map<string, BubbleData>();
    const pattern = `bubbleId:${composerId}:%`;
    const stmt = this.db.prepare(
      'SELECT key, value FROM cursorDiskKV WHERE key LIKE ?',
    );
    stmt.bind([pattern]);

    while (stmt.step()) {
      const row = stmt.getAsObject() as { key: string; value: string };
      const bubbleId = extractBubbleId(row.key, composerId);
      if (!bubbleId) continue;
      const bubble = parseBubble(row.value);
      if (bubble !== null) bubbles.set(bubbleId, bubble);
    }
    stmt.free();
    return bubbles;
  }

  close(): void {
    this.db.close();
  }
}

function parseComposerData(key: string, value: string): ComposerMeta | null {
  if (!key.startsWith(COMPOSER_DATA_PREFIX)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const composerId =
    (typeof record.composerId === 'string' && record.composerId.length > 0
      ? record.composerId
      : key.slice(COMPOSER_DATA_PREFIX.length));

  const headers = parseHeaders(record.fullConversationHeadersOnly);
  const conversationMap = parseConversationMap(record.conversationMap);

  const modelConfig = record.modelConfig as Record<string, unknown> | undefined;
  const modelName =
    typeof modelConfig?.modelName === 'string' ? modelConfig.modelName : undefined;

  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : 0;
  const lastUpdatedAt =
    typeof record.lastUpdatedAt === 'number' ? record.lastUpdatedAt : createdAt;

  const name = typeof record.name === 'string' ? record.name : '';

  return {
    composerId,
    name,
    createdAt,
    lastUpdatedAt,
    modelName,
    headers,
    conversationMap,
  };
}

function parseHeaders(raw: unknown): ConversationHeader[] {
  if (!Array.isArray(raw)) return [];

  const headers: ConversationHeader[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const bubbleId = record.bubbleId;
    const type = record.type;
    if (typeof bubbleId === 'string' && typeof type === 'number') {
      headers.push({ bubbleId, type });
    }
  }
  return headers;
}

function parseConversationMap(
  raw: unknown,
): Readonly<Record<string, ConversationMapEntry>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }

  const map: Record<string, ConversationMapEntry> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'object' || val === null) continue;
    const entry = val as Record<string, unknown>;
    map[key] = {
      text: typeof entry.text === 'string' ? entry.text : undefined,
      type: typeof entry.type === 'number' ? entry.type : undefined,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : undefined,
    };
  }
  return map;
}

function extractBubbleId(key: string, composerId: string): string | null {
  const prefix = `bubbleId:${composerId}:`;
  if (!key.startsWith(prefix)) return null;
  const bubbleId = key.slice(prefix.length);
  return bubbleId.length > 0 ? bubbleId : null;
}

function parseBubble(value: string): BubbleData | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }

  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const type = typeof parsed.type === 'number' ? parsed.type : 0;
  const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;

  if (text.length === 0) return null;

  return { text, type, createdAt };
}
