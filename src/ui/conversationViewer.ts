import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ConversationSession, ConversationMessage } from '../types/conversation';
import { MessageRole } from '../types/conversation';

const ROLE_EMOJI: Record<string, string> = {
  [MessageRole.User]: '\u{1F464}',
  [MessageRole.Assistant]: '\u{1F916}',
  [MessageRole.System]: '\u2699\uFE0F',
  [MessageRole.Tool]: '\u{1F527}',
};

const ROLE_LABEL: Record<string, string> = {
  [MessageRole.User]: '\u7528\u6237',
  [MessageRole.Assistant]: '\u52a9\u624b',
  [MessageRole.System]: '\u7cfb\u7edf',
  [MessageRole.Tool]: '\u5de5\u5177',
};

const NO_SESSION_MESSAGE = 'No conversation loaded.';

export class ConversationViewer implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private activeSession: ConversationSession | undefined;

  provideTextDocumentContent(_uri: vscode.Uri): string {
    if (!this.activeSession) return NO_SESSION_MESSAGE;
    return this.renderMarkdown(this.activeSession);
  }

  /**
   * Count keyword occurrences in a rendered session document.
   */
  countKeywordInSession(session: ConversationSession, keyword: string): number {
    const keywordLower = keyword.toLowerCase();
    let count = 0;
    for (const msg of session.messages) {
      const content = msg.content.toLowerCase();
      let pos = 0;
      while (pos < content.length) {
        const idx = content.indexOf(keywordLower, pos);
        if (idx === -1) break;
        count++;
        pos = idx + keywordLower.length;
      }
    }
    return count;
  }

  private countKeywordInRendered(text: string, keyword: string): number {
    const keywordLower = keyword.toLowerCase();
    const textLower = text.toLowerCase();
    let count = 0;
    let pos = 0;
    while (pos < textLower.length) {
      const idx = textLower.indexOf(keywordLower, pos);
      if (idx === -1) break;
      count++;
      pos = idx + keywordLower.length;
    }
    return count;
  }

  /**
   * Generate rendered markdown for a session (used by PreviewManager).
   */
  renderSessionMarkdown(session: ConversationSession): string {
    return this.renderMarkdown(session);
  }

  async openAtMessage(session: ConversationSession, _messageIndex: number, keyword?: string): Promise<void> {
    this.activeSession = session;
    let markdown = this.renderMarkdown(session);

    // If keyword provided, prepend count info banner
    if (keyword && keyword.length > 0) {
      const kwCount = this.countKeywordInRendered(markdown, keyword);
      const banner = '> **🔍 "' + keyword + '"** - Found **' + kwCount + '** occurrences in this conversation\n\n---\n\n';
      markdown = banner + markdown;
    }

    // Write to temp file
    const tmpDir = path.join(os.tmpdir(), 'ai-chat-search');
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {});
    const tmpFile = path.join(tmpDir, session.id + '.md');
    await fs.writeFile(tmpFile, markdown, 'utf-8');
    const fileUri = vscode.Uri.file(tmpFile);

    // Open as rendered Markdown preview
    try {
      await vscode.commands.executeCommand('markdown.showPreview', fileUri, { preserveFocus: true });
    } catch {
      // Fallback: open as plain text editor
      await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(fileUri, { preview: true });
    }
  }

  /**
   * Generate a short summary title from session content.
   */
  getSessionTitle(session: ConversationSession): string {
    const title = session.title || '';
    // Truncate to ~30 chars for a short summary
    const maxLen = 30;
    if (title.length <= maxLen) return title || 'AI \u5bf9\u8bdd';
    return title.substring(0, maxLen) + '...';
  }

  private renderMarkdown(session: ConversationSession): string {
    const date = session.createdAt > 0 ? new Date(session.createdAt).toLocaleString() : 'Unknown date';
    const merged = this.mergeConsecutiveAssistant(session.messages);
    const header = [
      '# ' + this.getSessionTitle(session),
      '> Source: ' + session.source.toUpperCase() + ' | Created: ' + date + ' | Messages: ' + merged.length,
      '', '---', ''
    ].join('\n');
    const body = merged
      .map((msg: ConversationMessage, index: number) => this.renderMessage(msg, index))
      .filter((s: string) => s.length > 0)
      .join('\n\n---\n\n');
    return header + body;
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return y + '/' + m + '/' + day + ' ' + h + ':' + min + ':' + sec;
  }

  private renderMessage(msg: ConversationMessage, index: number): string {
    const emoji = ROLE_EMOJI[msg.role] ?? '\u2753';
    const time = msg.timestamp > 0 ? this.formatTimestamp(msg.timestamp) : '';
    let label: string;
    if (msg.role === MessageRole.Assistant && msg.modelName) {
      label = msg.modelName;
    } else if (msg.role === MessageRole.User) {
      label = '\u7528\u6237';
    } else {
      label = ROLE_LABEL[msg.role] ?? '\u52a9\u624b';
    }
    const heading = '### ' + (index + 1) + '. ' + emoji + ' ' + label + (time ? ' (' + time + ')' : '');
    const cleaned = this.cleanContent(msg.content);
    if (cleaned.length === 0) return '';
    if (msg.role === MessageRole.User) return heading + '\n\n> ' + cleaned.replace(/\n/g, '\n> ');
    return heading + '\n\n' + cleaned;
  }

  private mergeConsecutiveAssistant(messages: readonly ConversationMessage[]): readonly ConversationMessage[] {
    const result: ConversationMessage[] = [];
    for (const msg of messages) {
      const cleaned = this.cleanContent(msg.content);
      if (cleaned.length === 0) continue;
      const lastIdx = result.length - 1;
      const lastMsg = lastIdx >= 0 ? result[lastIdx] : undefined;
      if (lastMsg && msg.role === MessageRole.Assistant && lastMsg.role === MessageRole.Assistant && msg.modelName === lastMsg.modelName) {
        result[lastIdx] = { ...lastMsg, content: lastMsg.content + '\n\n' + cleaned, timestamp: Math.max(lastMsg.timestamp, msg.timestamp) };
      } else {
        result.push({ ...msg, content: cleaned });
      }
    }
    return result;
  }

  private cleanContent(content: string): string {
    let c = content;
    // Remove tool_call blocks (all formats including unclosed and inline)
    c = c.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
    c = c.replace(/<tool_call>[\s\S]*?(?=\n\n|$)/g, '');
    c = c.replace(/```tool_call[\s\S]*?```/g, '');
    c = c.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '');
    c = c.replace(/\s*<tool_call[\s>][\s\S]*?(?=\n\n|$)/gm, '');
    // Catch-all for any remaining tool_call tags
    c = c.replace(/<\/?tool_call[^>]*>/g, '');
    // Remove thinking blocks
    c = c.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    c = c.replace(/<thinking>[\s\S]*?(?=\n\n|$)/g, '');
    // Remove AI planning preamble
    c = c.replace(/^Let me (think|consider|analyze|check|look|see|review|examine|now|first|continue)[^\n]*$/gim, '');
    c = c.replace(/^Need to (update|fix|modify|change|add|remove|create|implement)[^\n]*$/gim, '');
    c = c.replace(/^I (need to|should|will|can|must|have)[^\n]*$/gim, '');
    c = c.replace(/^Now (I|let|we)[^\n]*$/gim, '');
    c = c.replace(/^(Good|Great|Okay|OK|Sure|Certainly|Alright)[,!.][^\n]*$/gim, '');
    c = c.replace(/^The file was (cleared|reverted)[^\n]*$/gim, '');
    c = c.replace(/^The user (is asking|wants|has|provided)[^\n]*$/gim, '');
    // Remove environment_details
    c = c.replace(/<environment_details>[\s\S]*?<\/environment_details>/g, '');
    c = c.replace(/<\/?environment_details>/g, '');
    // Remove task_progress
    c = c.replace(/<task_progress>[\s\S]*?<\/task_progress>/g, '');
    c = c.replace(/<\/?task_progress>/g, '');
    // Remove system metadata
    c = c.replace(/^# Visual Studio Code Visible Files[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Current Time.*$/gm, '');
    c = c.replace(/^# Current Working Directory.*$/gm, '');
    c = c.replace(/^# Workspace Configuration[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Detected CLI Tools[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Inactive Terminals[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Actively Running Terminals[\s\S]*?(?=\n# [A-Z]|\n\n\w|$)/gm, '');
    c = c.replace(/^# Current Mode.*$/gm, '');
    c = c.replace(/^# Context Window Usage.*$/gm, '');
    c = c.replace(/^# Open Tabs.*$/gm, '');
    c = c.replace(/^In this mode you should[\s\S]*?(?=\n\n\w|$)/gm, '');
    c = c.replace(/^# TODO LIST UPDATE REQUIRED[\s\S]*?(?=\n#|\n\n\w|$)/gm, '');
    // Remove tool invocation JSON
    c = c.replace(/\{"request":"\[.*?"tokensIn":\d+.*?\}/g, '');
    c = c.replace(/\{"tokensIn":\d+.*?"cost":[\d.]+\}/g, '');
    // Remove [execute_command] blocks
    c = c.replace(/\[execute_command for .*?\] Result:[\s\S]*?(?=\n\n\w|\n#|$)/g, '');
    c = c.replace(/^### New Output[\s\S]*?(?=\n\n\w|\n#|$)/gm, '');
    // Remove task_progress related
    c = c.replace(/^task_progress List.*$/gm, '');
    c = c.replace(/^While in PLAN MODE.*$/gm, '');
    c = c.replace(/^Reminder: how to use.*$/gm, '');
    c = c.replace(/\[task_progress\][\s\S]*?\[\/task_progress\]/g, '');
    c = c.replace(/^\*\*Current Progress:.*$/gm, '');
    c = c.replace(/^\*\*Note:.*items are complete.*$/gm, '');
    c = c.replace(/\n{3,}/g, '\n\n');
    return c.trim();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
