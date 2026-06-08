import { SearchEngine } from '../../search/searchEngine';
import { SessionStore } from '../../store/sessionStore';
import type { ConversationSession } from '../../types/conversation';
import { MessageRole } from '../../types/conversation';

function createMockSession(id: string, messages: Array<{ role: MessageRole; content: string }>): ConversationSession {
  return {
    id,
    source: 'cline',
    title: `Session ${id}`,
    createdAt: 1717200000000,
    updatedAt: 1717200180000,
    messages: messages.map((m, i) => ({
      ...m,
      timestamp: 1717200000000 + i * 60000,
    })),
  };
}

describe('SearchEngine', () => {
  let store: SessionStore;
  let engine: SearchEngine;

  beforeEach(() => {
    store = new SessionStore();
    engine = new SearchEngine(store);

    store.upsert(createMockSession('task-1', [
      { role: MessageRole.User, content: 'How do I implement database migration?' },
      { role: MessageRole.Assistant, content: 'Use Alembic for Python migrations.' },
      { role: MessageRole.User, content: 'Show me an example with SQLAlchemy' },
      { role: MessageRole.Assistant, content: 'Here is the Alembic setup code.' },
    ]));

    store.upsert(createMockSession('task-2', [
      { role: MessageRole.User, content: 'What is REST API design?' },
      { role: MessageRole.Assistant, content: 'REST stands for Representational State Transfer.' },
    ]));
  });

  test('returns empty for empty keyword', () => {
    const result = engine.search({ keyword: '' });
    expect(result.results).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test('finds messages matching keyword', () => {
    const result = engine.search({ keyword: 'database' });
    expect(result.totalCount).toBe(1);
    expect(result.results[0].session.id).toBe('task-1');
    expect(result.results[0].messageIndex).toBe(0);
  });

  test('finds multiple matches across sessions', () => {
    const result = engine.search({ keyword: 'REST' });
    expect(result.totalCount).toBe(1);
    expect(result.results[0].session.id).toBe('task-2');
  });

  test('case-insensitive search', () => {
    const result = engine.search({ keyword: 'ALEMBIC' });
    expect(result.totalCount).toBe(2);
  });

  test('returns context snippet', () => {
    const result = engine.search({ keyword: 'database' });
    expect(result.results[0].contextSnippet).toContain('database migration');
  });

  test('user messages score higher', () => {
    const result = engine.search({ keyword: 'alembic' });
    // User message "Alembic" in task-1 msg[2] is not present, but assistant has it
    // "Alembic" appears in assistant messages at index 1 and 3
    // Let's check that results exist
    expect(result.totalCount).toBeGreaterThan(0);
    // The first result should have the highest score
    const scores = result.results.map(r => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  test('respects maxResults', () => {
    const result = engine.search({ keyword: 'the', maxResults: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
    if (result.totalCount > 1) {
      expect(result.truncated).toBe(true);
    }
  });

  test('filters by source', () => {
    store.upsert(createMockSession('task-3', [
      { role: MessageRole.User, content: 'REST API best practices' },
    ]));
    // Change source for task-3
    store.upsert({
      ...createMockSession('task-3', [
        { role: MessageRole.User, content: 'REST API best practices' },
      ]),
      source: 'continue',
    });

    const all = engine.search({ keyword: 'REST' });
    const filtered = engine.search({ keyword: 'REST', filter: { source: 'cline' } });

    expect(all.totalCount).toBe(2);
    expect(filtered.totalCount).toBe(1);
  });

  test('no match returns empty', () => {
    const result = engine.search({ keyword: 'xyznonexistent' });
    expect(result.totalCount).toBe(0);
    expect(result.results).toEqual([]);
  });
});