import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager, touchActivity } from "../browser.js";

export function registerInteract(server: McpServer): void {
    server.tool(
        "web_interact",
        "在已打开的页面上执行交互操作：点击按钮、输入文字、滚动页面。" +
        "适用于需要交互才能显示内容的场景（如展开折叠内容、点击翻页、搜索等）。" +
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
        },
        async ({ url, action, selector, text, scrollCount, waitMs, extractAfter }) => {
            const start = Date.now();
            let page;

            try {
                page = await browserManager.navigateTo(url);
                touchActivity();

                // 执行操作
                switch (action) {
                    case "click":
                        if (!selector) throw new Error("click 操作必须提供 selector 参数");
                        await page.click(selector, { timeout: 10000 });
                        await new Promise((r) => setTimeout(r, 1000)); // 等点击效果
                        break;

                    case "type":
                        if (!selector) throw new Error("type 操作必须提供 selector 参数");
                        if (!text) throw new Error("type 操作必须提供 text 参数");
                        await page.fill(selector, text);
                        // type 后通常需要按回车
                        await page.press(selector, "Enter");
                        await new Promise((r) => setTimeout(r, 2000)); // 等搜索结果
                        break;

                    case "scroll":
                        await browserManager.scrollPage(page, scrollCount || 3);
                        break;

                    case "wait":
                        await new Promise((r) => setTimeout(r, waitMs || 2000));
                        break;
                }

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                // 提取操作后的内容
                if (extractAfter !== false) {
                    const { extractContent } = await import("../extractor.js");
                    const html = await page.content();
                    const { title, content } = extractContent(html, page.url());

                    return {
                        content: [{
                            type: "text" as const,
                            text: `# ${title}\n\n操作: ${action}${selector ? ` (${selector})` : ""}${text ? ` "${text}"` : ""}\n当前URL: ${page.url()}\n\n${content}\n\n---\n耗时: ${elapsed}s`,
                        }],
                    };
                } else {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `操作完成: ${action}${selector ? ` (${selector})` : ""}\n当前URL: ${page.url()}\n耗时: ${elapsed}s`,
                        }],
                    };
                }
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `交互失败: ${err.message}\n\n操作: ${action}\nURL: ${url}${selector ? `\n选择器: ${selector}` : ""}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );
}
