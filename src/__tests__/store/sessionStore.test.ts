import { SessionStore } from '../../store/sessionStore';
import type { ConversationSession } from '../../types/conversation';
import { MessageRole } from '../../types/conversation';

function createMockSession(id: string, overrides?: Partial<ConversationSession>): ConversationSession {
  return {
    id,
    source: 'cline',
    title: `Session ${id}`,
    createdAt: 1717200000000,
    updatedAt: 1717200180000,
    messages: [
      { role: MessageRole.User, content: 'Hello', timestamp: 1717200000000 },
      { role: MessageRole.Assistant, content: 'Hi there!', timestamp: 1717200060000 },
    ],
    ...overrides,
  };
}

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  test('starts empty', () => {
    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  test('upsert adds a session', () => {
    const session = createMockSession('task-1');
    store.upsert(session);
    expect(store.size).toBe(1);
    expect(store.get('task-1')).toBe(session);
  });

  test('upsert updates an existing session', () => {
    const session1 = createMockSession('task-1', { title: 'Original' });
    const session2 = createMockSession('task-1', { title: 'Updated' });

    store.upsert(session1);
    store.upsert(session2);

    expect(store.size).toBe(1);
    expect(store.get('task-1')?.title).toBe('Updated');
  });

  test('upsertAll bulk writes sessions', () => {
    const sessions = [
      createMockSession('task-1'),
      createMockSession('task-2'),
      createMockSession('task-3'),
    ];
    store.upsertAll(sessions);
    expect(store.size).toBe(3);
  });

  test('getAll returns sessions sorted by updatedAt descending', () => {
    store.upsert(createMockSession('task-1', { updatedAt: 100 }));
    store.upsert(createMockSession('task-2', { updatedAt: 300 }));
    store.upsert(createMockSession('task-3', { updatedAt: 200 }));

    const all = store.getAll();
    expect(all.map(s => s.id)).toEqual(['task-2', 'task-3', 'task-1']);
  });

  test('getBySource filters by source', () => {
    store.upsert(createMockSession('task-1', { source: 'cline' }));
    store.upsert(createMockSession('task-2', { source: 'continue' }));
    store.upsert(createMockSession('task-3', { source: 'cline' }));

    const cline = store.getBySource('cline');
    expect(cline.length).toBe(2);
    expect(cline.every(s => s.source === 'cline')).toBe(true);
  });

  test('remove deletes a session', () => {
    store.upsert(createMockSession('task-1'));
    const removed = store.remove('task-1');
    expect(removed).toBe(true);
    expect(store.size).toBe(0);
    expect(store.get('task-1')).toBeUndefined();
  });

  test('remove returns false for non-existent session', () => {
    const removed = store.remove('nonexistent');
    expect(removed).toBe(false);
  });

  test('clear removes all sessions', () => {
    store.upsert(createMockSession('task-1'));
    store.upsert(createMockSession('task-2'));
    store.clear();
    expect(store.size).toBe(0);
  });

  test('get returns undefined for non-existent session', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });
});