const path = require('path');

const dbPath = path.join(
  process.env.APPDATA,
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb',
);

async function testWithNodeSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  console.log('使用 node:sqlite 打开数据库...');
  const t0 = Date.now();
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  ).get();
  console.log('composerData 会话总数:', count.cnt);
  console.log('打开+查询耗时:', ((Date.now() - t0) / 1000).toFixed(1), 's');

  const keyword = process.argv[2] || 'cursor';
  console.log(`\n搜索关键词 "${keyword}" (前 200 个最近会话)...`);

  const rows = db.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  ).all();

  const metas = rows.map(r => {
    try {
      const data = JSON.parse(r.value);
      return { data, updated: data.lastUpdatedAt || data.createdAt || 0 };
    } catch { return null; }
  }).filter(Boolean);

  metas.sort((a, b) => b.updated - a.updated);
  const top200 = metas.slice(0, 200);

  const bubbleStmt = db.prepare(
    'SELECT value FROM cursorDiskKV WHERE key LIKE ?',
  );

  const matches = [];
  for (const { data } of top200) {
    const composerId = data.composerId;
    let matchCount = 0;
    const kw = keyword.toLowerCase();

    if ((data.name || '').toLowerCase().includes(kw)) matchCount++;

    const bubbles = db.prepare(
      `SELECT value FROM cursorDiskKV WHERE key LIKE 'bubbleId:${composerId}:%'`,
    ).all();

    for (const b of bubbles) {
      try {
        const bubble = JSON.parse(b.value);
        if ((bubble.text || '').toLowerCase().includes(kw)) matchCount++;
      } catch { /* skip */ }
    }

    if (matchCount > 0) {
      matches.push({ title: data.name || '(无标题)', matchCount });
    }
  }

  console.log('匹配会话数:', matches.length);
  matches.slice(0, 8).forEach((m, i) => {
    console.log(`  ${i + 1}. [cursor] ${m.title} (${m.matchCount} matches)`);
  });

  db.close();
  console.log('\n=== 真实数据库测试: PASS ===');
}

testWithNodeSqlite().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
