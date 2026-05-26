# Web Search MCP v2.1 优化计划

## 当前状态（v2.0 → v2.0+）

本次对话完成的升级：

| # | 功能 | 文件 |
|---|------|------|
| 1 | SPA 自动滚动 | `fetch.ts` |
| 2 | web_evaluate 自动 IIFE | `evaluate.ts` |
| 3 | interact 超时 30s→10s | `interact.ts` |
| 4 | 新增 web_search（Google/百度/Bing） | `search.ts` |
| 5 | 修复 Google 搜索提取 | `search.ts` |
| 6 | web_fetch 页面缓存（3分钟） | `fetch.ts` |
| 7 | web_search 搜索缓存（3分钟） | `search.ts` |
| 8 | 新增 web_pdf（PDF 解析） | `pdf.ts` |
| 9 | 所有工具描述加入选择指南 | 全部 tools |
| 10 | GUIDE/README 文档同步 | `GUIDE.md`, `README.md` |

工具总数：5 → 13

---

## 待优化项

### Phase 1: PDF 增强（优先）

**目标**：提升 PDF 提取质量

- [ ] 调研 `pdf2md`、`marker`、`unstructured` 等优秀 PDF 解析方案
- [ ] 保留标题层级（识别字号/加粗 → Markdown 标题）
- [ ] 表格结构重建（行列对齐 → Markdown 表格）
- [ ] LaTeX 公式保留（检测公式区域 → 保留原始 LaTeX）
- [ ] 本地 PDF 缓存（避免重复下载大文件）

### Phase 2: 搜索体验优化（中优先）

**目标**：提升搜索结果质量和稳定性

- [ ] Google 搜索 fallback：当 Google 被拦截时自动降级到 Bing/百度
- [ ] 搜索结果去重（不同引擎可能返回相同链接）
- [ ] 搜索结果数量增强：Google/Bing 翻页抓取更多结果
- [ ] 搜索选择器定期验证：写测试脚本检查 CSS 选择器是否仍有效

### Phase 3: 性能优化（中优先）

**目标**：减少等待时间和 token 消耗

- [ ] 资源阻断优化：搜索时阻断图片/字体/CSS 加载
- [ ] 智能滚动：每次滚动后检测内容是否增长，不增长则停止
- [ ] Token 优化：HTML 转 Markdown 时删除无用 class/id/style 属性
- [ ] 批量抓取 `web_fetch_batch`：并行抓取多个 URL

### Phase 4: 用户体验（低优先）

**目标**：让工具更智能更好用

- [ ] 自动配方生成：AI 根据历史交互记录自动提炼配方
- [ ] 页面变更监控：定期检测页面变化并通知
- [ ] 书签/笔记系统：跨对话保存搜索结果 and 重要链接
- [ ] GitHub 仓库智能提取：检测 GitHub URL 时优先提取 README 区域

### Phase 5: 安全与稳定（低优先）

**目标**：提升长期运行稳定性

- [ ] TLS 指纹伪装（应对 Cloudflare 高强度防护）
- [ ] Cookie 加密存储（profile 目录安全性）
- [ ] 内存泄漏检测（长时间运行时的页面泄漏）
- [ ] 自动重试策略优化（指数退避 + 引擎切换）

---

## 技术参考

- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — 6600+ commit 的 MCP 合集
- [Firecrawl](https://www.firecrawl.dev/) — 专业 scraping MCP，token 优化参考
- [playwright-stealth](https://github.com/nicepkg/playwright-stealth) — 反检测参考
- [marker](https://github.com/VikParuchuri/marker) — PDF → Markdown 高质量转换
