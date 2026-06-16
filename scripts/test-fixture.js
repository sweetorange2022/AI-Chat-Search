const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const wasm = path.join(__dirname, '..', 'dist', 'sql-wasm.wasm');
  const dbPath = path.join(__dirname, '..', 'src', '__tests__', 'fixtures', 'cursor', 'state.vscdb');
  const SQL = await initSqlJs({ locateFile: () => wasm });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const stmt = db.prepare("SELECT COUNT(*) as cnt FROM cursorDiskKV WHERE key LIKE 'composerData:%'");
  stmt.step();
  console.log('Fixture composers:', stmt.getAsObject().cnt);
  stmt.free();
  db.close();
  console.log('Fixture test: PASS');
})();
