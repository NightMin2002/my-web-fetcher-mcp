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
        "支持 JPEG(体积小) 和 PNG(文字清晰) 两种格式。" +
        "可通过 selector 指定截取特定元素。截图保存为临时文件返回路径，或内联返回 base64。",
        {
            url: z
                .string()
                .describe("要截图的网页 URL"),
            quality: z
                .enum(["hd", "default", "fast"])
                .optional()
                .describe("截图质量: hd=高清, default=标准, fast=快速低质。默认 default"),
            format: z
                .enum(["jpeg", "png"])
                .optional()
                .describe("截图格式: jpeg=体积小, png=文字清晰。默认 jpeg"),
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
            selector: z
                .string()
                .optional()
                .describe("CSS 选择器，截取指定元素而非整个页面"),
        },
        async ({ url, quality, format, fullPage, saveToFile, scrollCount, selector }) => {
            const start = Date.now();
            const preset = QUALITY_PRESETS[(quality || "default") as ImageQuality];
            const save = saveToFile !== false;
            const imgFormat = format || "jpeg";

            let page;
            try {
                page = await browserManager.navigateTo(url, {
                    scrollCount: scrollCount || 0,
                    disableMedia: false,
                });

                await page.setViewportSize({ width: preset.viewportWidth, height: 900 });
                await new Promise((r) => setTimeout(r, 500));

                const screenshotOptions: any = {
                    type: imgFormat,
                    fullPage: fullPage || false,
                };
                if (imgFormat === "jpeg") {
                    screenshotOptions.quality = preset.jpegQuality;
                }

                let screenshotBuffer: Buffer;
                if (selector) {
                    const element = await page.$(selector);
                    if (!element) throw new Error(`找不到元素: ${selector}`);
                    screenshotBuffer = await element.screenshot(screenshotOptions);
                } else {
                    screenshotBuffer = await page.screenshot(screenshotOptions);
                }

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                const ext = imgFormat === "png" ? "png" : "jpg";

                if (save) {
                    const tmpDir = os.tmpdir();
                    const fileName = `mcp-screenshot-${Date.now()}.${ext}`;
                    const filePath = path.join(tmpDir, fileName);
                    fs.writeFileSync(filePath, screenshotBuffer);

                    const sizeKB = (screenshotBuffer.length / 1024).toFixed(0);
                    return {
                        content: [{
                            type: "text" as const,
                            text: `截图已保存\n\n路径: ${filePath}\n大小: ${sizeKB}KB\n格式: ${imgFormat}\n质量: ${quality || "default"}${selector ? `\n元素: ${selector}` : ""}\n耗时: ${elapsed}s`,
                        }],
                    };
                } else {
                    const base64 = screenshotBuffer.toString("base64");
                    const mimeType = imgFormat === "png" ? "image/png" : "image/jpeg";
                    return {
                        content: [
                            { type: "image" as const, data: base64, mimeType },
                            { type: "text" as const, text: `截图完成 | 格式: ${imgFormat} | 质量: ${quality || "default"} | 耗时: ${elapsed}s` },
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
