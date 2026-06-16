/**
 * Standalone worker — run via Cursor's bundled node.exe (Node 22+).
 * Usage:
 *   node cursor-worker.js detect <dbPath>
 *   node cursor-worker.js load <dbPath> <maxSessions> [outFile]
 */
'use strict';

const fs = require('fs');

const USER_TYPE = 1;
const ASSISTANT_TYPE = 2;
const MAX_CONTENT_CHARS = 256_000;

function parseComposer(key, value) {
  if (!key.startsWith('composerData:')) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const composerId = parsed.composerId || key.slice('composerData:'.length);
  const headers = (parsed.fullConversationHeadersOnly || [])
    .filter(h => h && h.bubbleId && typeof h.type === 'number');

  return {
    composerId,
    name: parsed.name || '',
    createdAt: parsed.createdAt || 0,
    lastUpdatedAt: parsed.lastUpdatedAt || parsed.createdAt || 0,
    modelName: parsed.modelConfig?.modelName,
    headers,
    conversationMap: parsed.conversationMap || {},
  };
}

function parseBubble(value) {
  try {
    const b = JSON.parse(value);
    if (!b.text) return null;
    return { text: b.text, type: b.type, createdAt: b.createdAt || 0 };
  } catch { return null; }
}

function mapRole(type) {
  if (type === USER_TYPE) return 'user';
  if (type === ASSISTANT_TYPE) return 'assistant';
  return null;
}

function truncate(text) {
  if (text.length <= MAX_CONTENT_CHARS) return text;
  return text.slice(0, MAX_CONTENT_CHARS) + '...';
}

function extractTitle(meta, messages) {
  if (meta.name) return meta.name.length > 60 ? meta.name.slice(0, 60) + '...' : meta.name;
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'Untitled';
  const line = first.content.split('\n')[0].trim();
  if (!line) return 'Untitled';
  return line.length > 60 ? line.slice(0, 60) + '...' : line;
}

function openDb(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(dbPath, { readOnly: true });
}

function cmdDetect(dbPath) {
  const db = openDb(dbPath);
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'",
  ).get();
  db.close();
  process.stdout.write(JSON.stringify({ available: !!row }));
}

function cmdLoad(dbPath, maxSessions, outFile) {
  const db = openDb(dbPath);
  const rows = db.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  ).all();

  const metas = rows.map(r => parseComposer(r.key, r.value)).filter(Boolean);
  metas.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));

  const limit = maxSessions > 0 ? maxSessions : metas.length;
  const selected = metas.slice(0, limit);
  const sessions = [];

  for (const meta of selected) {
    const bubbleRows = db.prepare(
      `SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:${meta.composerId}:%'`,
    ).all();

    const bubbles = new Map();
    for (const row of bubbleRows) {
      const id = row.key.split(':').pop();
      const b = parseBubble(row.value);
      if (b) bubbles.set(id, b);
    }

    const messages = [];
    for (const h of meta.headers) {
      let text = '';
      let timestamp = 0;
      let type = h.type;

      const bubble = bubbles.get(h.bubbleId);
      if (bubble) {
        text = bubble.text;
        timestamp = bubble.createdAt;
        type = bubble.type;
      } else {
        const entry = meta.conversationMap[h.bubbleId];
        if (entry) {
          text = entry.text || '';
          timestamp = entry.createdAt || 0;
          type = entry.type ?? h.type;
        }
      }

      if (!text) continue;
      const role = mapRole(type);
      if (!role) continue;

      messages.push({
        role,
        content: truncate(text),
        timestamp,
        modelName: role === 'assistant' ? meta.modelName : undefined,
      });
    }

    if (messages.length === 0) continue;

    const lastTs = messages[messages.length - 1].timestamp || 0;
    const session = {
      id: meta.composerId,
      source: 'cursor',
      title: extractTitle(meta, messages),
      createdAt: meta.createdAt,
      updatedAt: lastTs || meta.lastUpdatedAt || meta.createdAt,
      messages,
    };

    // Stream each session as soon as ready (NDJSON)
    process.stdout.write(JSON.stringify(session) + '\n');
  }

  db.close();

  // Optional completion marker for non-streaming consumers
  if (outFile) {
    // For CLI testing, we still support writing the full array to file if needed, but streaming is primary
    // To keep simple, skip full file for now; the NDJSON is sufficient
    process.stdout.write(JSON.stringify({ __done__: true, count: 0 }) + '\n');
  }
}

const [,, command, dbPath, maxArg, outFile] = process.argv;
try {
  if (command === 'detect') {
    cmdDetect(dbPath);
  } else if (command === 'load') {
    cmdLoad(dbPath, parseInt(maxArg || '10', 10), outFile);
  } else {
    process.stderr.write('Unknown command: ' + command);
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err));
  process.exit(1);
}
