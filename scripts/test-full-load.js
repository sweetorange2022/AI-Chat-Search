/**
 * Full load simulation — mirrors CursorProvider.loadAll() against real DB
 */
const path = require('path');

const USER_TYPE = 1;
const ASSISTANT_TYPE = 2;
const MAX_SESSIONS = 200;

const dbPath = path.join(
  process.env.APPDATA,
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb',
);

function parseComposer(key, value) {
  if (!key.startsWith('composerData:')) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const composerId = parsed.composerId || key.slice('composerData:'.length);
  const headers = (parsed.fullConversationHeadersOnly || [])
    .filter(h => h.bubbleId && typeof h.type === 'number');

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

async function main() {
  const { DatabaseSync } = require('node:sqlite');

  console.log('=== CursorProvider 完整加载测试 ===\n');

  const t0 = Date.now();
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const rows = db.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  ).all();

  const metas = rows.map(r => parseComposer(r.key, r.value)).filter(Boolean);
  metas.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
  const selected = metas.slice(0, MAX_SESSIONS);

  console.log(`总会话: ${metas.length}, 加载: ${selected.length} (maxSessions=${MAX_SESSIONS})`);

  const sessions = [];
  for (const meta of selected) {
    if (!meta?.composerId) continue;
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
      const bubble = bubbles.get(h.bubbleId);
      const mapEntry = meta.conversationMap[h.bubbleId];
      const text = bubble?.text || mapEntry?.text || '';
      if (!text) continue;
      const type = bubble?.type ?? mapEntry?.type ?? h.type;
      if (type !== USER_TYPE && type !== ASSISTANT_TYPE) continue;
      messages.push({
        role: type === USER_TYPE ? 'user' : 'assistant',
        content: text.slice(0, 80),
        modelName: type === ASSISTANT_TYPE ? meta.modelName : undefined,
      });
    }

    if (messages.length > 0) {
      sessions.push({
        id: meta.composerId,
        title: meta.name || messages[0]?.content?.slice(0, 40) || 'Untitled',
        messageCount: messages.length,
        messages: messages.slice(0, 2),
      });
    }
  }

  db.close();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`有效会话: ${sessions.length}`);
  console.log(`加载耗时: ${elapsed}s\n`);

  console.log('最近 5 个会话:');
  sessions.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i + 1}. [cursor] ${s.title} (${s.messageCount} msgs)`);
    s.messages.forEach(m => {
      console.log(`     - ${m.role}: ${m.content}${m.content.length >= 80 ? '...' : ''}`);
    });
  });

  const keywords = ['ai-chat-search', 'provider', 'cursor', '搜索'];

  // Keyword search on full content
  const db2 = new DatabaseSync(dbPath, { readOnly: true });
  console.log('');
  for (const kw of keywords) {
    let count = 0;
    const matched = [];
    for (const meta of selected) {
      if (!meta?.composerId) continue;
      let mc = 0;
      if ((meta.name || '').toLowerCase().includes(kw.toLowerCase())) mc++;
      const bubbles = db2.prepare(
        `SELECT value FROM cursorDiskKV WHERE key LIKE 'bubbleId:${meta.composerId}:%'`,
      ).all();
      for (const b of bubbles) {
        try {
          const text = JSON.parse(b.value).text || '';
          if (text.toLowerCase().includes(kw.toLowerCase())) mc++;
        } catch { /* skip */ }
      }
      if (mc > 0) {
        count++;
        matched.push({ title: meta.name || '(无标题)', mc });
      }
    }
    console.log(`  "${kw}": ${count} 会话匹配`);
    matched.slice(0, 3).forEach(m => console.log(`    → ${m.title} (${m.mc})`));
  }
  db2.close();

  const projectSession = sessions.find(s =>
    s.title.includes('ai-chat-search') || s.title.includes('Understanding'),
  );
  console.log('\n=== 结果 ===');
  if (sessions.length > 0) {
    console.log('PASS: Provider 可加载 Cursor 会话');
  } else {
    console.log('FAIL: 无有效会话');
    process.exit(1);
  }
  if (projectSession) {
    console.log(`PASS: 找到本项目相关会话 "${projectSession.title}"`);
  }
  console.log(`\n扩展内验证: Ctrl+Shift+; 搜索 "ai-chat-search" 应出现 [cursor] 结果`);
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
