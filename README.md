# AI Chat Search

VS Code / Cursor 扩展：跨会话搜索 AI 聊天历史，快速定位关键对话内容。

## 解决的问题

使用 Cursor、Cline、Continue 等 AI 工具对话时，查看久远的历史需要手动滚动很久。本插件提供**全局关键词搜索**，以 Markdown 渲染预览展示对话，并支持预览内 `Ctrl+F` 逐条定位匹配。

## 支持的 AI 数据源

| 数据源 | 状态 | 结果标签 |
|--------|------|----------|
| Cursor 原生聊天 (Composer / Agent / Chat) | 已支持 | `[cursor]` |
| Cline (Claude Dev) | 已支持 | `[cline]` |
| Continue | 已支持 | `[continue]` |
| Copilot Chat | 已支持 | `[copilot]` |

## 功能特性

- **快捷搜索** — `Ctrl+Shift+;` 打开搜索框，输入关键词即时搜索（300ms 防抖）
- **多数据源聚合** — 同时搜索 Cursor、Cline、Continue、Copilot Chat 历史，按来源标签区分
- **文档级去重** — 每个对话只显示一条结果，附带该对话中的匹配次数
- **自定义 Webview 预览** — Markdown 渲染展示对话内容
- **内置搜索栏** — 预览中 `Ctrl+F` 高亮匹配，显示 `当前/总数`，支持 Enter 跳转
- **智能内容过滤** — 自动过滤 `<tool_call>`、`<thinking>`、`environment_details` 等噪音
- **模型名称显示** — 助手消息显示模型名（如 `claude-sonnet-4`、`MiMo v2.5 Pro`）
- **完整日期时间** — 消息时间戳格式 `YYYY/MM/DD HH:MM:SS`
- **文件监听** — 对话新增或变更时自动刷新索引（2s 防抖）
- **多编辑器路径** — 自动检测 VS Code、Cursor、VSCodium 的 Cline 数据目录

## 使用方法

### 适用环境

| 你想搜索的内容 | 建议安装位置 |
|----------------|--------------|
| Cursor 自带聊天 | **Cursor** |
| Cline 聊天历史 | Cursor、VS Code、VSCodium |
| Continue 聊天历史 | 任意支持 VS Code 扩展的编辑器 |

扩展会自动检测本机数据路径，**通常无需手动配置**。

### 安装

**从 VSIX 安装（推荐内测/本地使用）**

```bash
npm install
npm run build
npm run package
```

在 Cursor 中：`扩展` → `...` → `从 VSIX 安装...` → 选择构建的 `.vsix` 文件 → 重载窗口。

**从扩展市场安装（发布后）**

在 Cursor 扩展面板搜索 `AI Chat Search` 并安装。

### 日常搜索

1. 按 `Ctrl+Shift+;`（Mac: `Cmd+Shift+;`）打开搜索框
2. 输入关键词，等待结果列表出现
3. 上下箭头浏览结果 → 按 `Enter` 打开对话预览
4. 预览中按 `Ctrl+F` 在对话内逐条定位关键词

**结果列表示例：**

```
[cursor] 如何实现数据库迁移？     2026/6/8  (3 matches)
[cline] Fix login bug             2026/6/7  (1 matches)
```

### 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| Search AI Chat History | `Ctrl+Shift+;` | 打开搜索对话框 |
| Refresh AI Chat Index | 命令面板 | 手动重建全部索引 |

刷新入口：`Ctrl+Shift+P` → 输入 `Refresh AI Chat Index` → 回车。

### 搜不到或结果不全？

按顺序排查：

1. **确认有历史数据** — Cursor 侧边栏能看到旧对话
2. **手动刷新索引** — 执行 `Refresh AI Chat Index`，成功提示 `N sessions loaded`
3. **检查 Cursor 会话上限** — 默认只索引最近 **10** 个 Cursor 对话；更早的对话需将 `maxSessions` 设为 `0`（大库可能较慢）
4. **确认 Provider 已启用** — 设置中 `providers.cursor.enabled` 等为 `true`
5. **查看诊断日志** — `查看` → `输出` → 选择 `AI Chat Search`，确认有 `cursor loaded N sessions`
6. **自定义路径**（少见）— 数据不在默认位置时，设置 `providers.cursor.dataPath`

## 配置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `aiChatSearch.providers.cursor.enabled` | `true` | 启用 Cursor 原生聊天搜索 |
| `aiChatSearch.providers.cursor.dataPath` | `""` | 自定义 Cursor User 目录或 `state.vscdb` 路径 |
| `aiChatSearch.providers.cursor.maxSessions` | `10` | 最大索引 Cursor 会话数（`0` = 不限） |
| `aiChatSearch.providers.cline.enabled` | `true` | 启用 Cline 聊天搜索 |
| `aiChatSearch.providers.cline.dataPath` | `""` | 自定义 Cline 数据路径 |
| `aiChatSearch.providers.continue.enabled` | `true` | 启用 Continue 聊天搜索 |
| `aiChatSearch.providers.copilot.enabled` | `true` | 启用 Copilot Chat 搜索 |
| `aiChatSearch.providers.copilot.dataPath` | `""` | 自定义 Copilot Chat 数据路径 |
| `aiChatSearch.providers.continue.dataPath` | `""` | 自定义 Continue 数据路径 |
| `aiChatSearch.maxResults` | `50` | 最大搜索结果数 |
| `aiChatSearch.contextLines` | `3` | 匹配结果上下文行数 |

### 默认数据路径

**Cursor 原生聊天**

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` |

**Cline**

`%APPDATA%/{Code|Cursor|VSCodium}/User/globalStorage/saoudrizwan.claude-dev/tasks/`

**Continue**

`~/.continue/sessions/`

## 技术栈

- **语言**: TypeScript
- **构建**: esbuild
- **SQLite 读取**: better-sqlite3（大库首选）/ node:sqlite / sql.js
- **Markdown 渲染**: markdown-it
- **VS Code API**: WebviewPanel、QuickPick、FileSystemWatcher
- **架构**: SOLID、DIP、SRP

## 开发

```bash
npm install          # 安装依赖
npm run build        # 构建（含 sql-wasm.wasm 复制）
npm run watch        # 监听模式
npm run lint         # 类型检查
npm run package      # 构建并打包 VSIX
```

在 Cursor 中打开本项目，执行 `npm run watch` 后按 `F5` 启动扩展开发宿主窗口进行调试。

### 项目结构

```
src/
├── extension.ts              # 入口：依赖组装 → 命令注册
├── previewManager.ts         # Webview 预览 + 内置搜索栏
├── providers/
│   ├── cursor.ts             # Cursor 原生聊天适配器
│   ├── cursorDb.ts           # Cursor SQLite 只读访问
│   ├── cline.ts              # Cline 适配器
│   └── continue.ts           # Continue 适配器
├── store/                    # SessionStore + SessionLoader
├── search/searchEngine.ts    # 关键词匹配 + 评分 + 去重
├── ui/                       # QuickSearch + ConversationViewer
└── infra/fileWatcher.ts      # 文件变更监听
media/                        # Webview 样式与交互脚本
dist/                         # 构建产物（extension.js + sql-wasm.wasm）
```

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT