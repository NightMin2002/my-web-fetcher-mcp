/**
 * 站点配方系统（Site Recipe）
 *
 * 记录对特定站点的成功操作序列，下次直接回放。
 * 配方以 JSON 文件持久化存储在 profile 目录的 recipes/ 子目录中。
 */

import fs from "fs";
import path from "path";
import { RECIPE_DIR } from "./constants.js";

// ========== 数据结构 ==========

export interface RecipeStep {
    action: "navigate" | "click" | "type" | "scroll" | "wait";
    url?: string;
    selector?: string;
    value?: string;          // 实际值或模板变量如 "{{query}}"
    waitMs?: number;
    scrollCount?: number;
    submitAfter?: boolean;
}

export interface SiteRecipe {
    id: string;
    domain: string;
    name: string;
    description: string;
    steps: RecipeStep[];
    variables: string[];     // 模板变量列表，如 ["query"]
    createdAt: number;
    lastUsed: number;
    useCount: number;
    successCount: number;
}

// ========== 辅助函数 ==========

export function extractDomainForRecipe(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split(".");
        return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    } catch {
        return "unknown";
    }
}

// ========== 配方管理器 ==========

class RecipeManager {
    private recipes = new Map<string, SiteRecipe>();
    private loaded = false;

    private ensureDir(): void {
        fs.mkdirSync(RECIPE_DIR, { recursive: true });
    }

    /** 从磁盘加载所有配方 */
    load(): void {
        if (this.loaded) return;
        this.ensureDir();
        try {
            const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith(".json"));
            for (const file of files) {
                try {
                    const raw = fs.readFileSync(path.join(RECIPE_DIR, file), "utf-8");
                    const recipe = JSON.parse(raw) as SiteRecipe;
                    this.recipes.set(recipe.id, recipe);
                } catch {
                    console.error(`[recipe] 加载配方失败: ${file}`);
                }
            }
            if (this.recipes.size > 0) {
                console.error(`[recipe] 已加载 ${this.recipes.size} 个配方`);
            }
        } catch { /* ignore */ }
        this.loaded = true;
    }

    /** 保存单个配方到磁盘 */
    private save(recipe: SiteRecipe): void {
        this.ensureDir();
        const filePath = path.join(RECIPE_DIR, `${recipe.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2));
    }

    /** 创建新配方 */
    create(params: {
        domain: string;
        name: string;
        description: string;
        steps: RecipeStep[];
        variables: string[];
    }): SiteRecipe {
        const safeDomain = params.domain.replace(/\./g, "_");
        const id = `${safeDomain}_${params.name}_${Date.now()}`;
        const recipe: SiteRecipe = {
            id,
            ...params,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            useCount: 0,
            successCount: 0,
        };
        this.recipes.set(id, recipe);
        this.save(recipe);
        console.error(`[recipe] 创建配方: ${recipe.name} (${recipe.domain})`);
        return recipe;
    }

    /** 按域名和名称查找配方 */
    find(domain: string, name?: string): SiteRecipe[] {
        this.load();
        const results: SiteRecipe[] = [];
        for (const recipe of this.recipes.values()) {
            const domainMatch = recipe.domain === domain || domain.includes(recipe.domain);
            if (domainMatch && (!name || recipe.name === name)) {
                results.push(recipe);
            }
        }
        return results.sort((a, b) => {
            const rateA = a.useCount > 0 ? a.successCount / a.useCount : 0;
            const rateB = b.useCount > 0 ? b.successCount / b.useCount : 0;
            return rateB - rateA;
        });
    }

    /** 按 URL 查找配方 */
    findByUrl(url: string, name?: string): SiteRecipe[] {
        return this.find(extractDomainForRecipe(url), name);
    }

    /** 列出所有配方 */
    list(): SiteRecipe[] {
        this.load();
        return Array.from(this.recipes.values());
    }

    /** 获取单个配方 */
    get(id: string): SiteRecipe | undefined {
        this.load();
        return this.recipes.get(id);
    }

    /** 记录使用结果 */
    recordUsage(id: string, success: boolean): void {
        const recipe = this.recipes.get(id);
        if (!recipe) return;
        recipe.useCount++;
        if (success) recipe.successCount++;
        recipe.lastUsed = Date.now();
        this.save(recipe);
    }

    /** 删除配方 */
    delete(id: string): boolean {
        const recipe = this.recipes.get(id);
        if (!recipe) return false;
        this.recipes.delete(id);
        try {
            fs.unlinkSync(path.join(RECIPE_DIR, `${id}.json`));
        } catch { /* ignore */ }
        return true;
    }

    /** 将模板变量替换为实际值 */
    resolveSteps(steps: RecipeStep[], variables: Record<string, string>): RecipeStep[] {
        return steps.map(step => {
            const resolved = { ...step };
            for (const [key, val] of Object.entries(variables)) {
                if (resolved.value) {
                    resolved.value = resolved.value.replace(`{{${key}}}`, val);
                }
                if (resolved.url) {
                    resolved.url = resolved.url.replace(`{{${key}}}`, val);
                }
            }
            return resolved;
        });
    }
}

export const recipeManager = new RecipeManager();
