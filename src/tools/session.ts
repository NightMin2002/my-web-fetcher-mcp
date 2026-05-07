import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";

export function registerSession(server: McpServer): void {
    server.tool(
        "web_session",
        "管理页面会话。可以列出所有活跃会话、关闭指定会话或关闭所有会话。" +
        "会话由 web_interact 创建，允许在同一页面上做连续操作。" +
        "会话空闲超过 5 分钟会自动关闭。",
        {
            action: z
                .enum(["list", "close", "close_all"])
                .describe("操作类型: list=列出所有会话, close=关闭指定会话, close_all=关闭所有会话"),
            sessionId: z
                .string()
                .optional()
                .describe("要关闭的会话 ID，close 操作必需"),
        },
        async ({ action, sessionId }) => {
            switch (action) {
                case "list": {
                    const sessions = browserManager.sessions.list();
                    if (sessions.length === 0) {
                        return {
                            content: [{ type: "text" as const, text: "当前没有活跃的页面会话。" }],
                        };
                    }
                    const lines = sessions.map((s, i) =>
                        `${i + 1}. ID: ${s.id}\n   URL: ${s.url}\n   创建: ${new Date(s.createdAt).toLocaleString()}\n   最后访问: ${new Date(s.lastAccess).toLocaleString()}`
                    );
                    return {
                        content: [{
                            type: "text" as const,
                            text: `活跃会话 (${sessions.length} 个):\n\n${lines.join("\n\n")}`,
                        }],
                    };
                }

                case "close": {
                    if (!sessionId) {
                        return {
                            content: [{ type: "text" as const, text: "close 操作必须提供 sessionId 参数" }],
                            isError: true,
                        };
                    }
                    const closed = await browserManager.sessions.close(sessionId);
                    return {
                        content: [{
                            type: "text" as const,
                            text: closed ? `会话 ${sessionId} 已关闭。` : `会话 ${sessionId} 不存在。`,
                        }],
                    };
                }

                case "close_all": {
                    const count = browserManager.sessions.list().length;
                    await browserManager.sessions.closeAll();
                    return {
                        content: [{
                            type: "text" as const,
                            text: `已关闭所有会话（共 ${count} 个）。`,
                        }],
                    };
                }
            }
        }
    );
}
