import * as path from 'path';
import { ClineProvider } from '../../providers/cline';

describe('ClineProvider', () => {
  test('loadAll returns sessions from fixture directory', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'cline');
    const provider = new ClineProvider(fixturePath);

    const isAvailable = await provider.detect();
    expect(isAvailable).toBe(true);

    const sessions = await provider.loadAll();
    expect(sessions.length).toBe(1);

    const session = sessions[0];
    expect(session.source).toBe('cline');
    expect(session.messages.length).toBe(4);
    expect(session.messages[0].role).toBe('user');
    expect(session.messages[0].content).toContain('database migration');
    expect(session.messages[1].role).toBe('assistant');
  });

  test('detect returns false for non-existent path', async () => {
    const provider = new ClineProvider('/nonexistent/path/that/does/not/exist');
    const isAvailable = await provider.detect();
    expect(isAvailable).toBe(false);
  });

  test('loadAll returns empty for non-existent path', async () => {
    const provider = new ClineProvider('/nonexistent/path/that/does/not/exist');
    const sessions = await provider.loadAll();
    expect(sessions).toEqual([]);
  });

  test('extracts title from first user message', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'cline');
    const provider = new ClineProvider(fixturePath);
    const sessions = await provider.loadAll();

    expect(sessions[0].title).toBe('How do I implement database migration?');
  });

  test('timestamps are set correctly', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'cline');
    const provider = new ClineProvider(fixturePath);
    const sessions = await provider.loadAll();

    const session = sessions[0];
    expect(session.messages[0].timestamp).toBe(1717200000000);
    expect(session.messages[1].timestamp).toBe(1717200060000);
  });
});