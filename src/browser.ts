import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "fs";
import path from "path";
import iconv from "iconv-lite";
import {
    BROWSER_PROFILE_DIR,
    COOKIES_BACKUP_FILE,
    DEFAULT_USER_AGENT,
    DEFAULT_TIMEOUT,
    ANTI_BOT_DELAY_MIN,
    ANTI_BOT_DELAY_MAX,
    DOMAIN_COOLDOWN,
    BROWSER_HEADERS,
    SPA_DOMAINS,
    SPA_SKELETON_KEYWORDS,
    SPA_SKELETON_THRESHOLD,
} from "./constants.js";

// ========== 活动时间追踪 ==========

let lastActivity = Date.now();

export function touchActivity(): void {
    lastActivity = Date.now();
}

export function getIdleTime(): number {
    return Date.now() - lastActivity;
}

// ========== 域名限速 ==========

const domainLastRequest = new Map<string, number>();

function extractDomain(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split(".");
        return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    } catch {
        return "unknown";
    }
}

async function domainThrottle(url: string): Promise<void> {
    const domain = extractDomain(url);
    const last = domainLastRequest.get(domain) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < DOMAIN_COOLDOWN) {
        const wait = DOMAIN_COOLDOWN - elapsed;
        console.error(`[browser] 域名 ${domain} 限速 ${wait}ms`);
        await sleep(wait);
    }
    domainLastRequest.set(domain, Date.now());
}

// ========== 工具函数 ==========

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(): Promise<void> {
    const ms = ANTI_BOT_DELAY_MIN + Math.random() * (ANTI_BOT_DELAY_MAX - ANTI_BOT_DELAY_MIN);
    return sleep(ms);
}

// ========== 浏览器管理器 ==========

class BrowserManager {
    private context: BrowserContext | null = null;
    private launching: Promise<BrowserContext> | null = null;

    /**
     * 获取或启动浏览器上下文
     */
    async getContext(): Promise<BrowserContext> {
        if (this.context) return this.context;
        if (this.launching) return this.launching;

        this.launching = this.launch();
        try {
            this.context = await this.launching;
            return this.context;
        } finally {
            this.launching = null;
        }
    }

    /**
     * 启动 persistent context
     */
    private async launch(): Promise<BrowserContext> {
        console.error("[browser] 正在启动 Chromium...");

        // 确保 profile 目录存在
        fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

        const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
            headless: true,
            args: [
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-web-security",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            userAgent: DEFAULT_USER_AGENT,
            viewport: { width: 1280, height: 900 },
            locale: "zh-CN",
            timezoneId: "Asia/Shanghai",
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: BROWSER_HEADERS,
        });

        // 恢复 Cookie 备份
        await this.restoreCookies(ctx);

        // 注入反检测脚本
        await ctx.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => false });
            // @ts-ignore
            window.chrome = { runtime: {} };
        });

        // GBK 编码修复：路由拦截
        await ctx.route("**/*", async (route) => {
            try {
                const response = await route.fetch();
                const contentType = response.headers()["content-type"] || "";

                // 检测 GBK/GB2312 编码
                const isGBK = /charset\s*=\s*(gbk|gb2312|gb18030)/i.test(contentType);

                if (isGBK && contentType.includes("text/html")) {
                    const body = await response.body();
                    const decoded = iconv.decode(body, "gbk");
                    const newHeaders = { ...response.headers() };
                    newHeaders["content-type"] = "text/html; charset=utf-8";

                    await route.fulfill({
                        status: response.status(),
                        headers: newHeaders,
                        body: decoded,
                    });
                } else {
                    await route.fulfill({ response });
                }
            } catch {
                await route.continue();
            }
        });

        console.error("[browser] Chromium 已启动");
        return ctx;
    }

    /**
     * 创建新页面并导航到 URL
     * 处理重定向：等待所有跳转完成后再提取内容
     */
    async navigateTo(
        url: string,
        options: {
            timeout?: number;
            scrollCount?: number;
        } = {}
    ): Promise<Page> {
        touchActivity();

        const ctx = await this.getContext();
        const page = await ctx.newPage();
        const timeout = options.timeout || DEFAULT_TIMEOUT;

        // 域名限速
        await domainThrottle(url);

        // 导航 — 用 load 而非 domcontentloaded，给重定向更多时间
        try {
            await page.goto(url, {
                waitUntil: "load",
                timeout,
            });
        } catch (err: any) {
            // 超时不一定是致命的
            const isTimeout = err.message?.includes("Timeout") || err.message?.includes("timeout");
            if (isTimeout) {
                console.error("[browser] 页面加载超时，尝试继续提取");
            } else {
                await page.close();
                throw err;
            }
        }

        // 等待重定向链完成 — 给页面额外 2 秒稳定窗口
        // 这解决了知乎等站点多次跳转导致 execution context destroyed 的问题
        await this.waitForNavigationSettle(page, 3000);

        // 等待网络空闲（最多再等 5 秒）
        try {
            await page.waitForLoadState("networkidle", { timeout: 5000 });
        } catch {
            // 超时不致命
        }

        // 反爬随机延迟
        await randomDelay();

        // 等待 DOM 稳定
        await this.waitForDOMStable(page, 3000);

        // 滚动触发懒加载
        if (options.scrollCount && options.scrollCount > 0) {
            await this.scrollPage(page, options.scrollCount);
        }

        touchActivity();
        return page;
    }

    /**
     * 等待重定向链完成 — URL 不再变化则认为稳定
     */
    private async waitForNavigationSettle(page: Page, timeout: number): Promise<void> {
        const start = Date.now();
        let lastUrl = page.url();
        let stableFor = 0;

        while (Date.now() - start < timeout) {
            await sleep(300);
            try {
                const currentUrl = page.url();
                if (currentUrl === lastUrl) {
                    stableFor += 300;
                    if (stableFor >= 900) return; // URL 稳定 0.9s
                } else {
                    console.error(`[browser] 检测到重定向: ${lastUrl} -> ${currentUrl}`);
                    lastUrl = currentUrl;
                    stableFor = 0;
                }
            } catch {
                // page 可能在导航中，忽略
                stableFor = 0;
            }
        }
    }

    /**
     * 等待 DOM 元素数量稳定
     * try-catch 保护 evaluate，防止导航期间 context 被销毁
     */
    private async waitForDOMStable(page: Page, timeout: number): Promise<void> {
        const start = Date.now();
        let lastCount = 0;
        let stableFor = 0;

        while (Date.now() - start < timeout) {
            try {
                const count = await page.evaluate(() => document.querySelectorAll("*").length);
                if (count === lastCount) {
                    stableFor += 300;
                    if (stableFor >= 900) return;
                } else {
                    stableFor = 0;
                    lastCount = count;
                }
            } catch {
                // evaluate 失败说明页面正在导航，重置稳定计数
                stableFor = 0;
            }
            await sleep(300);
        }
    }

    /**
     * 滚动页面触发懒加载
     */
    async scrollPage(page: Page, count: number): Promise<void> {
        for (let i = 0; i < count; i++) {
            try {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            } catch {
                break; // context 被销毁则停止滚动
            }
            await sleep(800);
        }
        // 滚回顶部
        try {
            await page.evaluate(() => window.scrollTo(0, 0));
        } catch {
            // 忽略
        }
        await sleep(300);
    }

    /**
     * 检测 SPA 空壳
     */
    detectSPAIssue(content: string, url: string): string | null {
        const domain = extractDomain(url);
        const isSPADomain = SPA_DOMAINS.some((d) => domain.includes(d));
        if (!isSPADomain) return null;

        const textLen = content.replace(/\s+/g, "").length;
        if (textLen > SPA_SKELETON_THRESHOLD) return null;

        const hasSkeleton = SPA_SKELETON_KEYWORDS.some((kw) => content.includes(kw));
        if (textLen < SPA_SKELETON_THRESHOLD || hasSkeleton) {
            return `[提示] 检测到 ${domain} 可能是 SPA 空壳页面（有效文本仅 ${textLen} 字）。建议设置 scrollCount 参数（如 scrollCount=3）触发懒加载内容。`;
        }
        return null;
    }

    /**
     * 获取重定向信息 — 比较请求 URL 和最终 URL
     * 用于检测域名级跳转（如被 DNS 劫持到其他站点）
     */
    getRedirectInfo(requestedUrl: string, finalUrl: string): string | null {
        try {
            const reqDomain = extractDomain(requestedUrl);
            const finalDomain = extractDomain(finalUrl);

            if (reqDomain !== finalDomain) {
                return `[警告] 检测到跨域重定向: ${reqDomain} -> ${finalDomain}。页面内容可能不是你请求的目标。这通常是网络环境（DNS/防火墙）导致的。`;
            }

            if (requestedUrl !== finalUrl) {
                return `[提示] 页面发生了重定向: ${requestedUrl} -> ${finalUrl}`;
            }
        } catch {
            // URL 解析失败忽略
        }
        return null;
    }

    /**
     * 获取 Cookie
     */
    async getCookies(domain?: string): Promise<any[]> {
        const ctx = await this.getContext();
        const cookies = await ctx.cookies();
        if (domain) {
            return cookies.filter((c) => c.domain.includes(domain));
        }
        return cookies;
    }

    /**
     * 有头模式登录
     */
    async launchLoginMode(url?: string): Promise<string> {
        console.error("[browser] 启动有头浏览器进行登录...");

        // 先关闭无头浏览器
        await this.closeBrowser();

        const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
            headless: false,
            args: ["--disable-blink-features=AutomationControlled"],
            userAgent: DEFAULT_USER_AGENT,
            viewport: { width: 1280, height: 900 },
            locale: "zh-CN",
            timezoneId: "Asia/Shanghai",
        });

        const page = ctx.pages()[0] || (await ctx.newPage());
        if (url) {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
        }

        // 等待用户关闭浏览器
        return new Promise<string>((resolve) => {
            ctx.on("close", async () => {
                // 保存 Cookie
                try {
                    const cookies = await ctx.cookies();
                    fs.writeFileSync(COOKIES_BACKUP_FILE, JSON.stringify(cookies, null, 2));
                    console.error(`[browser] 已保存 ${cookies.length} 个 Cookie`);
                } catch {
                    // 浏览器已关，Cookie 仍在 profile 中
                }
                resolve(`登录完成。浏览器已关闭，Cookie 已保存到 profile。`);
            });
        });
    }

    /**
     * 保存 Cookie 到备份文件
     */
    async saveCookies(): Promise<void> {
        if (!this.context) return;
        try {
            const cookies = await this.context.cookies();
            fs.mkdirSync(path.dirname(COOKIES_BACKUP_FILE), { recursive: true });
            fs.writeFileSync(COOKIES_BACKUP_FILE, JSON.stringify(cookies, null, 2));
        } catch (err) {
            console.error("[browser] Cookie 备份失败:", err);
        }
    }

    /**
     * 从备份恢复 Cookie
     */
    private async restoreCookies(ctx: BrowserContext): Promise<void> {
        if (!fs.existsSync(COOKIES_BACKUP_FILE)) return;
        try {
            const raw = fs.readFileSync(COOKIES_BACKUP_FILE, "utf-8");
            const cookies = JSON.parse(raw);
            if (Array.isArray(cookies) && cookies.length > 0) {
                await ctx.addCookies(cookies);
                console.error(`[browser] 已恢复 ${cookies.length} 个 Cookie`);
            }
        } catch (err) {
            console.error("[browser] Cookie 恢复失败:", err);
        }
    }

    /**
     * 仅关闭浏览器释放内存，MCP 进程保持
     */
    async closeBrowser(): Promise<void> {
        if (!this.context) return;
        try {
            await this.saveCookies();
            await this.context.close();
        } catch {
            // ignore
        }
        this.context = null;
        console.error("[browser] 浏览器已关闭，内存已释放");
    }

    /**
     * 完全关闭（进程退出时调用）
     */
    async close(): Promise<void> {
        await this.closeBrowser();
    }
}

export const browserManager = new BrowserManager();
