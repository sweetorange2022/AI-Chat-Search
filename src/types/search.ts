import type { ConversationSession } from './conversation';

/** Search filter conditions */
export interface SearchFilter {
  readonly source?: string;
  readonly afterTimestamp?: number;
}

/** A search query */
export interface SearchQuery {
  readonly keyword: string;
  readonly filter?: SearchFilter;
  readonly maxResults?: number;
}

/** A single search result (one per session/document) */
export interface SearchResult {
  readonly session: ConversationSession;
  readonly messageIndex: number;
  readonly contextSnippet: string;
  readonly score: number;
  readonly matchCount: number;
}

/** Search result set */
export interface SearchResultSet {
  readonly results: readonly SearchResult[];
  readonly totalCount: number;
  readonly truncated: boolean;
}