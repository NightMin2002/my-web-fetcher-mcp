import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";
import { extractContent, formatOutput } from "../extractor.js";

export function registerFetch(server: McpServer): void {
    server.tool(
        "web_fetch",
        "抓取网页正文内容，返回 Markdown 格式。支持需要登录的站点（需先用 web_login 登录）。" +
        "支持三种输出模式：full(完整内容), compact(精简8000字), summary(概要3000字)。" +
        "对于 SPA 站点（B站、知乎等），可设置 scrollCount 触发懒加载。",
        {
            url: z
                .string()
                .describe("要抓取的网页 URL"),
            outputMode: z
                .enum(["full", "compact", "summary"])
                .optional()
                .describe("输出模式: full=完整, compact=精简(8000字), summary=概要(3000字)。默认 full"),
            scrollCount: z
                .number()
                .int()
                .min(0)
                .max(20)
                .optional()
                .describe("滚动次数，用于触发懒加载内容（B站/知乎等 SPA 站点）。默认 0"),
            timeout: z
                .number()
                .optional()
                .describe("页面加载超时(ms)，默认 30000"),
        },
        async ({ url, outputMode, scrollCount, timeout }) => {
            const start = Date.now();
            const mode = outputMode || "full";

            let page;
            try {
                page = await browserManager.navigateTo(url, {
                    scrollCount: scrollCount || 0,
                    timeout: timeout || undefined,
                });

                const finalUrl = page.url();
                const html = await page.content();
                const { title, content } = extractContent(html, url);

                // 重定向检测
                const redirectWarning = browserManager.getRedirectInfo(url, finalUrl);

                // SPA 空壳检测
                const spaWarning = browserManager.detectSPAIssue(content, finalUrl);

                // 格式化输出
                const formatted = formatOutput(content, mode);

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                let resultText = `# ${title}\n\nURL: ${finalUrl}\n\n${formatted}`;

                if (redirectWarning) {
                    resultText += `\n\n${redirectWarning}`;
                }
                if (spaWarning) {
                    resultText += `\n\n${spaWarning}`;
                }

                resultText += `\n\n---\n耗时 ${elapsed}s | 模式: ${mode} | 原文 ${content.length} 字`;

                return {
                    content: [{ type: "text" as const, text: resultText }],
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `抓取失败: ${err.message}\n\nURL: ${url}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );
}
