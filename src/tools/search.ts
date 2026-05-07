import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager, touchActivity } from "../browser.js";

/** 搜索引擎配置 */
const ENGINES: Record<string, { urlTemplate: string; extractScript: string }> = {
    google: {
        urlTemplate: "https://www.google.com/search?q={{query}}&hl=zh-CN",
        extractScript: `(() => {
            const results = [];
            // Google 搜索结果
            document.querySelectorAll('#search .g, #rso .g').forEach(el => {
                const titleEl = el.querySelector('h3');
                const linkEl = el.querySelector('a[href^="http"]');
                const snippetEl = el.querySelector('[data-sncf], .VwiC3b, .st, .IsZvec');
                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.innerText.trim(),
                        url: linkEl.href,
                        snippet: snippetEl ? snippetEl.innerText.trim() : ''
                    });
                }
            });
            return results;
        })()`,
    },
    baidu: {
        urlTemplate: "https://www.baidu.com/s?wd={{query}}",
        extractScript: `(() => {
            const results = [];
            document.querySelectorAll('#content_left .c-container').forEach(el => {
                const titleEl = el.querySelector('h3 a, .c-title a');
                const snippetEl = el.querySelector('.c-abstract, .content-right_8Zs40, [class*="content_"]');
                if (titleEl) {
                    results.push({
                        title: titleEl.innerText.trim(),
                        url: titleEl.href || '',
                        snippet: snippetEl ? snippetEl.innerText.trim() : ''
                    });
                }
            });
            return results;
        })()`,
    },
    bing: {
        urlTemplate: "https://www.bing.com/search?q={{query}}&setlang=zh-CN",
        extractScript: `(() => {
            const results = [];
            document.querySelectorAll('#b_results .b_algo').forEach(el => {
                const titleEl = el.querySelector('h2 a');
                const snippetEl = el.querySelector('.b_caption p, .b_lineclamp2');
                if (titleEl) {
                    results.push({
                        title: titleEl.innerText.trim(),
                        url: titleEl.href,
                        snippet: snippetEl ? snippetEl.innerText.trim() : ''
                    });
                }
            });
            return results;
        })()`,
    },
};

export function registerSearch(server: McpServer): void {
    server.tool(
        "web_search",
        "使用搜索引擎搜索关键词，返回结构化的搜索结果（标题、链接、摘要）。" +
        "支持 Google、百度、Bing 三个引擎。" +
        "比 web_fetch 更方便：只需传入关键词，自动提取干净的搜索结果。",
        {
            query: z
                .string()
                .describe("搜索关键词"),
            engine: z
                .enum(["google", "baidu", "bing"])
                .optional()
                .describe("搜索引擎: google(默认), baidu, bing"),
            count: z
                .number()
                .int()
                .min(1)
                .max(20)
                .optional()
                .describe("返回结果数量，默认 10"),
        },
        async ({ query, engine, count }) => {
            const start = Date.now();
            const engineName = engine || "google";
            const maxResults = count || 10;
            const config = ENGINES[engineName];

            if (!config) {
                return {
                    content: [{ type: "text" as const, text: `不支持的搜索引擎: ${engineName}` }],
                    isError: true,
                };
            }

            const url = config.urlTemplate.replace("{{query}}", encodeURIComponent(query));
            let page;

            try {
                page = await browserManager.navigateTo(url, { disableMedia: true });
                touchActivity();

                // 等一下搜索结果加载
                await new Promise(r => setTimeout(r, 1500));

                const rawResults = await page.evaluate(config.extractScript) as Array<{
                    title: string;
                    url: string;
                    snippet: string;
                }>;

                // 过滤无效结果并限制数量
                const results = rawResults
                    .filter(r => r.title && r.url && r.url.startsWith("http"))
                    .slice(0, maxResults);

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                if (results.length === 0) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `搜索 "${query}" 无结果（${engineName}）\n\n可能是搜索引擎拦截了请求，建议尝试其他引擎。\n耗时: ${elapsed}s`,
                        }],
                    };
                }

                const formatted = results.map((r, i) =>
                    `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
                ).join("\n\n");

                return {
                    content: [{
                        type: "text" as const,
                        text: `搜索: "${query}" (${engineName})\n` +
                            `共 ${results.length} 条结果\n\n${formatted}\n\n---\n耗时: ${elapsed}s`,
                    }],
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `搜索失败: ${err.message}\n\n关键词: ${query}\n引擎: ${engineName}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );
}
