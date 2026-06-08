import * as vscode from 'vscode';
import type { SessionStore } from '../store/sessionStore';
import type { SessionLoader } from '../store/sessionLoader';

/**
 * File watcher — SRP: only responsible for detecting data file changes
 * and triggering incremental reload via SessionLoader.
 */
export class FileWatcher implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];

  constructor(
    private readonly store: SessionStore,
    private readonly loader: SessionLoader,
  ) {
    this.setupWatchers();
  }

  private setupWatchers(): void {
    const appData = process.env.APPDATA;
    if (!appData) return;

    // Watch Cline tasks directory for changes
    const clineTasksPattern = new vscode.RelativePattern(
      appData,
      'Code/User/globalStorage/saoudrizwan.claude-dev/tasks/**/ui_messages.json',
    );

    const watcher = vscode.workspace.createFileSystemWatcher(clineTasksPattern);

    // On file create or change — reload that specific task
    watcher.onDidChange(uri => this.handleFileChange(uri));
    watcher.onDidCreate(uri => this.handleFileChange(uri));
    watcher.onDidDelete(uri => this.handleFileDeletion(uri));

    this.watchers.push(watcher);
  }

  private handleFileChange(uri: vscode.Uri): void {
    // Extract task ID from the URI path
    const taskId = this.extractTaskId(uri.fsPath);
    if (!taskId) return;

    // Reload the specific provider — incremental update
    const providers = this.loader.getProviderNames();
    for (const name of providers) {
      if (name === 'cline') {
        // For incremental update, we reload the entire cline provider
        // since loadAll is fast for the typical number of tasks
        this.loader.loadAll().catch(err => {
          console.error('AI Chat Search: Failed to reload after file change:', err);
        });
        break;
      }
    }
  }

  private handleFileDeletion(uri: vscode.Uri): void {
    const taskId = this.extractTaskId(uri.fsPath);
    if (taskId) {
      this.store.remove(taskId);
    }
  }

  private extractTaskId(filePath: string): string | null {
    // Path format: .../tasks/{taskId}/ui_messages.json
    const parts = filePath.replace(/\\/g, '/').split('/');
    const tasksIdx = parts.indexOf('tasks');
    if (tasksIdx === -1 || tasksIdx + 1 >= parts.length) {
      return null;
    }
    return parts[tasksIdx + 1] || null;
  }

  dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers.length = 0;
  }
}