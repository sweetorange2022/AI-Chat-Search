/**
 * Quick smoke test: load CursorProvider against real state.vscdb
 */
const path = require('path');

async function main() {
  const initSqlJs = require('sql.js');
  const fs = require('fs');

  const dbPath = path.join(
    process.env.APPDATA,
    'Cursor',
    'User',
    'globalStorage',
    'state.vscdb',
  );
  const wasmPath = path.join(__dirname, '..', 'dist', 'sql-wasm.wasm');

  console.log('=== AI Chat Search — Cursor Provider 测试 ===\n');
  console.log('数据库:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('FAIL: state.vscdb 不存在');
    process.exit(1);
  }

  const stat = fs.statSync(dbPath);
  console.log('大小:', (stat.size / 1024 / 1024).toFixed(2), 'MB\n');

  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  console.log('正在读取数据库（大库可能需要 30-60 秒）...');
  const t0 = Date.now();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(buffer));
  console.log('打开耗时:', ((Date.now() - t0) / 1000).toFixed(1), 's\n');

  // Count composerData entries
  const countStmt = db.prepare(
    "SELECT COUNT(*) as cnt FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  );
  countStmt.step();
  const totalComposers = countStmt.getAsObject().cnt;
  countStmt.free();
  console.log('composerData 会话总数:', totalComposers);

  // Sample a few composer names
  const sampleStmt = db.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 5",
  );
  console.log('\n抽样会话（前 5 条）:');
  let i = 0;
  while (sampleStmt.step()) {
    const row = sampleStmt.getAsObject();
    try {
      const data = JSON.parse(row.value);
      console.log(`  ${++i}. [${data.composerId?.slice(0, 8)}...] ${data.name || '(无标题)'}`);
      console.log(`     消息数: ${data.fullConversationHeadersOnly?.length ?? 0}`);
      console.log(`     创建: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : '未知'}`);
    } catch {
      console.log(`  ${++i}. 解析失败`);
    }
  }
  sampleStmt.free();

  // Test keyword search simulation on first 200 composers
  const keyword = process.argv[2] || 'provider';
  console.log(`\n模拟搜索关键词: "${keyword}" (扫描前 200 个会话)...`);

  const allStmt = db.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  );
  const matches = [];
  const metas = [];

  while (allStmt.step()) {
    const row = allStmt.getAsObject();
    try {
      const data = JSON.parse(row.value);
      const updated = data.lastUpdatedAt || data.createdAt || 0;
      metas.push({ data, updated });
    } catch { /* skip */ }
  }
  allStmt.free();

  metas.sort((a, b) => b.updated - a.updated);
  const top200 = metas.slice(0, 200);

  for (const { data } of top200) {
    const composerId = data.composerId;
    const title = (data.name || '').toLowerCase();
    let matchCount = 0;
    if (title.includes(keyword.toLowerCase())) matchCount++;

    const headers = data.fullConversationHeadersOnly || [];
    const bubbleStmt = db.prepare(
      'SELECT value FROM cursorDiskKV WHERE key LIKE ?',
    );
    bubbleStmt.bind([`bubbleId:${composerId}:%`]);

    while (bubbleStmt.step()) {
      try {
        const bubble = JSON.parse(bubbleStmt.getAsObject().value);
        if ((bubble.text || '').toLowerCase().includes(keyword.toLowerCase())) {
          matchCount++;
        }
      } catch { /* skip */ }
    }
    bubbleStmt.free();

    if (matchCount > 0) {
      matches.push({ title: data.name || '(无标题)', matchCount, composerId });
    }
  }

  console.log(`匹配会话数: ${matches.length}`);
  matches.slice(0, 10).forEach((m, idx) => {
    console.log(`  ${idx + 1}. [cursor] ${m.title} (${m.matchCount} matches)`);
  });

  db.close();
  console.log('\n=== 测试完成 ===');
  if (totalComposers > 0) {
    console.log('结论: Cursor 数据库可读，Provider 应能正常工作。');
    console.log('请在 Cursor 中按 Ctrl+Shift+; 搜索关键词验证扩展。');
  } else {
    console.log('警告: 未找到 composerData，可能 schema 有变化。');
  }
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
