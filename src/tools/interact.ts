import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager, touchActivity } from "../browser.js";

export function registerInteract(server: McpServer): void {
    server.tool(
        "web_interact",
        "在页面上执行交互操作：点击按钮、输入文字、滚动页面、等待。" +
        "支持通过 sessionId 在同一页面上做连续操作（如先搜索再翻页）。" +
        "首次调用会创建会话并返回 sessionId，后续调用传入 sessionId 复用同一页面。" +
        "操作完成后返回页面当前 HTML 的 Markdown 提取结果。",
        {
            url: z
                .string()
                .describe("目标网页 URL"),
            action: z
                .enum(["click", "type", "scroll", "wait"])
                .describe("操作类型: click=点击, type=输入文字, scroll=滚动, wait=等待"),
            selector: z
                .string()
                .optional()
                .describe("CSS 选择器，click 和 type 操作必需"),
            text: z
                .string()
                .optional()
                .describe("输入的文字内容，type 操作必需"),
            submitAfter: z
                .boolean()
                .optional()
                .describe("type 操作后是否按 Enter 提交。默认 false"),
            scrollCount: z
                .number()
                .int()
                .min(1)
                .max(20)
                .optional()
                .describe("scroll 操作的滚动次数，默认 3"),
            waitMs: z
                .number()
                .optional()
                .describe("wait 操作的等待时间(ms)，默认 2000"),
            extractAfter: z
                .boolean()
                .optional()
                .describe("操作后是否提取页面内容返回。默认 true"),
            sessionId: z
                .string()
                .optional()
                .describe("页面会话 ID。传入已有 sessionId 复用同一页面做连续操作，不传则创建新会话"),
        },
        async ({ url, action, selector, text, submitAfter, scrollCount, waitMs, extractAfter, sessionId }) => {
            const start = Date.now();
            let page;
            let currentSessionId = sessionId;
            let isNewSession = false;

            try {
                // 尝试复用已有会话
                if (sessionId) {
                    const session = browserManager.sessions.get(sessionId);
                    if (session) {
                        page = session.page;
                    } else {
                        console.error(`[interact] 会话 ${sessionId} 已过期，创建新会话`);
                    }
                }

                // 没有可用会话，创建新页面
                if (!page) {
                    page = await browserManager.navigateTo(url);
                    const session = browserManager.sessions.create(page, url);
                    currentSessionId = session.id;
                    isNewSession = true;
                }

                touchActivity();

                switch (action) {
                    case "click":
                        if (!selector) throw new Error("click 操作必须提供 selector 参数");
                        await page.click(selector, { timeout: 10000 });
                        await new Promise((r) => setTimeout(r, 1000));
                        break;

                    case "type":
                        if (!selector) throw new Error("type 操作必须提供 selector 参数");
                        if (!text) throw new Error("type 操作必须提供 text 参数");
                        await page.fill(selector, text);
                        if (submitAfter) {
                            await page.press(selector, "Enter");
                            await new Promise((r) => setTimeout(r, 2000));
                        }
                        break;

                    case "scroll":
                        await browserManager.scrollPage(page, scrollCount || 3);
                        break;

                    case "wait":
                        await new Promise((r) => setTimeout(r, waitMs || 2000));
                        break;
                }

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                if (extractAfter !== false) {
                    const { extractContent } = await import("../extractor.js");
                    const html = await page.content();
                    const { title, content } = extractContent(html, page.url());

                    return {
                        content: [{
                            type: "text" as const,
                            text: `# ${title}\n\n` +
                                `操作: ${action}${selector ? ` (${selector})` : ""}${text ? ` "${text}"` : ""}\n` +
                                `当前URL: ${page.url()}\n` +
                                `会话ID: ${currentSessionId}\n\n` +
                                `${content}\n\n---\n耗时: ${elapsed}s`,
                        }],
                    };
                } else {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `操作完成: ${action}${selector ? ` (${selector})` : ""}\n` +
                                `当前URL: ${page.url()}\n` +
                                `会话ID: ${currentSessionId}\n耗时: ${elapsed}s`,
                        }],
                    };
                }
            } catch (err: any) {
                if (isNewSession && currentSessionId) {
                    await browserManager.sessions.close(currentSessionId);
                }
                return {
                    content: [{
                        type: "text" as const,
                        text: `交互失败: ${err.message}\n\n操作: ${action}\nURL: ${url}${selector ? `\n选择器: ${selector}` : ""}`,
                    }],
                    isError: true,
                };
            }
            // 不再 finally close page — 由会话池管理生命周期
        }
    );
}
