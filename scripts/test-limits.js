/**
 * Test different maxSessions and content size limits
 * Usage: node scripts/test-limits.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nodeExe = path.join(
  process.env.LOCALAPPDATA,
  'Programs',
  'cursor',
  'resources',
  'app',
  'resources',
  'helpers',
  'node.exe',
);

const worker = path.join(__dirname, '..', 'dist', 'cursor-worker.js');
const db = path.join(
  process.env.APPDATA,
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb',
);

const tests = [
  { sessions: 20, maxChars: 32_000, label: '20 sessions / 32KB' },
  { sessions: 50, maxChars: 64_000, label: '50 sessions / 64KB' },
  { sessions: 100, maxChars: 128_000, label: '100 sessions / 128KB' },
];

console.log('Testing worker limits against real 2.4GB Cursor DB...\n');

for (const t of tests) {
  const outFile = path.join(
    process.env.TEMP,
    `cursor-test-${t.sessions}-${Date.now()}.json`,
  );

  const args = [worker, 'load', db, String(t.sessions), outFile];

  console.log(`Test: ${t.label}`);
  console.log(`  Command: ${nodeExe} ${args.join(' ')}`);

  const start = Date.now();
  try {
    const stdout = execFileSync(nodeExe, args, {
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });

    const result = JSON.parse(stdout);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result.ok) {
      const size = fs.statSync(outFile).size;
      console.log(`  ✓ Success: ${result.count} sessions, ${size} bytes, ${elapsed}s`);
      fs.unlinkSync(outFile);
    } else {
      console.log(`  ✗ Unexpected result: ${stdout}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ✗ Failed after ${elapsed}s`);
    console.log(`    Error: ${err.message?.slice(0, 200)}`);
    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
    }
  }
  console.log('');
}

console.log('Done.');