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

**方式一：图形化客户端 (如 cc-switch)**

在工具内添加 MCP 时，于“完整的 JSON 配置”一栏填写：

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
    "my-web-fetcher": {
      "command": "node",
      "args": ["<项目绝对路径>/dist/index.js"]
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

## 实战案例：登录态绕过验证码

以百度学术为例——未登录时搜索会弹出验证码拦截，登录后即可正常访问：

**第一步：登录**

在 AI 对话中说"帮我登录百度学术"，AI 会调用 `web_login` 工具：

```
AI 调用 → web_login(url: "https://xueshu.baidu.com")
        → 你的电脑弹出 Chrome 窗口
        → 你在窗口里登录百度账号
        → 关闭窗口
        → Cookie 自动保存到本地 profile
```

**第二步：使用**

之后所有 `web_fetch` 调用都自动携带登录态，不再触发验证码：

```
AI 调用 → web_fetch(url: "https://xueshu.baidu.com/s?wd=...")
        → 自动携带 Cookie → 绕过验证码 → 返回搜索结果
```

**登录态永久生效** —— Cookie 保存在 `%LocalAppData%\my-web-fetcher-profile\` 中，重启 IDE、重启电脑均不影响。只要不手动清除该目录，登录状态就一直保持。

适用场景：知乎、B站、知网、百度学术、微博等任何需要登录的网站。

## 核心特性

- **登录态保持** — Playwright persistent context，一次登录永久携带 Cookie
- **资源屏蔽** — 自动拦截图片/CSS/字体请求，文本抓取速度提升 2-5 倍
- **自动重试** — 网络抖动时指数退避重试（最多 2 次），减少偶发报错
- **GBK 编码修复** — 自动检测并转换 GBK/GB2312 编码页面
- **SPA 空壳检测** — 检测 B站/知乎等 SPA 站点的懒加载状态
- **重定向保护** — 检测跨域重定向（DNS 劫持预警）
- **反爬对抗** — 域名级限速、随机延迟、反 webdriver 检测
- **内存友好** — 浏览器空闲 20 分钟自动释放，下次调用透明重启
- **进程安全** — stdin 断开检测 + 空闲超时双保险
- **完全通用** — 标准 MCP stdio 协议，兼容 Claude/Cursor/Windsurf 等所有 MCP 宿主

## 技术文档

- 架构设计和实现原理见 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 全平台安装配置见 [INSTALL.md](./INSTALL.md)。
