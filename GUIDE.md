# 使用说明书

本文档面向使用者，介绍如何在日常 AI 对话中使用 Web Fetcher MCP 的各项功能。

---

## 目录

1. [基本概念](#1-基本概念)
2. [抓取网页](#2-抓取网页)
3. [网页截图](#3-网页截图)
4. [登录网站](#4-登录网站)
5. [页面交互与会话](#5-页面交互与会话)
6. [站点配方](#6-站点配方)
7. [数据目录管理](#7-数据目录管理)
8. [换电脑迁移](#8-换电脑迁移)
9. [代理设置](#9-代理设置)
10. [常见问题](#10-常见问题)

---

## 1. 基本概念

这个 MCP Server 给 AI 提供了"真实浏览器"的能力。你不需要直接操作它，只需要在 AI 对话中用自然语言描述需求，AI 会自动调用对应的工具。

例如：
- "帮我看看这个网页讲了什么" → AI 调用 `web_fetch`
- "截个图给我看" → AI 调用 `web_screenshot`
- "帮我登录知乎" → AI 调用 `web_login`

---

## 2. 抓取网页

**基本用法**：告诉 AI 你想看的网址即可。

**三种输出模式**：
- `full` — 完整内容（默认）
- `compact` — 精简到 8000 字，适合快速浏览
- `summary` — 概要 3000 字，只保留标题和关键段落

**对话示例**：
```
你：帮我看看这个链接 https://example.com 讲了什么，给我精简版就行
AI：（调用 web_fetch，outputMode=compact）
```

**SPA 站点（B站、知乎等）**：这类站点需要滚动才能加载内容，告诉 AI "滚动加载一下"，它会设置 `scrollCount` 参数。

---

## 3. 网页截图

**格式选择**：
- `jpeg` — 体积小，适合一般截图（默认）
- `png` — 文字更清晰，适合含有代码或表格的页面

**质量选择**：
- `hd` — 1920px 宽，高清
- `default` — 1280px 宽，标准（默认）
- `fast` — 1024px 宽，快速

**元素级截图**：可以只截取页面的某个部分，AI 会使用 CSS 选择器指定。

**对话示例**：
```
你：帮我截个这个网页的图，要 PNG 高清的
AI：（调用 web_screenshot，format=png, quality=hd）
```

---

## 4. 登录网站

**首次使用需要登录的网站时**：

1. 告诉 AI "帮我登录知乎"（或其他网站）
2. AI 调用 `web_login`，你的电脑会弹出一个 Chrome 浏览器窗口
3. 在弹出的窗口中**手动登录**你的账号
4. 登录完成后**关闭浏览器窗口**
5. 完成！之后所有抓取操作都自动携带登录态

**登录态保存在哪里**：

保存在本地的 profile 目录中（见[第7节](#7-数据目录管理)），包括 Cookie、LocalStorage 等。重启电脑、重启 IDE 都不影响，只要不删除该目录，登录状态永久有效。

**什么时候需要重新登录**：
- 手动删除了 profile 目录
- 网站主动让你的 Cookie 过期（通常几个月后）
- 换了新电脑（需要迁移数据，见[第8节](#8-换电脑迁移)）

---

## 5. 页面交互与会话

### 单次交互

告诉 AI 在页面上做某个操作即可，如"点击那个按钮"、"在搜索框输入xxx"。

### 连续交互（会话）

当你需要在同一页面上做多步操作时（如"先搜索，再点击第一个结果"），AI 会使用**会话（Session）**机制：

1. 第一次操作时，工具会返回一个 `sessionId`
2. 后续操作传入这个 `sessionId`，就能在同一页面上继续操作
3. 会话空闲超过 5 分钟自动关闭

**对话示例**：
```
你：打开百度，搜索"MCP协议"，然后告诉我搜索结果
AI：
  1. 调用 web_interact 打开百度 → 拿到 sessionId
  2. 调用 web_interact(sessionId) 输入搜索词并提交
  3. 调用 web_fetch(sessionId) 从同一页面提取搜索结果
```

### 管理会话

- "列出所有活跃会话" → AI 调用 `web_session(action=list)`
- "关闭所有会话" → AI 调用 `web_session(action=close_all)`

---

## 6. 站点配方

### 什么是配方

配方是对某个站点操作流程的录制。保存后，下次遇到同样的操作可以一键回放，不需要 AI 重新摸索页面结构。

### 配方存在哪里

存储在 profile 目录下的 `recipes/` 子目录中，每个配方是一个 JSON 文件，可以直接用文本编辑器打开查看和编辑。

**默认位置**：`%LocalAppData%\my-web-fetcher-profile\recipes\`

### 对话示例

**保存配方**：
```
你：帮我保存一个配方，名字叫"百度搜索"，就是直接用URL搜索百度
AI：（调用 web_recipe_save，保存配方）
```

**查看配方**：
```
你：列出所有配方
AI：（调用 web_recipe_list）

你：有没有百度相关的配方？
AI：（调用 web_recipe_list，domain="baidu.com"）
```

**使用配方**：
```
你：用百度搜索配方搜一下"Playwright教程"
AI：（调用 web_recipe_run，variables={"query": "Playwright教程"}）
```

**删除配方**：
```
你：删掉那个百度搜索配方
AI：（调用 web_recipe_delete）
```

### 配方 JSON 格式说明

```json
{
  "id": "baidu_com_search_1234567890",
  "domain": "baidu.com",
  "name": "search",
  "description": "在百度搜索页搜索关键词",
  "steps": [
    {
      "action": "navigate",
      "url": "https://www.baidu.com/s?wd={{query}}"
    }
  ],
  "variables": ["query"],
  "useCount": 5,
  "successCount": 5
}
```

- `steps` — 操作步骤，支持 navigate/click/type/scroll/wait
- `variables` — 模板变量，在步骤中用 `{{变量名}}` 引用
- `useCount` / `successCount` — 使用次数和成功次数，自动统计

---

## 7. 数据目录管理

### 默认位置

| 系统 | 路径 |
|------|------|
| Windows | `%LocalAppData%\my-web-fetcher-profile\` |
| macOS | `~/Library/Application Support/my-web-fetcher-profile/` |
| Linux | `~/.local/share/my-web-fetcher-profile/` |

### 目录结构

```
my-web-fetcher-profile/
├── Default/            # Chromium 浏览器数据（Cookie、LocalStorage 等）
├── cookies-backup.json # Cookie 备份文件
└── recipes/            # 站点配方
    ├── baidu_com_search_xxx.json
    └── zhihu_com_search_xxx.json
```

### 自定义目录位置（解决 C 盘空间不足）

如果你的 C 盘空间紧张，可以将 profile 目录移到其他盘。

**方法**：在 MCP 配置中添加环境变量 `MCP_PROFILE_DIR`：

```json
{
  "mcpServers": {
    "my-web-fetcher": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"],
      "env": {
        "MCP_PROFILE_DIR": "E:/my-web-fetcher-profile"
      }
    }
  }
}
```

设置后，所有数据（Cookie、配方等）都会存储到你指定的目录。

> 注意：如果你之前已经有数据在默认目录，需要手动把 `%LocalAppData%\my-web-fetcher-profile\` 整个文件夹移过去。

### 磁盘占用

- 浏览器 profile（Cookie/缓存）：通常 50-200MB
- 配方 JSON 文件：每个不到 1KB
- 截图临时文件：存放在系统临时目录（`%TEMP%`），不在 profile 中

---

## 8. 换电脑迁移

换新电脑时，只需要迁移两样东西：

### 第一步：迁移项目代码

把整个项目文件夹复制到新电脑，然后运行：

```bash
npm install
npx playwright install chromium
npm run build
```

### 第二步：迁移用户数据

把旧电脑上的 profile 目录复制到新电脑的**相同位置**：

| 需要复制的目录 | 包含什么 |
|---------------|---------|
| `%LocalAppData%\my-web-fetcher-profile\` | Cookie（登录态）、站点配方 |

如果新电脑想放在不同位置，复制到任意目录后，设置 `MCP_PROFILE_DIR` 环境变量指向它即可。

### 哪些东西不需要迁移

- 截图临时文件（在 `%TEMP%` 中，本来就是临时的）
- `node_modules/` 和 `dist/`（重新 `npm install` 和 `npm run build` 即可）

### 注意事项

- 某些网站的 Cookie 可能绑定了 IP 或设备指纹，迁移后可能需要重新登录
- 浏览器 profile 中可能包含缓存文件，如果只想迁移登录态，可以只复制 `cookies-backup.json` 和 `recipes/` 目录

---

## 9. 代理设置

如果你的网络环境需要代理才能访问某些网站，可以通过环境变量配置。

### 在 MCP 配置中设置

```json
{
  "mcpServers": {
    "my-web-fetcher": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"],
      "env": {
        "MCP_PROXY": "http://127.0.0.1:7890"
      }
    }
  }
}
```

### 支持的代理类型

| 类型 | 格式 | 示例 |
|------|------|------|
| HTTP | `http://host:port` | `http://127.0.0.1:7890` |
| SOCKS5 | `socks5://host:port` | `socks5://127.0.0.1:1080` |
| 带认证 | `http://user:pass@host:port` | `http://admin:123@proxy.com:8080` |

也可以使用标准的 `HTTPS_PROXY` 或 `HTTP_PROXY` 环境变量。

---

## 10. 常见问题

### Q: 百度首页搜索框输入失败？

百度首页在 headless 模式下搜索框不可见。解决方案：直接用 URL 方式搜索，即 `https://www.baidu.com/s?wd=关键词`，或创建一个百度搜索配方来自动处理。

### Q: 抓取结果是空的或很少？

可能是 SPA 站点（B站、知乎等）需要滚动加载。告诉 AI "滚动加载一下"或设置 `scrollCount=3`。

### Q: 网站检测到自动化，拒绝访问？

当前已内置 9 层反检测，能通过大多数网站。如果仍被拦截：
1. 先用 `web_login` 登录该网站，登录态通常能绕过大部分反爬
2. 设置代理使用不同的 IP

### Q: 会话超时了怎么办？

会话空闲 5 分钟自动关闭。如果超时了，AI 会自动创建新会话，不需要你操心。

### Q: 配方执行失败了？

网站更新了页面结构可能导致配方中的 CSS 选择器失效。告诉 AI "更新一下这个配方"，它会重新探索页面并保存新的配方。
