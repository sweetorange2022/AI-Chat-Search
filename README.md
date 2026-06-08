# AI Chat Search

VS Code 扩展：跨会话搜索 AI 聊天历史，快速定位关键对话内容。

## 解决的问题

使用 Cline 等 AI 插件进行对话时，查看久远的历史对话需要手动滚动很久。本插件提供全局关键词搜索，快速定位并以 Markdown 渲染预览展示对话内容。

## 功能特性

- **快捷搜索** — `Ctrl+Shift+;` 打开搜索框，输入关键词即时搜索
- **文档级去重** — 每个对话只显示一条结果，附带该对话中的匹配次数
- **自定义 Webview 预览** — 以 Markdown 渲染格式展示对话内容
- **内置搜索栏** — 预览中 `Ctrl+F` 唤起搜索栏，高亮所有匹配项，显示 `当前/总数` 计数
- **关键字高亮** — 蛋黄色高亮所有匹配，亮黄色标记当前匹配项
- **键盘导航** — `Enter` 跳转下一个，`Shift+Enter` 跳转上一个，`Escape` 关闭搜索
- **智能内容过滤** — 自动过滤 `<tool_call>`、`<thinking>`、`environment_details` 等噪音
- **模型名称显示** — 助手消息直接显示模型名称（如 `MiMo v2.5 Pro`、`Claude Sonnet 4`）
- **完整日期时间** — 每条消息显示 `YYYY/MM/DD HH:MM:SS` 格式时间戳
- **对话摘要标题** — 预览面板标题和文档标题使用对话首条消息的摘要
- **多编辑器支持** — 自动检测 VS Code、Cursor、VSCodium 的 Cline 数据目录
- **文件监听** — 新对话创建或对话内容变更时自动更新索引

## 支持的 AI 插件

| 插件 | 状态 |
|------|------|
| Cline (Claude Dev) | ✅ 已支持 |
| Continue | 🔜 计划中 |
| Copilot Chat | 🔜 计划中 |

## 使用方法

1. 安装扩展
2. 按 `Ctrl+Shift+;`（Mac: `Cmd+Shift+;`）
3. 输入关键词搜索
4. 用上下箭头浏览结果列表
5. 按 `Enter` 打开 Markdown 渲染预览
6. 在预览中按 `Ctrl+F` 打开内置搜索栏，逐个定位关键词

### 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| Search AI Chat History | `Ctrl+Shift+;` | 打开搜索对话框 |
| Refresh AI Chat Index | — | 手动刷新对话索引 |

## 配置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `aiChatSearch.providers.cline.enabled` | `true` | 启用 Cline 聊天历史搜索 |
| `aiChatSearch.providers.cline.dataPath` | `""` | 自定义 Cline 数据路径（空则自动检测） |
| `aiChatSearch.maxResults` | `50` | 最大搜索结果数 |
| `aiChatSearch.contextLines` | `3` | 匹配结果上下文行数 |

## 技术栈

- **语言**: TypeScript
- **构建**: esbuild
- **Markdown 渲染**: markdown-it
- **VS Code API**: WebviewPanel、QuickPick、TextDocumentContentProvider、FileSystemWatcher
- **架构**: SOLID 原则、DIP（依赖反转）、SRP（单一职责）

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run watch

# 类型检查
npm run lint

# 打包 VSIX
npx vsce package --allow-missing-repository --no-dependencies
```

### 项目结构

```
src/
├── extension.ts              # 入口：依赖组装 → 命令注册 → UI 注册
├── errors.ts                 # Result<T,E> 类型和领域错误
├── previewManager.ts         # Webview 面板管理（Markdown 预览 + 搜索栏）
├── types/
│   ├── conversation.ts       # ConversationSession, ConversationMessage
│   ├── search.ts             # SearchResult, SearchQuery, SearchResultSet
│   └── provider.ts           # ChatProvider 接口
├── providers/
│   └── cline.ts              # Cline 数据适配器（{type, say, text} 格式解析）
├── store/
│   ├── sessionStore.ts       # 数据存储（Map<id, session>）
│   └── sessionLoader.ts      # Provider → Store 加载器
├── search/
│   └── searchEngine.ts       # 关键词匹配 + 评分 + 去重 + 上下文提取
├── ui/
│   ├── quickSearch.ts        # QuickPick 搜索列表
│   └── conversationViewer.ts # 虚拟文档渲染 + 关键词计数
├── infra/
│   └── fileWatcher.ts        # 文件变更监听（增量更新）
media/
├── preview.css               # Webview 样式（主题自适应）
└── preview.js                # Webview 搜索交互（Ctrl+F、高亮、跳转）
```

## License

MIT