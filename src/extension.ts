import * as vscode from 'vscode';
import { ClineProvider } from './providers/cline';
import { ContinueProvider } from './providers/continue';
import { CursorProvider } from './providers/cursor';
import { CopilotProvider } from './providers/copilot';
import { SessionStore } from './store/sessionStore';
import { SessionLoader } from './store/sessionLoader';
import { SearchEngine } from './search/searchEngine';
import { QuickSearch } from './ui/quickSearch';
import { ConversationViewer } from './ui/conversationViewer';
import { PreviewManager } from './previewManager';
import { FileWatcher } from './infra/fileWatcher';

const VIEWER_SCHEME = 'ai-chat-viewer';

/**
 * Extension activation entry point.
 * Responsibility: dependency assembly (DIP) → command registration → UI registration.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    // 1. Read configuration
    const config = vscode.workspace.getConfiguration('aiChatSearch');
    const clineEnabled = config.get<boolean>('providers.cline.enabled', true);
    const clineCustomPath = config.get<string>('providers.cline.dataPath', '');
    const continueEnabled = config.get<boolean>('providers.continue.enabled', true);
    const continueCustomPath = config.get<string>('providers.continue.dataPath', '');
    const cursorEnabled = config.get<boolean>('providers.cursor.enabled', true);
    const cursorCustomPath = config.get<string>('providers.cursor.dataPath', '');
    const cursorMaxSessions = config.get<number>('providers.cursor.maxSessions', 10);
    const copilotEnabled = config.get<boolean>('providers.copilot.enabled', true);
    const copilotCustomPath = config.get<string>('providers.copilot.dataPath', '');

    // 2. Assemble dependencies (DIP: high-level modules depend on abstractions)
    const store = new SessionStore();
    const providers = [];

    if (clineEnabled) {
      try { providers.push(new ClineProvider(clineCustomPath || undefined)); } catch (e) { console.warn('AI Chat Search: Cline init failed', e); }
    }
    if (continueEnabled) {
      try { providers.push(new ContinueProvider(continueCustomPath || undefined)); } catch (e) { console.warn('AI Chat Search: Continue init failed', e); }
    }
    if (cursorEnabled) {
      try {
        providers.push(new CursorProvider(cursorCustomPath || undefined, cursorMaxSessions, context.extensionPath, context.extensionUri));
      } catch (e) { console.warn('AI Chat Search: Cursor init failed', e); }
    }
    if (copilotEnabled) {
      try { providers.push(new CopilotProvider(copilotCustomPath || undefined)); } catch (e) { console.warn('AI Chat Search: Copilot init failed', e); }
    }

    const loader = new SessionLoader(store, providers);
    const searchEngine = new SearchEngine(store);
    const viewer = new ConversationViewer();
    const previewManager = new PreviewManager(context.extensionUri);

    // 3. Register virtual document provider
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(VIEWER_SCHEME, viewer));

    const outputChannel = vscode.window.createOutputChannel('AI Chat Search');
    context.subscriptions.push(outputChannel);

    // 4. Initial data load
    let loadResult: { ok: boolean; value?: number };
    try {
      loadResult = await loader.loadAll();
    } catch (err) {
      outputChannel.appendLine(`[error] Data load failed: ${err}`);
      loadResult = { ok: true, value: 0 };
    }
    logIndexSummary(store, loadResult, cursorEnabled, outputChannel);

    // 5. Register file watcher
    const fileWatcher = new FileWatcher(store, loader);
    context.subscriptions.push(fileWatcher);

    // 6. Create QuickSearch UI
    const quickSearch = new QuickSearch(
      searchEngine,
      async (result, keyword) => {
        const mdContent = viewer.renderSessionMarkdown(result.session);
        const title = viewer.getSessionTitle(result.session);
        previewManager.openPreview(mdContent, keyword, title);
      },
      (result, keyword) => viewer.countKeywordInSession(result.session, keyword),
    );

    // 7. Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('aiChatSearch.search', () => quickSearch.show()),
      vscode.commands.registerCommand('aiChatSearch.refreshIndex', async () => {
        store.clear();
        try {
          const refreshResult = await loader.loadAll();
          if (refreshResult.ok) {
            const summary = formatIndexSummary(store, refreshResult.value);
            outputChannel.appendLine(`[refresh] ${summary}`);
            vscode.window.showInformationMessage(`AI Chat Search: ${summary}`);
          }
        } catch (err) {
          vscode.window.showErrorMessage('AI Chat Search: Failed to refresh index.');
          outputChannel.appendLine(`[error] Refresh failed: ${err}`);
        }
      }),
      quickSearch,
      viewer,
      previewManager,
    );

    console.log('AI Chat Search: Extension activated successfully');
  } catch (err) {
    console.error('AI Chat Search: Activation failed:', err);
    vscode.window.showErrorMessage(`AI Chat Search: Activation failed: ${err}`);
  }
}

function formatIndexSummary(store: SessionStore, total: number): string {
  const parts: string[] = [];
  for (const source of ['cursor', 'cline', 'continue', 'copilot']) {
    const n = store.getBySource(source).length;
    if (n > 0) parts.push(`${source}: ${n}`);
  }
  const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Index refreshed. ${total} sessions loaded${breakdown}`;
}

function logIndexSummary(
  store: SessionStore,
  loadResult: { ok: boolean; value?: number },
  cursorEnabled: boolean,
  outputChannel: vscode.OutputChannel,
): void {
  if (!loadResult.ok) {
    vscode.window.showWarningMessage(
      'AI Chat Search: Some providers failed to load. Check Output → "AI Chat Search".',
    );
    return;
  }

  const total = loadResult.value ?? 0;
  if (total > 0) {
    const summary = formatIndexSummary(store, total);
    outputChannel.appendLine(`[init] ${summary}`);
    console.log(`AI Chat Search: ${summary}`);
  }

  if (cursorEnabled && store.getBySource('cursor').length === 0) {
    outputChannel.appendLine(
      '[warn] Cursor index empty. Possible causes: state.vscdb too large without better-sqlite3, ' +
      'or providers.cursor.enabled is false.',
    );
    vscode.window.showWarningMessage(
      'AI Chat Search: Cursor chat not indexed. Check Output → "AI Chat Search".',
    );
  }
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions
}