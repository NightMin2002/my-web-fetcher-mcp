# My Web Fetcher MCP

使用 Playwright 浏览器抓取网页内容的 MCP Server。通过 persistent context 保存登录态，支持需要登录的网站。

## 工具列表

| 工具 | 功能 | 关键参数 |
|------|------|---------|
| `web_fetch` | 抓取网页正文 -> Markdown | `url`, `outputMode`(full/compact/summary), `scrollCount` |
| `web_screenshot` | 网页截图 | `url`, `quality`(hd/default/fast), `fullPage`, `saveToFile` |
| `web_login` | 打开有头浏览器让用户登录 | `url`(可选) |
| `web_search_extract` | 提取页面所有链接 | `url`, `filter`(关键词过滤) |
| `web_interact` | 页面交互(点击/输入/滚动/等待) | `url`, `action`, `selector`, `text` |

## 快速开始

```bash
npm install              # 安装依赖
npx playwright install chromium  # 下载浏览器二进制
npm run build            # 编译 TypeScript
```

### 首次登录

1. 在 AI 对话中调用 `web_login` 工具
2. 在弹出的浏览器窗口中登录目标网站
3. 关闭浏览器窗口
4. 之后 `web_fetch` 等工具会自动携带登录态

### MCP 配置

在 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "my-web-fetcher": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"]
    }
  }
}
```

## 开发

```bash
npm run dev    # 开发模式（tsx 热重载）
npm run build  # 编译
npm start      # 生产运行
```

## 技术文档

详细的架构设计和实现原理见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
