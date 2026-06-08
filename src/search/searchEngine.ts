import type { SessionStore } from '../store/sessionStore';
import type { SearchQuery, SearchResult, SearchResultSet } from '../types/search';
import type { ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

/** Constants — eliminates magic literals */
const DEFAULT_MAX_RESULTS = 50;
const CONTEXT_LINES = 2;
const TITLE_MATCH_BONUS = 3;
const USER_ROLE_BONUS = 2;
const SNIPPET_MAX_LENGTH = 300;
const MATCH_NOT_FOUND = -1;

/**
 * Search engine — SRP: only responsible for keyword matching, scoring, and context extraction.
 * Reads from SessionStore, never modifies any state.
 */
export class SearchEngine {
  constructor(private readonly store: SessionStore) {}

  search(query: SearchQuery): SearchResultSet {
    const keyword = query.keyword.toLowerCase();
    const maxResults = query.maxResults ?? DEFAULT_MAX_RESULTS;
    const filter = query.filter;

    if (keyword.length === 0) {
      return { results: [], totalCount: 0, truncated: false };
    }

    let sessions = this.store.getAll();

    // Apply filters
    if (filter?.source) {
      sessions = sessions.filter(s => s.source === filter.source);
    }
    if (filter?.afterTimestamp !== undefined) {
      const after = filter.afterTimestamp;
      sessions = sessions.filter(s => s.updatedAt >= after);
    }

    const allResults: SearchResult[] = [];

    for (const session of sessions) {
      const titleMatches = session.title.toLowerCase().includes(keyword);

      let matchCount = 0;
      let bestIndex = -1;
      let bestScore = -1;
      let bestSnippet = '';

      for (let i = 0; i < session.messages.length; i++) {
        const message = session.messages[i];
        const contentLower = message.content.toLowerCase();

        if (!contentLower.includes(keyword)) {
          continue;
        }

        matchCount++;
        const score = this.calculateScore(message.role, titleMatches);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          bestSnippet = this.buildSnippet(message, keyword);
        }
      }

      if (matchCount > 0 && bestIndex >= 0) {
        allResults.push({
          session,
          messageIndex: bestIndex,
          contextSnippet: bestSnippet,
          score: bestScore,
          matchCount,
        });
      }
    }

    // Sort by score descending, then by matchCount
    allResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchCount - a.matchCount;
    });

    const truncated = allResults.length > maxResults;
    return {
      results: allResults.slice(0, maxResults),
      totalCount: allResults.length,
      truncated,
    };
  }

  private calculateScore(role: MessageRole, titleMatches: boolean): number {
    let score = 1;
    if (role === MessageRole.User) {
      score += USER_ROLE_BONUS;
    }
    if (titleMatches) {
      score += TITLE_MATCH_BONUS;
    }
    return score;
  }

  private buildSnippet(message: ConversationMessage, keyword: string): string {
    const content = message.content;
    const lines = content.split('\n');
    const keywordLower = keyword.toLowerCase();

    const matchLineIndex = lines.findIndex(l => l.toLowerCase().includes(keywordLower));

    if (matchLineIndex === MATCH_NOT_FOUND) {
      return content.length > SNIPPET_MAX_LENGTH
        ? content.substring(0, SNIPPET_MAX_LENGTH) + '...'
        : content;
    }

    const start = Math.max(0, matchLineIndex - CONTEXT_LINES);
    const end = Math.min(lines.length, matchLineIndex + CONTEXT_LINES + 1);
    const snippet = lines.slice(start, end).join('\n');

    return snippet.length > SNIPPET_MAX_LENGTH
      ? snippet.substring(0, SNIPPET_MAX_LENGTH) + '...'
      : snippet;
  }
}