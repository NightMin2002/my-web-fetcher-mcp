# 安装指南

本 MCP Server 使用 **stdio 传输协议**，是完全通用的——兼容所有支持 MCP 的宿主环境。

## 前置条件

- Node.js >= 18
- 安装依赖：`npm install`
- 安装浏览器：`npx playwright install chromium`
- 编译：`npm run build`

---

## 各平台安装配置

### 1. cc-switch (及其他可视化客户端)

在添加 MCP 的图形界面中，分别填写：

- **MCP 类型**：选择 `自定义` (Custom)
- **MCP 标题**：`my-web-search`
- **完整的 JSON 配置**：

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["<绝对路径>/dist/index.js"]
}
```
> **💡 提示**：如果你的系统是 Windows，填写的路径请务必使用正斜杠 `/` 或双反斜杠 `\\`（如 `D:/path/to/dist/index.js`），避免原生反斜杠转义报错。

### 2. Antigravity IDE

编辑 `~/.gemini/antigravity/mcp_config.json`：

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"]
    }
  }
}
```

### 2. Claude Desktop (Anthropic 官方客户端)

编辑配置文件：
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"]
    }
  }
}
```

### 3. Claude Code CLI

```bash
claude mcp add my-web-search node <绝对路径>/dist/index.js
```

或编辑 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"]
    }
  }
}
```

### 4. Cursor IDE

编辑 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"]
    }
  }
}
```

### 5. Windsurf IDE

编辑 `~/.codeium/windsurf/mcp_config.json`：

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<绝对路径>/dist/index.js"]
    }
  }
}
```

### 6. 任意 MCP 客户端 / 命令行测试

直接用 JSON-RPC 协议通过 stdin/stdout 通信：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

### 7. MCP Inspector (可视化调试)

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

浏览器会自动打开可视化界面，可手动调用任何工具。

---

## 验证安装

安装到任意平台后，在对话中测试：

1. **基础测试**：请 AI 调用 `web_fetch` 抓取 `https://example.com`
2. **中文测试**：请 AI 抓取百度搜索结果
3. **登录测试**：请 AI 调用 `web_login` 打开浏览器登录网站

如果 AI 能正确返回网页内容，说明安装成功。

## 协议兼容性

| 协议要素 | 状态 |
|---------|------|
| JSON-RPC 2.0 | 支持 |
| MCP Protocol 2024-11-05 | 支持 |
| stdio 传输 | 支持 |
| HTTP/SSE 传输 | 暂不支持 |
| 工具发现 (tools/list) | 支持 |
| 工具调用 (tools/call) | 支持 |
