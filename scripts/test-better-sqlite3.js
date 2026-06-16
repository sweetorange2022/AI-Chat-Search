const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(
  process.env.APPDATA,
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb',
);

const db = new Database(dbPath, { readonly: true });
const row = db.prepare(
  "SELECT COUNT(*) as c FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
).get();
console.log('better-sqlite3 composers:', row.c);
db.close();
console.log('PASS');
