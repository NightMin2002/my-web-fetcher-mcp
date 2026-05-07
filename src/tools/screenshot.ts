import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager } from "../browser.js";
import { QUALITY_PRESETS, type ImageQuality } from "../constants.js";
import fs from "fs";
import path from "path";
import os from "os";

export function registerScreenshot(server: McpServer): void {
    server.tool(
        "web_screenshot",
        "对网页进行截图。支持完整页面截图或可视区域截图。" +
        "支持三种质量: hd(1920px高清), default(1280px标准), fast(1024px快速)。" +
        "截图保存为临时文件返回路径，或内联返回 base64。",
        {
            url: z
                .string()
                .describe("要截图的网页 URL"),
            quality: z
                .enum(["hd", "default", "fast"])
                .optional()
                .describe("截图质量: hd=高清, default=标准, fast=快速低质。默认 default"),
            fullPage: z
                .boolean()
                .optional()
                .describe("是否截取完整页面（含滚动区域）。默认 false 只截可视区域"),
            saveToFile: z
                .boolean()
                .optional()
                .describe("true=保存到临时文件返回路径, false=内联返回 base64。默认 true"),
            scrollCount: z
                .number()
                .int()
                .min(0)
                .max(10)
                .optional()
                .describe("截图前的滚动次数，用于加载懒加载内容。默认 0"),
        },
        async ({ url, quality, fullPage, saveToFile, scrollCount }) => {
            const start = Date.now();
            const preset = QUALITY_PRESETS[(quality || "default") as ImageQuality];
            const save = saveToFile !== false; // 默认 true

            let page;
            try {
                page = await browserManager.navigateTo(url, {
                    scrollCount: scrollCount || 0,
                });

                // 调整视口宽度
                await page.setViewportSize({
                    width: preset.viewportWidth,
                    height: 900,
                });

                // 等待一下让布局调整
                await new Promise((r) => setTimeout(r, 500));

                const screenshotBuffer = await page.screenshot({
                    type: "jpeg",
                    quality: preset.jpegQuality,
                    fullPage: fullPage || false,
                });

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                if (save) {
                    // 保存到临时文件
                    const tmpDir = os.tmpdir();
                    const fileName = `mcp-screenshot-${Date.now()}.jpg`;
                    const filePath = path.join(tmpDir, fileName);
                    fs.writeFileSync(filePath, screenshotBuffer);

                    const sizeKB = (screenshotBuffer.length / 1024).toFixed(0);
                    return {
                        content: [{
                            type: "text" as const,
                            text: `截图已保存\n\n路径: ${filePath}\n大小: ${sizeKB}KB\n质量: ${quality || "default"}\n完整页面: ${fullPage || false}\n耗时: ${elapsed}s`,
                        }],
                    };
                } else {
                    // 内联 base64
                    const base64 = screenshotBuffer.toString("base64");
                    return {
                        content: [
                            {
                                type: "image" as const,
                                data: base64,
                                mimeType: "image/jpeg",
                            },
                            {
                                type: "text" as const,
                                text: `截图完成 | 质量: ${quality || "default"} | 耗时: ${elapsed}s`,
                            },
                        ],
                    };
                }
            } catch (err: any) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `截图失败: ${err.message}\n\nURL: ${url}`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );
}
