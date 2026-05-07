import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";
import { extractContent, formatOutput } from "../extractor.js";

export function registerFetch(server: McpServer): void {
    server.tool(
        "web_fetch",
        "抓取网页正文内容，返回 Markdown 格式。支持需要登录的站点（需先用 web_login 登录）。" +
        "支持三种输出模式：full(完整内容), compact(精简8000字), summary(概要3000字)。" +
        "对于 SPA 站点（B站、知乎等），可设置 scrollCount 触发懒加载。" +
        "可传入 sessionId 从已有会话页面提取内容（配合 web_interact 使用）。",
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
            sessionId: z
                .string()
                .optional()
                .describe("页面会话 ID。传入已有 sessionId 可从已有页面提取内容，不传则新开页面"),
        },
        async ({ url, outputMode, scrollCount, timeout, sessionId }) => {
            const start = Date.now();
            const mode = outputMode || "full";
            let page;
            let fromSession = false;

            try {
                if (sessionId) {
                    const session = browserManager.sessions.get(sessionId);
                    if (session) {
                        page = session.page;
                        fromSession = true;
                    }
                }

                if (!page) {
                    page = await browserManager.navigateTo(url, {
                        scrollCount: scrollCount || 0,
                        timeout: timeout || undefined,
                    });
                }

                const finalUrl = page.url();
                const html = await page.content();
                const { title, content } = extractContent(html, url);

                const redirectWarning = browserManager.getRedirectInfo(url, finalUrl);
                const spaWarning = browserManager.detectSPAIssue(content, finalUrl);
                const formatted = formatOutput(content, mode);

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                let resultText = `# ${title}\n\nURL: ${finalUrl}\n\n${formatted}`;

                if (redirectWarning) resultText += `\n\n${redirectWarning}`;
                if (spaWarning) resultText += `\n\n${spaWarning}`;
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
                // 只有非会话页面才关闭
                if (page && !fromSession) {
                    await page.close().catch(() => { });
                }
            }
        }
    );
}
