import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";

export function registerLinks(server: McpServer): void {
    server.tool(
        "web_search_extract",
        "提取网页上的所有链接（标题+URL）。" +
        "适合用于：解析搜索引擎结果页、提取文章列表页中的链接、分析页面外链结构。",
        {
            url: z
                .string()
                .describe("要提取链接的网页 URL"),
            filter: z
                .string()
                .optional()
                .describe("可选，只保留链接文本或 URL 中包含此关键词的链接"),
            scrollCount: z
                .number()
                .int()
                .min(0)
                .max(10)
                .optional()
                .describe("提取前的滚动次数。默认 0"),
        },
        async ({ url, filter, scrollCount }) => {
            const start = Date.now();
            let page;

            try {
                page = await browserManager.navigateTo(url, {
                    scrollCount: scrollCount || 0,
                });

                // 提取所有链接
                const links = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll("a[href]"));
                    return anchors.map((a) => ({
                        text: (a.textContent || "").trim().slice(0, 200),
                        href: (a as HTMLAnchorElement).href,
                    })).filter((l) => l.text && l.href && l.href.startsWith("http"));
                });

                // 去重
                const seen = new Set<string>();
                const unique = links.filter((l) => {
                    if (seen.has(l.href)) return false;
                    seen.add(l.href);
                    return true;
                });

                // 过滤
                let filtered = unique;
                if (filter) {
                    const kw = filter.toLowerCase();
                    filtered = unique.filter(
                        (l) =>
                            l.text.toLowerCase().includes(kw) ||
                            l.href.toLowerCase().includes(kw)
                    );
                }

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                if (filtered.length === 0) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `未找到链接${filter ? `（过滤词: "${filter}"）` : ""}\n\nURL: ${url}\n耗时: ${elapsed}s`,
                        }],
                    };
                }

                // 格式化输出
                const lines = filtered.map(
                    (l, i) => `${i + 1}. [${l.text}](${l.href})`
                );

                return {
                    content: [{
                        type: "text" as const,
                        text: `# 链接提取结果\n\nURL: ${url}\n共 ${filtered.length} 个链接${filter ? `（过滤: "${filter}"）` : ""}\n\n${lines.join("\n")}\n\n---\n耗时: ${elapsed}s`,
                    }],
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `链接提取失败: ${err.message}\n\nURL: ${url}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );
}
