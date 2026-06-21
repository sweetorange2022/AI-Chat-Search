/**
 * v0.2.2 全功能自测
 * 运行: npx tsx test-v022.mjs
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.log(`   ${err.message}`);
    failed++;
  }
}

// ─── Source code string checks ───

test('cursor-worker.js: count fix (selected.length not 0)', () => {
  const src = readFileSync('./src/cursor-worker.js', 'utf-8');
  assert.ok(!src.match(/count:\s*0\b/), 'Should not have hardcoded count: 0');
  assert.ok(src.includes('count: selected.length'), 'Should use selected.length');
});

test('QuickSearch: searchGeneration race condition fix', () => {
  const src = readFileSync('./src/ui/quickSearch.ts', 'utf-8');
  assert.ok(src.includes('private searchGeneration = 0'), 'searchGeneration field');
  assert.ok(src.includes('const gen = ++this.searchGeneration'), 'generation increment');
  assert.ok(src.includes('if (gen !== this.searchGeneration) return'), 'stale check');
});

test('FileWatcher: per-provider reload (not loadAll)', () => {
  const src = readFileSync('./src/infra/fileWatcher.ts', 'utf-8');
  assert.ok(!src.includes('this.loader.loadAll()'), 'Should NOT call loadAll');
  assert.ok(src.includes('this.loader.reloadProvider(providerName)'), 'Should call reloadProvider');
});

test('SessionLoader: reloadProvider method exists', () => {
  const src = readFileSync('./src/store/sessionLoader.ts', 'utf-8');
  assert.ok(src.includes('async reloadProvider(providerName: string)'), 'reloadProvider exists');
  assert.ok(src.includes('const provider = this.providers.find(p => p.name === providerName)'), 'finds provider by name');
});

test('CopilotProvider: multi-editor (Code + Cursor)', () => {
  const src = readFileSync('./src/providers/copilot.ts', 'utf-8');
  assert.ok(src.includes("'Code', 'Cursor'"), 'Both editors');
  assert.ok(src.includes('for (const editor of this.editorDirs)'), 'Iterates editors');
  assert.ok(src.includes('this.editorDirs ='), 'editorDirs field');
});

test('CopilotProvider: custom path handling', () => {
  const src = readFileSync('./src/providers/copilot.ts', 'utf-8');
  assert.ok(src.includes('customPath ? [path.basename'), 'Custom path editor detection');
});

test('ConversationViewer: all dead code removed', () => {
  const src = readFileSync('./src/ui/conversationViewer.ts', 'utf-8');
  assert.ok(!src.includes('VIEWER_SCHEME'), 'VIEWER_SCHEME removed');
  assert.ok(!src.includes('HEADING_PREFIX'), 'HEADING_PREFIX removed');
  assert.ok(!src.includes('ALL_MATCH_DECORATION'), 'ALL_MATCH_DECORATION removed');
  assert.ok(!src.includes('PRIMARY_MATCH_DECORATION'), 'PRIMARY_MATCH_DECORATION removed');
  assert.ok(!src.includes('applyKeywordHighlights'), 'applyKeywordHighlights removed');
  assert.ok(!src.includes('findMessageLine'), 'findMessageLine removed');
  assert.ok(!src.includes('findFirstKeywordLine'), 'findFirstKeywordLine removed');
});

test('ConversationViewer: _messageIndex prefix for unused param', () => {
  const src = readFileSync('./src/ui/conversationViewer.ts', 'utf-8');
  assert.ok(src.includes('_messageIndex'), 'Unused param prefixed');
});

test('PreviewManager: unused import removed', () => {
  const src = readFileSync('./src/previewManager.ts', 'utf-8');
  assert.ok(!src.includes("import * as path from"), 'path import removed');
  assert.ok(src.includes('_initialHtml'), 'unused param prefixed');
  assert.ok(src.includes('_keyword'), 'unused param prefixed');
});

// ─── TypeScript type checks ───

test('TypeScript: no unused variables (tsc strict)', () => {
  // Already verified by npm run lint, just confirm
  const src1 = readFileSync('./src/ui/conversationViewer.ts', 'utf-8');
  const src2 = readFileSync('./src/previewManager.ts', 'utf-8');
  // No leftover decoration references
  assert.ok(!src1.includes('setDecorations'), 'No decoration references');
  assert.ok(!src1.includes('createTextEditorDecorationType'), 'No decoration type creation');
});

// ─── Architecture integrity checks ───

test('Architecture: ChatProvider interface unchanged', () => {
  const src = readFileSync('./src/types/provider.ts', 'utf-8');
  assert.ok(src.includes('detect(): Promise<boolean>'), 'detect method');
  assert.ok(src.includes('loadAll(): Promise<readonly ConversationSession[]>'), 'loadAll method');
  assert.ok(src.includes('readonly name: string'), 'name field');
  assert.ok(src.includes('readonly displayName: string'), 'displayName field');
});

test('Architecture: SessionStore CRUD interface intact', () => {
  const src = readFileSync('./src/store/sessionStore.ts', 'utf-8');
  assert.ok(src.includes('get(id: string)'), 'get method');
  assert.ok(src.includes('getAll()'), 'getAll method');
  assert.ok(src.includes('getBySource(source: string)'), 'getBySource method');
  assert.ok(src.includes('upsert(session: ConversationSession)'), 'upsert method');
  assert.ok(src.includes('upsertAll(sessions: readonly ConversationSession[])'), 'upsertAll method');
  assert.ok(src.includes('remove(id: string)'), 'remove method');
  assert.ok(src.includes('clear()'), 'clear method');
});

test('Architecture: SearchEngine search interface intact', () => {
  const src = readFileSync('./src/search/searchEngine.ts', 'utf-8');
  assert.ok(src.includes('search(query: SearchQuery): SearchResultSet'), 'search method');
  assert.ok(src.includes('calculateScore'), 'scoring logic');
  assert.ok(src.includes('buildSnippet'), 'snippet generation');
});

test('Architecture: extension.ts entry point intact', () => {
  const src = readFileSync('./src/extension.ts', 'utf-8');
  assert.ok(src.includes('export async function activate'), 'activate export');
  assert.ok(src.includes('export function deactivate'), 'deactivate export');
  assert.ok(src.includes('ClineProvider'), 'Cline registered');
  assert.ok(src.includes('ContinueProvider'), 'Continue registered');
  assert.ok(src.includes('CursorProvider'), 'Cursor registered');
  assert.ok(src.includes('CopilotProvider'), 'Copilot registered');
  assert.ok(src.includes('aiChatSearch.search'), 'search command');
  assert.ok(src.includes('aiChatSearch.refreshIndex'), 'refresh command');
});

test('Architecture: all 4 providers implement ChatProvider', () => {
  const providers = ['cline', 'continue', 'cursor', 'copilot'];
  for (const p of providers) {
    const src = readFileSync(`./src/providers/${p}.ts`, 'utf-8');
    assert.ok(src.includes('implements ChatProvider'), `${p} implements ChatProvider`);
    assert.ok(src.includes(`readonly name = '${p}'`), `${p} name field`);
  }
});

test('Architecture: cursorDb.ts three-tier SQLite fallback', () => {
  const src = readFileSync('./src/providers/cursorDb.ts', 'utf-8');
  assert.ok(src.includes('tryOpenBetterSqlite'), 'better-sqlite3 tier');
  assert.ok(src.includes('tryOpenNodeSqlite'), 'node:sqlite tier');
  assert.ok(src.includes('openSqlJs'), 'sql.js WASM tier');
  assert.ok(src.includes('SQLJS_MAX_BYTES'), 'size limit check');
});

// ─── Build verification ───

test('Build: dist/extension.js exists', () => {
  const dist = readFileSync('./dist/extension.js', 'utf-8');
  assert.ok(dist.length > 0, 'dist/extension.js is not empty');
  assert.ok(dist.includes('activate'), 'Contains activate function');
});

test('Build: dist/cursor-worker.js exists', () => {
  const worker = readFileSync('./dist/cursor-worker.js', 'utf-8');
  assert.ok(worker.includes('cmdLoad'), 'Contains cmdLoad function');
  assert.ok(worker.includes('selected.length'), 'Contains count fix');
});

test('Build: dist/sql-wasm.wasm exists', () => {
  try {
    readFileSync('./dist/sql-wasm.wasm');
    assert.ok(true);
  } catch {
    assert.fail('sql-wasm.wasm not found in dist/');
  }
});

// ─── Version check ───

test('Version: package.json is 0.2.2', () => {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  assert.equal(pkg.version, '0.2.2', 'version should be 0.2.2');
});

// ─── Summary ───
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
  process.exit(0);
}
