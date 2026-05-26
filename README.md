# My Web Search MCP

使用 Playwright 浏览器抓取网页内容的 MCP Server。通过 persistent context 保存登录态，支持需要登录的网站。

## 工具列表

| 工具 | 功能 | 关键参数 |
|------|------|---------| 
| `web_fetch` | 抓取网页正文 -> Markdown（3分钟缓存） | `url`, `outputMode`(full/compact/summary), `scrollCount`, `sessionId` |
| `web_screenshot` | 网页截图 | `url`, `quality`(hd/default/fast), `format`(jpeg/png), `fullPage`, `selector` |
| `web_login` | 打开有头浏览器让用户登录 | `url`(可选) |
| `web_search` | 搜索引擎搜索，返回结构化结果 | `query`, `engine`(google/baidu/bing), `count` |
| `web_search_extract` | 提取页面所有链接 | `url`, `filter`(关键词过滤) |
| `web_interact` | 页面交互(点击/输入/滚动/等待) | `url`, `action`, `selector`, `sessionId`, `submitAfter` |
| `web_evaluate` | 在页面执行 JS（支持直接 return） | `url`, `script`, `sessionId` |
| `web_session` | 管理页面会话(list/close) | `action`, `sessionId` |
| `web_recipe_save` | 保存站点操作配方 | `domain`, `name`, `steps`, `variables` |
| `web_recipe_list` | 列出已保存的配方 | `domain`(可选过滤) |
| `web_recipe_run` | 执行配方 | `recipeId`, `variables` |
| `web_recipe_delete` | 删除配方 | `recipeId` |
| `web_pdf` | 解析 PDF 提取文字（URL 或本地文件） | `source`, `outputMode` |

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

**方式一：图形化客户端 (如 cc-switch)**

在工具内添加 MCP 时，于"完整的 JSON 配置"一栏填写：

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["<项目绝对路径>/dist/index.js"]
}
```
> 注：Windows 路径建议将反斜杠 `\` 改为正斜杠 `/`。

**方式二：通过配置文件**

在你的 IDE 或 CLI 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "my-web-search": {
      "command": "node",
      "args": ["<项目绝对路径>/dist/index.js"]
    }
  }
}
```

### 代理配置（可选）

通过环境变量设置代理，支持 HTTP/SOCKS5/Tor：

```bash
# HTTP 代理
set MCP_PROXY=http://proxy.example.com:8080

# SOCKS5 代理
set MCP_PROXY=socks5://127.0.0.1:1080

# Tor 代理（需要先启动 Tor 服务）
set MCP_PROXY=socks5://127.0.0.1:9050
```

也可以使用标准的 `HTTPS_PROXY` 或 `HTTP_PROXY` 环境变量。

## 开发

```bash
npm run dev    # 开发模式（tsx 热重载）
npm run build  # 编译
npm start      # 生产运行
```

## 核心特性

### 页面会话（v2.0 新增）

支持跨工具调用复用同一页面，实现连续交互：

```
第一次调用 web_interact → 打开页面，返回 sessionId
第二次调用 web_interact(sessionId) → 在同一页面上继续操作
调用 web_fetch(sessionId) → 从同一页面提取内容
调用 web_session(close) → 手动关闭会话
```

会话空闲超过 5 分钟自动关闭。

### 站点配方（v2.0 新增）

录制常用操作序列，下次一键回放：

```
1. 保存配方：web_recipe_save(domain="baidu.com", name="search", steps=[...])
2. 回放配方：web_recipe_run(recipeId, variables={"query": "关键词"})
```

配方以 JSON 文件存储在 `%LocalAppData%\my-web-search-profile\recipes\` 目录中，可手动查看和编辑。

### 其他核心特性

- **登录态保持** — Playwright persistent context，一次登录永久携带 Cookie
- **深度反检测** — 9 层浏览器指纹伪装（webdriver/chrome runtime/plugins/WebGL/硬件信息等）
- **代理支持** — HTTP/SOCKS5/Tor 代理，通过环境变量配置
- **跨平台** — 自动检测 Windows/macOS/Linux，选择正确的 profile 目录
- **资源屏蔽** — 自动拦截图片/CSS/字体请求，文本抓取速度提升 2-5 倍
- **自动重试** — 网络抖动时指数退避重试（最多 2 次），减少偶发报错
- **GBK 编码修复** — 自动检测并转换 GBK/GB2312 编码页面（仅拦截 HTML 文档）
- **SPA 空壳检测** — 检测 B站/知乎等 SPA 站点的懒加载状态
- **重定向保护** — 检测跨域重定向（DNS 劫持预警）
- **Cookie 定时备份** — 每 5 分钟自动备份，不再仅依赖关闭时保存
- **内存友好** — 浏览器空闲 20 分钟自动释放，下次调用透明重启
- **进程安全** — stdin断开检测 + 空闲超时双保险

## 技术文档

- 架构设计和实现原理见 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 全平台安装配置见 [INSTALL.md](./INSTALL.md)。
