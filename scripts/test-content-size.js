/**
 * Test different MAX_CONTENT_CHARS with fixed 10 sessions
 * Goal: find the largest size that still feels "fluent / no waiting"
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

const FIXED_SESSIONS = 10;

// Test sizes (in bytes)
const sizes = [
  64_000,
  128_000,
  256_000,
  512_000,
  1_000_000,
];

console.log('Testing MAX_CONTENT_CHARS with 10 sessions on real 2.4GB DB...\n');

for (const size of sizes) {
  const outFile = path.join(
    process.env.TEMP,
    `cursor-size-${size}-${Date.now()}.json`,
  );

  // Temporarily patch worker for this test run
  const original = fs.readFileSync(worker, 'utf8');
  const patched = original.replace(
    /const MAX_CONTENT_CHARS = \d+;/,
    `const MAX_CONTENT_CHARS = ${size};`,
  );
  fs.writeFileSync(worker, patched, 'utf8');

  const args = [worker, 'load', db, String(FIXED_SESSIONS), outFile];

  console.log(`Test: 10 sessions / ${size / 1024}KB limit`);
  const start = Date.now();

  try {
    const stdout = execFileSync(nodeExe, args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const result = JSON.parse(stdout);

    if (result.ok) {
      const fileSize = fs.statSync(outFile).size;
      console.log(`  ✓ Success: ${result.count} sessions, ${fileSize} bytes, ${elapsed}s`);
      fs.unlinkSync(outFile);
    } else {
      console.log(`  ? Unexpected: ${stdout}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ✗ Failed after ${elapsed}s`);
    console.log(`    ${err.message?.slice(0, 150)}`);
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }

  // restore original worker
  fs.writeFileSync(worker, original, 'utf8');
  console.log('');
}

console.log('Done.');