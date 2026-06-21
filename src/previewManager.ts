import * as vscode from 'vscode';
import MarkdownIt = require('markdown-it');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

/**
 * Manages Webview panels for conversation preview.
 * Replaces markdown.showPreview with a custom Webview that supports
 * keyword highlighting, count display, and keyboard navigation.
 */
export class PreviewManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Open a conversation in the Webview preview.
   * Reuses existing panel if one is open.
   */
  openPreview(markdownContent: string, keyword?: string, title?: string): void {
    const htmlBody = md.render(markdownContent);
    const panelTitle = title || 'AI Chat Search';

    if (this.panel) {
      // Reuse existing panel
      this.panel.title = panelTitle;
      this.panel.webview.postMessage({
        command: 'render',
        html: htmlBody,
        keyword: keyword || '',
      });
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    this.panel = vscode.window.createWebviewPanel(
      'aiChatSearchPreview',
      panelTitle,
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      }
    );

    this.panel.webview.html = this.getWebviewContent(
      this.panel.webview,
      htmlBody,
      keyword || ''
    );

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'ready') {
        // Send content after webview is ready
        this.panel?.webview.postMessage({
          command: 'render',
          html: htmlBody,
          keyword: keyword || '',
        });
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.onDidDisposeEmitter.fire();
    });
  }

  /**
   * Send a new search keyword to the existing panel.
   */
  searchInPreview(keyword: string): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'search',
        keyword,
      });
      this.panel.reveal(vscode.ViewColumn.One);
    }
  }

  private getWebviewContent(
    webview: vscode.Webview,
    _initialHtml: string,
    _keyword: string
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css')
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource};
  ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${stylesUri}">
  <title>AI Chat Search</title>
</head>
<body>
  <div id="search-bar" class="search-bar hidden">
    <div class="search-input-wrapper">
      <input type="text" id="search-input" placeholder="Find" />
      <span id="search-count" class="search-count">No results</span>
    </div>
    <div class="search-actions">
      <button id="btn-prev" title="Previous Match (Shift+Enter)">&#9650;</button>
      <button id="btn-next" title="Next Match (Enter)">&#9660;</button>
      <button id="btn-close" title="Close (Escape)">&#10005;</button>
    </div>
  </div>
  <div id="content"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }

  dispose(): void {
    this.panel?.dispose();
    this.onDidDisposeEmitter.dispose();
  }
}