import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager, touchActivity } from "../browser.js";

export function registerEvaluate(server: McpServer): void {
    server.tool(
        "web_evaluate",
        "在页面中执行自定义 JavaScript 代码并返回结果。" +
        "适合用于：提取 API 数据、操作 DOM、获取运行时信息、调试页面状态。" +
        "可配合 sessionId 在已有会话中执行。" +
        "代码中可直接使用 return 语句返回值，无需手动包裹函数。",
        {
            url: z
                .string()
                .describe("目标网页 URL"),
            script: z
                .string()
                .describe("要执行的 JavaScript 代码。代码的返回值将作为结果返回。"),
            sessionId: z
                .string()
                .optional()
                .describe("页面会话 ID。传入已有 sessionId 在已有页面执行，不传则新开页面"),
        },
        async ({ url, script, sessionId }) => {
            const start = Date.now();
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
                    page = await browserManager.navigateTo(url);
                }

                touchActivity();

                // 自动包裹 IIFE：如果脚本含有顶层 return，包裹为立即执行函数
                let wrappedScript = script;
                const trimmed = script.trim();
                // 非函数/箭头表达式、含 return → 需要包裹
                if (/\breturn\b/.test(trimmed) && !trimmed.startsWith('(') && !trimmed.startsWith('function') && !trimmed.startsWith('async')) {
                    wrappedScript = `(() => { ${script} })()`;
                }

                const result = await page.evaluate(wrappedScript);
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                const resultStr = typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2) ?? "undefined";

                return {
                    content: [{
                        type: "text" as const,
                        text: `执行结果:\n\n\`\`\`json\n${resultStr}\n\`\`\`\n\n当前URL: ${page.url()}\n耗时: ${elapsed}s`,
                    }],
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `JavaScript 执行失败: ${err.message}\n\nURL: ${url}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page && !fromSession) {
                    await page.close().catch(() => { });
                }
            }
        }
    );
}
