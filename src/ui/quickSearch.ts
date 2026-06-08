import * as vscode from 'vscode';
import type { SearchEngine } from '../search/searchEngine';
import type { SearchResult } from '../types/search';

const DEBOUNCE_DELAY_MS = 300;
const DEFAULT_MAX_RESULTS = 50;

/**
 * Quick search with live preview.
 * - Typing: auto-searches, shows results in QuickPick
 * - Auto-opens first result in preview Tab (preserveFocus keeps QuickPick open)
 * - Arrow keys switch preview
 * - Enter confirms
 * - Shows "current/total" keyword match count in placeholder
 */
export class QuickSearch implements vscode.Disposable {
  private quickPick: vscode.QuickPick<vscode.QuickPickItem> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private currentResults: readonly SearchResult[] = [];
  private suppressActiveChange = false;
  private currentActiveIndex = 0;

  constructor(
    private readonly searchEngine: SearchEngine,
    private readonly onResultSelected: (result: SearchResult, keyword: string) => void,
    private readonly countKeywordInSession?: (result: SearchResult, keyword: string) => number,
  ) {}

  show(): void {
    if (this.quickPick) {
      this.quickPick.dispose();
    }

    const qp = vscode.window.createQuickPick();
    this.quickPick = qp;

    qp.placeholder = 'Search AI chat history... (arrows to preview, Enter to open)';
    qp.matchOnDescription = false;
    qp.matchOnDetail = false;
    qp.canSelectMany = false;
    this.currentResults = [];
    this.suppressActiveChange = false;

    qp.onDidChangeValue(() => {
      this.debounceSearch(qp);
    });

    // Arrow keys: browse results list only (no preview)
    qp.onDidChangeActive(() => {
      if (this.suppressActiveChange) return;
      const active = qp.activeItems[0];
      if (!active) return;
      const index = qp.items.indexOf(active);
      if (index >= 0 && index < this.currentResults.length) {
        this.currentActiveIndex = index;
        this.updateCounter(qp);
      }
    });

    qp.onDidAccept(() => {
      const selected = qp.selectedItems[0];
      if (!selected) return;
      const index = qp.items.indexOf(selected);
      if (index >= 0 && index < this.currentResults.length) {
        this.onResultSelected(this.currentResults[index], qp.value.trim());
      }
      qp.hide();
    });

    qp.onDidHide(() => {
      qp.dispose();
      this.quickPick = undefined;
    });

    qp.show();
  }

  private debounceSearch(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.executeSearch(qp);
    }, DEBOUNCE_DELAY_MS);
  }

  private executeSearch(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    const query = qp.value.trim();
    if (query.length === 0) {
      this.suppressActiveChange = true;
      qp.items = [];
      this.currentResults = [];
      this.suppressActiveChange = false;
      qp.busy = false;
      return;
    }

    qp.busy = true;

    setTimeout(() => {
      const resultSet = this.searchEngine.search({
        keyword: query,
        maxResults: DEFAULT_MAX_RESULTS,
      });

      // Suppress onDidChangeActive while setting items
      this.suppressActiveChange = true;
      this.currentResults = resultSet.results;
      qp.items = resultSet.results.map(r => this.toQuickPickItem(r));
      this.suppressActiveChange = false;
      qp.busy = false;

      this.currentActiveIndex = 0;
      if (resultSet.totalCount > 0) {
        const truncMsg = resultSet.truncated ? ` (showing first ${DEFAULT_MAX_RESULTS})` : '';
        qp.placeholder = `Found ${resultSet.totalCount} matches${truncMsg} -- arrows to browse, Enter to open preview`;
        this.updateCounter(qp);
      } else {
        qp.placeholder = 'No matches found. Try a different keyword.';
      }
    }, 0);
  }

  private toQuickPickItem(result: SearchResult): vscode.QuickPickItem {
    const session = result.session;
    const sourceLabel = `[${session.source}]`;
    const date = new Date(session.createdAt).toLocaleDateString();
    const matchCount = result.matchCount;

    return {
      label: `${sourceLabel} ${session.title}`,
      description: `${date}  (${matchCount} matches)`,
      detail: this.truncateSnippet(result.contextSnippet),
      alwaysShow: true,
    };
  }

  private truncateSnippet(text: string): string {
    const maxLen = 200;
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  private updateCounter(qp: vscode.QuickPick<vscode.QuickPickItem>): void {
    if (this.currentResults.length === 0) return;
    const current = this.currentActiveIndex + 1;
    const total = this.currentResults.length;
    const keyword = qp.value.trim();
    if (this.countKeywordInSession) {
      const sessionCount = this.countKeywordInSession(this.currentResults[this.currentActiveIndex], keyword);
      qp.placeholder = `[${current}/${total}] ${sessionCount} keyword matches in this conversation -- arrows to preview, Enter to open`;
    } else {
      qp.placeholder = `[${current}/${total}] -- arrows to preview, Enter to open`;
    }
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.quickPick) {
      this.quickPick.dispose();
      this.quickPick = undefined;
    }
    this.currentResults = [];
  }
}