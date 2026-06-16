const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const destDir = path.join(__dirname, '..', 'dist');
const dest = path.join(destDir, 'sql-wasm.wasm');

const workerSrc = path.join(__dirname, '..', 'src', 'cursor-worker.js');
const workerDest = path.join(destDir, 'cursor-worker.js');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
fs.copyFileSync(workerSrc, workerDest);
console.log('Copied sql-wasm.wasm and cursor-worker.js to dist/');
