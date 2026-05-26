# 架构设计文档

本文档记录项目的架构决策、模块职责和扩展指南，供后续开发时快速建立上下文。

---

## 1. 项目定位

**My Web Search MCP** 是一个通过 [Model Context Protocol](https://modelcontextprotocol.io/) 暴露网页抓取能力的服务器。AI 助手通过 MCP 协议调用本服务的工具，实现以下目标：

- 抓取需要登录才能访问的网页内容
- 渲染 JavaScript 驱动的 SPA 页面
- 处理 GBK 等非 UTF-8 编码
- 提供截图、交互、链接提取等辅助能力

**不依赖任何特定 IDE**，适用于所有支持 MCP 的 AI 宿主（Antigravity、Claude Desktop 等）。

---

## 2. 技术栈

| 技术 | 用途 | 版本 |
|------|------|------|
| Node.js | 运行时 | >= 18 |
| TypeScript | 开发语言 | 5.7+ |
| Playwright | 浏览器自动化（Chromium） | 1.49+ |
| @modelcontextprotocol/sdk | MCP 协议 SDK | 1.6+ |
| @mozilla/readability | 正文智能提取 | 0.6+ |
| turndown | HTML -> Markdown 转换 | 7.2+ |
| iconv-lite | GBK/GB2312 编码转换 | 0.6+ |
| zod | 工具参数校验 | 3.23+ |

---

## 3. 模块架构

```
src/
├── index.ts          # 入口：MCP Server 创建、工具注册、进程生命周期
├── browser.ts        # 浏览器管理器（单例）：Playwright context、导航、限速
├── extractor.ts      # 内容提取器：HTML -> Markdown 转换
├── constants.ts      # 全局配置常量
└── tools/
    ├── fetch.ts       # web_fetch — 核心抓取工具
    ├── screenshot.ts  # web_screenshot — 截图工具
    ├── login.ts       # web_login — 有头浏览器登录
    ├── search_extract.ts # web_search_extract — 链接提取
    └── interact.ts    # web_interact — 页面交互
```

### 3.1 模块职责

#### `browser.ts` — BrowserManager（单例）

核心模块，负责：
- **Persistent Context 管理**：使用独立的浏览器 profile 目录保存 Cookie/LocalStorage/IndexedDB
- **导航与重定向处理**：`navigateTo()` 方法处理页面跳转、等待重定向链稳定
- **GBK 编码修复**：通过 `page.route()` 拦截 HTTP 响应，检测 charset 并用 iconv-lite 转码
- **反爬对抗**：域名级限速（3s 冷却）、随机延迟（300-1200ms）、反 webdriver 检测脚本
- **SPA 空壳检测**：检测已知 SPA 站点的懒加载状态
- **重定向检测**：比较请求域名和最终域名，域名不一致时给出警告（可能是 DNS 劫持）
- **空闲内存释放**：20 分钟无工具调用自动关闭 Chromium，下次调用时透明重启

关键方法：
- `getContext()` — 获取或启动浏览器上下文（懒加载）
- `navigateTo(url, options)` — 打开新页面并完成导航（含重定向稳定等待）
- `waitForNavigationSettle(page, timeout)` — 等待 URL 不再变化（解决知乎等多次跳转问题）
- `waitForDOMStable(page, timeout)` — 等待 DOM 元素数量稳定（try-catch 保护）
- `scrollPage(page, count)` — 滚动触发懒加载
- `detectSPAIssue(content, url)` — SPA 空壳内容检测
- `getRedirectInfo(requestedUrl, finalUrl)` — 跨域重定向检测
- `launchLoginMode(url?)` — 有头模式启动浏览器，等待用户登录后关闭
- `closeBrowser()` — 释放浏览器内存但保持 MCP 进程

#### `extractor.ts` — 内容提取器

HTML 到 Markdown 的转换，两层降级策略：

```
1. Mozilla Readability  →  智能正文提取（优先）
     ↓ (isGarbageContent 检测不合格)
2. body 全文 fallback   →  最后手段
```

关键函数：
- `extractContent(html, url)` — 主提取入口，返回 `{ title, content }`
- `formatOutput(content, mode)` — 根据 outputMode 截断/格式化
- `preCleanDOM(doc)` — 预清洗 DOM（移除广告 iframe、导航栏等噪音元素）
- `isGarbageContent(md)` — 垃圾内容检测（过短、链接比例过高）
- `cleanFooterGarbage(md)` — 清除页脚备案/许可证信息

#### `constants.ts` — 集中配置

所有可调参数集中管理，包括：
- 浏览器 profile 路径、超时、User-Agent
- 截图质量预设（hd/default/fast）
- 输出模式字符限制
- 域名限速间隔
- SPA 懒加载站点列表
- 页脚垃圾关键词

#### `index.ts` — 入口与生命周期

- 创建 McpServer 实例
- 注册所有工具
- stdin 断开检测（管道断裂 = 宿主进程退出）
- 心跳定时器：浏览器空闲释放 + 进程空闲退出
- SIGINT/SIGTERM 优雅关闭

---

## 4. 进程生命周期

```
MCP 宿主（IDE/CLI）
  │ stdio 管道
  ↓
index.ts 启动
  ├── 注册 5 个工具
  ├── 监听 stdin end/close/error（管道断裂 = 退出）
  ├── 启动 30s 心跳定时器
  │     ├── 空闲 20 分钟 → closeBrowser()（释放内存，进程保持）
  │     └── 空闲 60 分钟 → 进程退出
  └── 等待工具调用...

工具调用时：
  getContext() → launch() → Chromium persistent context
  navigateTo() → 导航 + 等待重定向 + DOM 稳定 + 反爬延迟
  extractContent() / screenshot / interact → 返回结果
```

---

## 5. 数据持久化

| 数据 | 存储位置 | 用途 |
|------|---------|------|
| 浏览器 profile（Cookie、LocalStorage 等） | `~/AppData/Local/my-web-search-profile/` | 保持登录态 |
| Cookie 备份 | `~/AppData/Local/my-web-search-profile/cookies-backup.json` | 双重保险 |
| 截图临时文件 | `%TEMP%/mcp-screenshot-*.jpg` | web_screenshot 输出 |

---

## 6. 扩展指南

### 6.1 添加新工具

1. 在 `src/tools/` 中创建新文件（参考 `fetch.ts` 的结构）
2. 导出 `registerXxx(server: McpServer)` 函数
3. 在 `index.ts` 中 import 并调用注册
4. 编译测试

### 6.2 添加平台专用选择器

在 `extractor.ts` 中参照现有结构添加 `PlatformConfig`：

```typescript
interface PlatformConfig {
    match: (url: string) => boolean;   // URL 匹配规则
    contentSelectors: string[];        // 正文 CSS 选择器
    removeSelectors: string[];         // 噪音 CSS 选择器
}
```

### 6.3 添加高风控域名特殊处理

在 `constants.ts` 中添加域名到对应列表：
- `SPA_DOMAINS` — 需要滚动触发懒加载的站点
- 如需域名级限速调整，在 `browser.ts` 的 `domainThrottle()` 中添加特殊逻辑

---

## 7. 已知限制与后续计划

### 当前限制

- **无 AI 摘要功能**：需要另行实现（可考虑集成第三方 API）
- **无平台专用选择器**：目前使用通用 Readability 提取，对特定站点的精确度不如定制选择器
- **无 Pipeline/流水线**：多步操作需多次调用工具
- **Windows 路径硬编码**：profile 目录使用 Windows 路径，Mac/Linux 需适配

### 可能的后续迭代方向

| 方向 | 描述 | 优先级 |
|------|------|--------|
| 平台选择器 | 为 B站/知乎/微博等高频站点添加精确提取规则 | 高 |
| 缓存机制 | 相同 URL 短时间内复用缓存结果，避免重复请求 | 中 |
| Pipeline 工具 | 多步操作流水线（如"搜索 → 点击第一个结果 → 提取内容"） | 中 |
| 跨平台 profile 路径 | 自动检测 OS 选择正确的 profile 目录 | 低 |
| File Converter | 本地文本/PDF等文件解析为纯文本格式 | 低 |
| 视频录制 | 页面操作录屏/关键帧提取 | 低 |

---

## 8. 版本历史

### v1.0.0 (2026-05-07)

- 初始版本
- 5 个核心工具：web_fetch, web_screenshot, web_login, web_search_extract, web_interact
- Playwright persistent context 登录态保持
- GBK/GB2312 编码自动修复
- SPA 空壳检测 + 懒加载滚动
- 重定向链稳定等待（防止 execution context destroyed）
- 跨域重定向检测（DNS 劫持警告）
- 域名级限速 + 随机延迟反爬
- 浏览器空闲 20 分钟自动释放内存
- stdin 断开 + 空闲超时双重进程退出保险
