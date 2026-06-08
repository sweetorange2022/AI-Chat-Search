import * as vscode from 'vscode';
import { ClineProvider } from './providers/cline';
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
  // 1. Read configuration
  const config = vscode.workspace.getConfiguration('aiChatSearch');
  const clineEnabled = config.get<boolean>('providers.cline.enabled', true);
  const clineCustomPath = config.get<string>('providers.cline.dataPath', '');

  // 2. Assemble dependencies (DIP: high-level modules depend on abstractions)
  const store = new SessionStore();

  const providers = [];
  if (clineEnabled) {
    providers.push(new ClineProvider(clineCustomPath || undefined));
  }
  // Future: providers.push(new ContinueProvider());
  // Future: providers.push(new CopilotProvider());

  const loader = new SessionLoader(store, providers);
  const searchEngine = new SearchEngine(store);
  const viewer = new ConversationViewer();
  const previewManager = new PreviewManager(context.extensionUri);

  // 3. Register virtual document provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(VIEWER_SCHEME, viewer),
  );

  // 4. Initial data load
  const loadResult = await loader.loadAll();
  if (!loadResult.ok) {
    vscode.window.showWarningMessage(
      'AI Chat Search: Some providers failed to load. Check output for details.',
    );
  } else {
    const count = loadResult.value;
    if (count > 0) {
      console.log(`AI Chat Search: Loaded ${count} sessions.`);
    }
  }

  // 5. Register file watcher for incremental updates
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
    vscode.commands.registerCommand('aiChatSearch.search', () => {
      quickSearch.show();
    }),
    vscode.commands.registerCommand('aiChatSearch.refreshIndex', async () => {
      store.clear();
      const refreshResult = await loader.loadAll();
      if (refreshResult.ok) {
        vscode.window.showInformationMessage(
          `AI Chat Search: Index refreshed. ${refreshResult.value} sessions loaded.`,
        );
      } else {
        vscode.window.showErrorMessage('AI Chat Search: Failed to refresh index.');
      }
    }),
    quickSearch,
    viewer,
    previewManager,
  );
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions
}