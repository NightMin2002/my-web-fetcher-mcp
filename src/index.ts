#!/usr/bin/env node
/**
 * My Web Fetcher MCP Server v2.0
 *
 * 使用 Playwright 浏览器抓取网页内容的 MCP Server。
 * 通过 persistent context 保存登录态 Cookie，支持需要登录的网站。
 *
 * 工具列表：
 *   web_fetch          — 抓取网页正文 -> Markdown
 *   web_screenshot     — 网页截图
 *   web_login          — 打开有头浏览器登录
 *   web_search_extract — 提取页面链接
 *   web_interact       — 页面交互（点击/输入/滚动），支持会话复用
 *   web_evaluate       — 在页面执行自定义 JavaScript
 *   web_session        — 管理页面会话
 *   web_recipe_save    — 保存站点操作配方
 *   web_recipe_list    — 列出/查找配方
 *   web_recipe_run     — 执行配方
 *   web_recipe_delete  — 删除配方
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { browserManager, getIdleTime } from "./browser.js";
import {
    BROWSER_IDLE_TIMEOUT,
    PROCESS_IDLE_TIMEOUT,
    SESSION_TIMEOUT,
} from "./constants.js";

// 工具注册
import { registerFetch } from "./tools/fetch.js";
import { registerScreenshot } from "./tools/screenshot.js";
import { registerLogin } from "./tools/login.js";
import { registerLinks } from "./tools/links.js";
import { registerInteract } from "./tools/interact.js";
import { registerEvaluate } from "./tools/evaluate.js";
import { registerSession } from "./tools/session.js";
import { registerRecipe } from "./tools/recipe.js";

// ========== 创建 MCP Server ==========

const server = new McpServer({
    name: "my-web-fetcher-mcp",
    version: "2.0.0",
});

// 注册所有工具
registerFetch(server);
registerScreenshot(server);
registerLogin(server);
registerLinks(server);
registerInteract(server);
registerEvaluate(server);
registerSession(server);
registerRecipe(server);

// ========== 进程生命周期管理 ==========

let isClosing = false;

async function safeExit(reason: string): Promise<void> {
    if (isClosing) return;
    isClosing = true;
    console.error(`[mcp] ${reason}`);
    await cleanup();
    process.exit(0);
}

// stdin 断开检测
process.stdin.on("end", () => safeExit("stdin 管道断裂 — 宿主进程已退出"));
process.stdin.on("close", () => safeExit("stdin 管道关闭"));
process.stdin.on("error", (err) => safeExit(`stdin 错误: ${err.message}`));

// 心跳：浏览器空闲释放 + 会话清理 + 进程空闲退出
const heartbeat = setInterval(async () => {
    const idle = getIdleTime();

    // 清理过期会话
    await browserManager.sessions.cleanup(SESSION_TIMEOUT);

    // 浏览器空闲 20 分钟 -> 释放内存
    if (idle > BROWSER_IDLE_TIMEOUT) {
        console.error(`[mcp] 浏览器空闲 ${Math.round(idle / 60000)} 分钟，释放内存`);
        await browserManager.closeBrowser();
    }

    // 进程空闲 60 分钟 -> 退出
    if (idle > PROCESS_IDLE_TIMEOUT) {
        await safeExit(`空闲 ${Math.round(idle / 60000)} 分钟，自动退出`);
    }
}, 30000);

heartbeat.unref();

// ========== 启动 ==========

async function main(): Promise<void> {
    console.error("[mcp] My Web Fetcher MCP v2.0 启动中...");

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("[mcp] MCP Server 已启动，等待工具调用...");
}

main().catch((err) => {
    console.error("[mcp] 启动失败:", err);
    process.exit(1);
});

// 优雅关闭
async function cleanup(): Promise<void> {
    console.error("[mcp] 正在关闭...");
    clearInterval(heartbeat);
    await browserManager.close();
}

process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
});
