import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { browserManager, touchActivity } from "../browser.js";
import { recipeManager, type RecipeStep } from "../recipe.js";
import { extractContent } from "../extractor.js";

export function registerRecipe(server: McpServer): void {
    // 工具 1：保存配方
    server.tool(
        "web_recipe_save",
        "保存一个站点操作配方（Site Recipe）。配方是对特定站点的操作序列记录，" +
        "保存后下次遇到同样操作可直接回放，无需重新探索页面结构。" +
        "适合记录搜索、登录检查、内容提取等常用操作流程。",
        {
            domain: z
                .string()
                .describe("站点域名，如 'zhihu.com'、'baidu.com'"),
            name: z
                .string()
                .describe("配方名称，如 'search'、'login_check'"),
            description: z
                .string()
                .describe("配方描述，说明这个配方做什么"),
            steps: z
                .array(z.object({
                    action: z.enum(["navigate", "click", "type", "scroll", "wait"]),
                    url: z.string().optional(),
                    selector: z.string().optional(),
                    value: z.string().optional().describe("实际值或模板变量如 {{query}}"),
                    waitMs: z.number().optional(),
                    scrollCount: z.number().optional(),
                    submitAfter: z.boolean().optional(),
                }))
                .describe("操作步骤列表"),
            variables: z
                .array(z.string())
                .optional()
                .describe("模板变量名列表，如 ['query']。步骤中用 {{变量名}} 引用"),
        },
        async ({ domain, name, description, steps, variables }) => {
            const recipe = recipeManager.create({
                domain,
                name,
                description,
                steps: steps as RecipeStep[],
                variables: variables || [],
            });
            return {
                content: [{
                    type: "text" as const,
                    text: `配方已保存\n\nID: ${recipe.id}\n域名: ${domain}\n名称: ${name}\n步骤数: ${steps.length}\n变量: ${(variables || []).join(", ") || "无"}`,
                }],
            };
        }
    );

    // 工具 2：列出/查找配方
    server.tool(
        "web_recipe_list",
        "列出已保存的站点操作配方。可按域名过滤。",
        {
            domain: z
                .string()
                .optional()
                .describe("按域名过滤，如 'zhihu.com'"),
        },
        async ({ domain }) => {
            const recipes = domain ? recipeManager.find(domain) : recipeManager.list();
            if (recipes.length === 0) {
                return {
                    content: [{ type: "text" as const, text: domain ? `没有找到 ${domain} 的配方。` : "暂无保存的配方。" }],
                };
            }
            const lines = recipes.map((r, i) => {
                const rate = r.useCount > 0 ? `${((r.successCount / r.useCount) * 100).toFixed(0)}%` : "未使用";
                return `${i + 1}. [${r.domain}] ${r.name}\n   ID: ${r.id}\n   描述: ${r.description}\n   步骤: ${r.steps.length} 步 | 变量: ${r.variables.join(", ") || "无"}\n   成功率: ${rate} (${r.useCount} 次)`;
            });
            return {
                content: [{
                    type: "text" as const,
                    text: `配方列表 (${recipes.length} 个):\n\n${lines.join("\n\n")}`,
                }],
            };
        }
    );

    // 工具 3：执行配方
    server.tool(
        "web_recipe_run",
        "执行一个已保存的站点操作配方。传入配方 ID 和变量值，自动按步骤回放操作。" +
        "执行完后返回最终页面的内容。",
        {
            recipeId: z
                .string()
                .describe("配方 ID"),
            variables: z
                .record(z.string())
                .optional()
                .describe("模板变量值，如 { \"query\": \"playwright 教程\" }"),
        },
        async ({ recipeId, variables }) => {
            const start = Date.now();
            const recipe = recipeManager.get(recipeId);
            if (!recipe) {
                return {
                    content: [{ type: "text" as const, text: `配方 ${recipeId} 不存在。` }],
                    isError: true,
                };
            }

            const resolvedSteps = recipeManager.resolveSteps(recipe.steps, variables || {});
            let page;

            try {
                // 执行步骤
                for (let i = 0; i < resolvedSteps.length; i++) {
                    const step = resolvedSteps[i];
                    console.error(`[recipe] 执行步骤 ${i + 1}/${resolvedSteps.length}: ${step.action}`);

                    switch (step.action) {
                        case "navigate": {
                            if (!step.url) throw new Error(`步骤 ${i + 1}: navigate 缺少 url`);
                            if (page) await page.close().catch(() => { });
                            page = await browserManager.navigateTo(step.url);
                            break;
                        }
                        case "click": {
                            if (!page) throw new Error(`步骤 ${i + 1}: 没有已打开的页面`);
                            if (!step.selector) throw new Error(`步骤 ${i + 1}: click 缺少 selector`);
                            await page.click(step.selector, { timeout: 10000 });
                            await new Promise(r => setTimeout(r, 1000));
                            break;
                        }
                        case "type": {
                            if (!page) throw new Error(`步骤 ${i + 1}: 没有已打开的页面`);
                            if (!step.selector) throw new Error(`步骤 ${i + 1}: type 缺少 selector`);
                            await page.fill(step.selector, step.value || "");
                            if (step.submitAfter) {
                                await page.press(step.selector, "Enter");
                                await new Promise(r => setTimeout(r, 2000));
                            }
                            break;
                        }
                        case "scroll": {
                            if (!page) throw new Error(`步骤 ${i + 1}: 没有已打开的页面`);
                            await browserManager.scrollPage(page, step.scrollCount || 3);
                            break;
                        }
                        case "wait": {
                            await new Promise(r => setTimeout(r, step.waitMs || 2000));
                            break;
                        }
                    }
                    touchActivity();
                }

                if (!page) throw new Error("配方执行完毕但没有打开任何页面");

                // 提取结果
                const html = await page.content();
                const { title, content } = extractContent(html, page.url());
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);

                recipeManager.recordUsage(recipeId, true);

                return {
                    content: [{
                        type: "text" as const,
                        text: `# ${title}\n\n` +
                            `配方: ${recipe.name} (${recipe.domain})\n` +
                            `URL: ${page.url()}\n\n${content}\n\n---\n配方执行完成 | ${resolvedSteps.length} 步 | 耗时: ${elapsed}s`,
                    }],
                };
            } catch (err: any) {
                recipeManager.recordUsage(recipeId, false);
                return {
                    content: [{
                        type: "text" as const,
                        text: `配方执行失败: ${err.message}\n\n配方: ${recipe.name} (${recipe.domain})`,
                    }],
                    isError: true,
                };
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }
    );

    // 工具 4：删除配方
    server.tool(
        "web_recipe_delete",
        "删除一个已保存的站点操作配方。",
        {
            recipeId: z
                .string()
                .describe("要删除的配方 ID"),
        },
        async ({ recipeId }) => {
            const deleted = recipeManager.delete(recipeId);
            return {
                content: [{
                    type: "text" as const,
                    text: deleted ? `配方 ${recipeId} 已删除。` : `配方 ${recipeId} 不存在。`,
                }],
            };
        }
    );
}
