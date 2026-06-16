import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { SessionStore } from '../store/sessionStore';
import type { SessionLoader } from '../store/sessionLoader';

const DEBOUNCE_MS = 2000;

/**
 * File watcher — SRP: only responsible for detecting data file changes
 * and triggering incremental reload via SessionLoader.
 */
export class FileWatcher implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly store: SessionStore,
    private readonly loader: SessionLoader,
  ) {
    this.setupWatchers();
  }

  private setupWatchers(): void {
    this.setupClineWatchers();
    this.setupCursorWatchers();
  }

  private setupClineWatchers(): void {
    const appData = process.env.APPDATA;
    if (!appData) return;

    const editorPaths = ['Code', 'Cursor', 'VSCodium'];
    for (const editor of editorPaths) {
      const clineTasksPattern = new vscode.RelativePattern(
        appData,
        `${editor}/User/globalStorage/saoudrizwan.claude-dev/tasks/**/ui_messages.json`,
      );

      const watcher = vscode.workspace.createFileSystemWatcher(clineTasksPattern);
      watcher.onDidChange(uri => this.handleClineChange(uri));
      watcher.onDidCreate(uri => this.handleClineChange(uri));
      watcher.onDidDelete(uri => this.handleClineDeletion(uri));
      this.watchers.push(watcher);
    }
  }

  private setupCursorWatchers(): void {
    const globalStorageDir = this.getCursorGlobalStorageDir();
    if (!globalStorageDir) return;

    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(globalStorageDir),
      'state.vscdb*',
    );

    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => this.debouncedReload('cursor'));
    watcher.onDidCreate(() => this.debouncedReload('cursor'));
    this.watchers.push(watcher);
  }

  private getCursorGlobalStorageDir(): string | null {
    const home = os.homedir();
    switch (process.platform) {
      case 'win32': {
        const appData = process.env.APPDATA;
        if (!appData) return null;
        return path.join(appData, 'Cursor', 'User', 'globalStorage');
      }
      case 'darwin':
        return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
      default:
        return path.join(home, '.config', 'Cursor', 'User', 'globalStorage');
    }
  }

  private handleClineChange(_uri: vscode.Uri): void {
    const providers = this.loader.getProviderNames();
    if (providers.includes('cline')) {
      this.debouncedReload('cline');
    }
  }

  private handleClineDeletion(uri: vscode.Uri): void {
    const taskId = this.extractTaskId(uri.fsPath);
    if (taskId) {
      this.store.remove(taskId);
    }
  }

  private debouncedReload(providerName: string): void {
    const existing = this.debounceTimers.get(providerName);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(providerName, setTimeout(() => {
      this.debounceTimers.delete(providerName);
      this.reloadProvider(providerName);
    }, DEBOUNCE_MS));
  }

  private reloadProvider(providerName: string): void {
    const providers = this.loader.getProviderNames();
    if (!providers.includes(providerName)) return;

    this.loader.loadAll().catch(err => {
      console.error('AI Chat Search: Failed to reload after file change:', err);
    });
  }

  private extractTaskId(filePath: string): string | null {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const tasksIdx = parts.indexOf('tasks');
    if (tasksIdx === -1 || tasksIdx + 1 >= parts.length) {
      return null;
    }
    return parts[tasksIdx + 1] || null;
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers.length = 0;
  }
}
