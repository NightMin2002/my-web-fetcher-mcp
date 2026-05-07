import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";

export function registerLogin(server: McpServer): void {
    server.tool(
        "web_login",
        "打开一个有头（可见）浏览器窗口，让用户手动登录网站。" +
        "登录完成后关闭浏览器窗口即可。Cookie 会自动保存到本地 profile，" +
        "之后使用 web_fetch 等工具时会自动携带登录态。" +
        "使用场景：首次使用前登录知乎、B站、X 等需要登录才能访问的网站。",
        {
            url: z
                .string()
                .optional()
                .describe("可选，打开浏览器时自动导航到的 URL（如 https://www.zhihu.com/signin）"),
        },
        async ({ url }) => {
            try {
                const result = await browserManager.launchLoginMode(url);
                return {
                    content: [{ type: "text" as const, text: result }],
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `登录浏览器启动失败: ${err.message}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
