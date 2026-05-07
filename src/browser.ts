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
    SESSION_TIMEOUT,
    COOKIE_BACKUP_INTERVAL,
    getProxyConfig,
} from "./constants.js";
import { getStealthScripts } from "./stealth.js";

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

export function extractDomain(url: string): string {
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
    // 两个均匀随机数取平均，近似高斯分布，更自然
    const gaussian = (Math.random() + Math.random()) / 2;
    const ms = ANTI_BOT_DELAY_MIN + gaussian * (ANTI_BOT_DELAY_MAX - ANTI_BOT_DELAY_MIN);
    return sleep(ms);
}

// ========== 页面会话池 ==========

export interface PageSession {
    id: string;
    page: Page;
    url: string;
    createdAt: number;
    lastAccess: number;
}

class PageSessionPool {
    private sessions = new Map<string, PageSession>();
    private counter = 0;

    create(page: Page, url: string): PageSession {
        const id = `s${++this.counter}_${Date.now()}`;
        const session: PageSession = {
            id, page, url,
            createdAt: Date.now(),
            lastAccess: Date.now(),
        };
        this.sessions.set(id, session);
        console.error(`[session] 创建会话 ${id} -> ${url}`);
        return session;
    }

    get(id: string): PageSession | null {
        const session = this.sessions.get(id);
        if (!session) return null;
        if (session.page.isClosed()) {
            this.sessions.delete(id);
            return null;
        }
        session.lastAccess = Date.now();
        return session;
    }

    async close(id: string): Promise<boolean> {
        const session = this.sessions.get(id);
        if (!session) return false;
        try {
            if (!session.page.isClosed()) await session.page.close();
        } catch { /* ignore */ }
        this.sessions.delete(id);
        console.error(`[session] 关闭会话 ${id}`);
        return true;
    }

    list(): PageSession[] {
        // 清除已关闭的
        for (const [id, s] of this.sessions) {
            if (s.page.isClosed()) this.sessions.delete(id);
        }
        return Array.from(this.sessions.values());
    }

    async cleanup(timeout: number = SESSION_TIMEOUT): Promise<number> {
        const now = Date.now();
        let count = 0;
        for (const [id, session] of this.sessions) {
            if (session.page.isClosed() || now - session.lastAccess > timeout) {
                try {
                    if (!session.page.isClosed()) await session.page.close();
                } catch { /* ignore */ }
                this.sessions.delete(id);
                count++;
            }
        }
        if (count > 0) console.error(`[session] 清理了 ${count} 个过期会话`);
        return count;
    }

    async closeAll(): Promise<void> {
        for (const [, session] of this.sessions) {
            try {
                if (!session.page.isClosed()) await session.page.close();
            } catch { /* ignore */ }
        }
        this.sessions.clear();
    }
}

// ========== 浏览器管理器 ==========

class BrowserManager {
    private context: BrowserContext | null = null;
    private launching: Promise<BrowserContext> | null = null;
    private cookieTimer: ReturnType<typeof setInterval> | null = null;

    readonly sessions = new PageSessionPool();

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

    private async launch(): Promise<BrowserContext> {
        console.error("[browser] 正在启动 Chromium...");
        fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

        const proxyConfig = getProxyConfig();
        if (proxyConfig) console.error(`[browser] 使用代理: ${proxyConfig.server}`);

        const launchOptions: any = {
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
        };

        if (proxyConfig) {
            launchOptions.proxy = {
                server: proxyConfig.server,
                username: proxyConfig.username,
                password: proxyConfig.password,
            };
        }

        const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, launchOptions);
        await this.restoreCookies(ctx);

        // 注入深度反检测脚本
        for (const script of getStealthScripts()) {
            await ctx.addInitScript(script);
        }

        // GBK 编码修复 — 仅拦截 HTML 文档，非文档资源直接放行
        await ctx.route("**/*", async (route) => {
            if (route.request().resourceType() !== "document") {
                await route.continue();
                return;
            }
            try {
                const response = await route.fetch();
                const contentType = response.headers()["content-type"] || "";
                const isGBK = /charset\s*=\s*(gbk|gb2312|gb18030)/i.test(contentType);

                if (isGBK && contentType.includes("text/html")) {
                    const body = await response.body();
                    const decoded = iconv.decode(body, "gbk");
                    const newHeaders = { ...response.headers() };
                    newHeaders["content-type"] = "text/html; charset=utf-8";
                    await route.fulfill({ status: response.status(), headers: newHeaders, body: decoded });
                } else {
                    await route.fulfill({ response });
                }
            } catch {
                await route.continue();
            }
        });

        // Cookie 定时备份
        this.startCookieBackup();

        console.error("[browser] Chromium 已启动");
        return ctx;
    }

    /**
     * 创建新页面并导航到 URL
     */
    async navigateTo(
        url: string,
        options: {
            timeout?: number;
            scrollCount?: number;
            disableMedia?: boolean;
            retries?: number;
        } = {}
    ): Promise<Page> {
        touchActivity();
        const maxRetries = options.retries ?? 2;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                const backoff = 1000 * Math.pow(2, attempt - 1);
                console.error(`[browser] 第 ${attempt}/${maxRetries} 次重试，等待 ${backoff}ms...`);
                await sleep(backoff);
            }

            const ctx = await this.getContext();
            const page = await ctx.newPage();
            const timeout = options.timeout || DEFAULT_TIMEOUT;
            const shouldBlockMedia = options.disableMedia !== false;

            try {
                if (shouldBlockMedia) {
                    await page.route("**/*", (route) => {
                        const type = route.request().resourceType();
                        if (["image", "stylesheet", "font", "media"].includes(type)) {
                            return route.abort();
                        }
                        return route.fallback();
                    });
                }

                await domainThrottle(url);

                await page.goto(url, { waitUntil: "load", timeout });
                await this.waitForNavigationSettle(page, 3000);

                try {
                    await page.waitForLoadState("networkidle", { timeout: 5000 });
                } catch { /* 超时不致命 */ }

                await randomDelay();
                await this.waitForDOMStable(page, 3000);

                if (options.scrollCount && options.scrollCount > 0) {
                    await this.scrollPage(page, options.scrollCount);
                }

                touchActivity();
                return page;
            } catch (err: any) {
                lastError = err;
                await page.close().catch(() => { });

                const isTimeout = err.message?.includes("Timeout") || err.message?.includes("timeout");
                if (isTimeout) {
                    console.error("[browser] 页面加载超时，尝试提取已有内容");
                    const retryPage = await ctx.newPage();
                    if (shouldBlockMedia) {
                        await retryPage.route("**/*", (route) => {
                            const type = route.request().resourceType();
                            if (["image", "stylesheet", "font", "media"].includes(type)) return route.abort();
                            return route.fallback();
                        });
                    }
                    try {
                        await retryPage.goto(url, { waitUntil: "domcontentloaded", timeout });
                        await this.waitForNavigationSettle(retryPage, 2000);
                        touchActivity();
                        return retryPage;
                    } catch {
                        await retryPage.close().catch(() => { });
                        throw err;
                    }
                }

                console.error(`[browser] 导航失败 (attempt ${attempt + 1}): ${err.message}`);
                if (attempt >= maxRetries) throw err;
            }
        }

        throw lastError || new Error("导航失败");
    }

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
                    if (stableFor >= 900) return;
                } else {
                    console.error(`[browser] 检测到重定向: ${lastUrl} -> ${currentUrl}`);
                    lastUrl = currentUrl;
                    stableFor = 0;
                }
            } catch {
                stableFor = 0;
            }
        }
    }

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
                stableFor = 0;
            }
            await sleep(300);
        }
    }

    async scrollPage(page: Page, count: number): Promise<void> {
        for (let i = 0; i < count; i++) {
            try {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            } catch { break; }
            await sleep(800);
        }
        try { await page.evaluate(() => window.scrollTo(0, 0)); } catch { /* ignore */ }
        await sleep(300);
    }

    detectSPAIssue(content: string, url: string): string | null {
        const domain = extractDomain(url);
        if (!SPA_DOMAINS.some((d) => domain.includes(d))) return null;
        const textLen = content.replace(/\s+/g, "").length;
        if (textLen > SPA_SKELETON_THRESHOLD) return null;
        const hasSkeleton = SPA_SKELETON_KEYWORDS.some((kw) => content.includes(kw));
        if (textLen < SPA_SKELETON_THRESHOLD || hasSkeleton) {
            return `[提示] 检测到 ${domain} 可能是 SPA 空壳页面（有效文本仅 ${textLen} 字）。建议设置 scrollCount 参数（如 scrollCount=3）触发懒加载内容。`;
        }
        return null;
    }

    getRedirectInfo(requestedUrl: string, finalUrl: string): string | null {
        try {
            const reqDomain = extractDomain(requestedUrl);
            const finalDomain = extractDomain(finalUrl);
            if (reqDomain !== finalDomain) {
                return `[警告] 检测到跨域重定向: ${reqDomain} -> ${finalDomain}。页面内容可能不是你请求的目标。`;
            }
            if (requestedUrl !== finalUrl) {
                return `[提示] 页面发生了重定向: ${requestedUrl} -> ${finalUrl}`;
            }
        } catch { /* ignore */ }
        return null;
    }

    async getCookies(domain?: string): Promise<any[]> {
        const ctx = await this.getContext();
        const cookies = await ctx.cookies();
        return domain ? cookies.filter((c) => c.domain.includes(domain)) : cookies;
    }

    async launchLoginMode(url?: string): Promise<string> {
        console.error("[browser] 启动有头浏览器进行登录...");
        await this.saveCookies();
        await this.closeBrowser();

        const proxyConfig = getProxyConfig();
        const launchOptions: any = {
            headless: false,
            args: ["--disable-blink-features=AutomationControlled"],
            userAgent: DEFAULT_USER_AGENT,
            viewport: { width: 1280, height: 900 },
            locale: "zh-CN",
            timezoneId: "Asia/Shanghai",
        };
        if (proxyConfig) {
            launchOptions.proxy = { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password };
        }

        const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, launchOptions);
        const page = ctx.pages()[0] || (await ctx.newPage());
        if (url) {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
        }

        return new Promise<string>((resolve) => {
            // 定时保存 Cookie（在用户还在操作时就保存，防止关闭时 context 已销毁）
            const cookieSaveTimer = setInterval(async () => {
                try {
                    const cookies = await ctx.cookies();
                    fs.mkdirSync(path.dirname(COOKIES_BACKUP_FILE), { recursive: true });
                    fs.writeFileSync(COOKIES_BACKUP_FILE, JSON.stringify(cookies, null, 2));
                } catch { /* ignore */ }
            }, 3000);

            ctx.on("close", async () => {
                clearInterval(cookieSaveTimer);
                // 最后一次尝试保存
                try {
                    const cookies = await ctx.cookies();
                    fs.writeFileSync(COOKIES_BACKUP_FILE, JSON.stringify(cookies, null, 2));
                    console.error(`[browser] 已保存 ${cookies.length} 个 Cookie`);
                } catch {
                    console.error("[browser] 浏览器已关闭，Cookie 保存在 profile 中");
                }
                resolve(`登录完成。浏览器已关闭，Cookie 已保存到 profile。`);
            });
        });
    }

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

    private startCookieBackup(): void {
        if (this.cookieTimer) return;
        this.cookieTimer = setInterval(() => this.saveCookies(), COOKIE_BACKUP_INTERVAL);
        this.cookieTimer.unref();
    }

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

    async closeBrowser(): Promise<void> {
        if (!this.context) return;
        await this.sessions.closeAll();
        if (this.cookieTimer) {
            clearInterval(this.cookieTimer);
            this.cookieTimer = null;
        }
        try {
            await this.saveCookies();
            await this.context.close();
        } catch { /* ignore */ }
        this.context = null;
        console.error("[browser] 浏览器已关闭，内存已释放");
    }

    async close(): Promise<void> {
        await this.closeBrowser();
    }
}

export const browserManager = new BrowserManager();
