import * as path from 'path';
import { CursorProvider } from '../../providers/cursor';

const FIXTURE_DB = path.join(__dirname, '..', 'fixtures', 'cursor', 'state.vscdb');
const WASM_PATH = path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

describe('CursorProvider', () => {
  test('detect returns true for fixture database', async () => {
    const provider = new CursorProvider(FIXTURE_DB, 200, undefined, WASM_PATH);
    const isAvailable = await provider.detect();
    expect(isAvailable).toBe(true);
  });

  test('loadAll returns sessions from fixture database', async () => {
    const provider = new CursorProvider(FIXTURE_DB, 200, undefined, WASM_PATH);
    const sessions = await provider.loadAll();

    expect(sessions.length).toBe(2);
    expect(sessions[0].source).toBe('cursor');
    expect(sessions[0].title).toBe('How to implement Cursor provider?');
    expect(sessions[0].messages.length).toBe(2);
    expect(sessions[0].messages[0].role).toBe('user');
    expect(sessions[0].messages[0].content).toContain('Cursor provider');
    expect(sessions[0].messages[1].role).toBe('assistant');
    expect(sessions[0].messages[1].modelName).toBe('claude-sonnet-4');
  });

  test('sessions are sorted by updatedAt descending', async () => {
    const provider = new CursorProvider(FIXTURE_DB, 200, undefined, WASM_PATH);
    const sessions = await provider.loadAll();

    expect(sessions[0].id).toBe('test-composer-001');
    expect(sessions[1].id).toBe('test-composer-002');
  });

  test('maxSessions limits loaded conversations', async () => {
    const provider = new CursorProvider(FIXTURE_DB, 1, undefined, WASM_PATH);
    const sessions = await provider.loadAll();

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('test-composer-001');
  });

  test('detect returns false for non-existent path', async () => {
    const provider = new CursorProvider('/nonexistent/path/that/does/not/exist', 200, undefined, WASM_PATH);
    const isAvailable = await provider.detect();
    expect(isAvailable).toBe(false);
  });

  test('loadAll returns empty for non-existent path', async () => {
    const provider = new CursorProvider('/nonexistent/path/that/does/not/exist', 200, undefined, WASM_PATH);
    const sessions = await provider.loadAll();
    expect(sessions).toEqual([]);
  });

  test('timestamps are set correctly', async () => {
    const provider = new CursorProvider(FIXTURE_DB, 200, undefined, WASM_PATH);
    const sessions = await provider.loadAll();

    const session = sessions[0];
    expect(session.createdAt).toBe(1717200000000);
    expect(session.messages[0].timestamp).toBe(1717200000000);
    expect(session.messages[1].timestamp).toBe(1717200060000);
  });
});
