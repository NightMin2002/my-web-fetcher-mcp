import path from "path";
import os from "os";

// ========== 跨平台路径 ==========

/** 浏览器用户数据目录 — 优先读取环境变量，否则跨平台自动检测 */
function getProfileDir(): string {
    // 支持自定义目录（解决 C 盘空间不足或迁移场景）
    if (process.env.MCP_PROFILE_DIR) {
        return process.env.MCP_PROFILE_DIR;
    }
    switch (process.platform) {
        case "win32":
            return path.join(os.homedir(), "AppData", "Local", "my-web-fetcher-profile");
        case "darwin":
            return path.join(os.homedir(), "Library", "Application Support", "my-web-fetcher-profile");
        default:
            return path.join(os.homedir(), ".local", "share", "my-web-fetcher-profile");
    }
}

export const BROWSER_PROFILE_DIR = getProfileDir();
export const COOKIES_BACKUP_FILE = path.join(BROWSER_PROFILE_DIR, "cookies-backup.json");
export const RECIPE_DIR = path.join(BROWSER_PROFILE_DIR, "recipes");

// ========== 浏览器配置 ==========

export const DEFAULT_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT = 30000;
export const CHARACTER_LIMIT = 50000;

/** 反爬随机延迟范围(ms) */
export const ANTI_BOT_DELAY_MIN = 300;
export const ANTI_BOT_DELAY_MAX = 1200;

/** 域名级请求最小间隔(ms) */
export const DOMAIN_COOLDOWN = 3000;

/** 浏览器空闲自动关闭时间(ms) */
export const BROWSER_IDLE_TIMEOUT = 20 * 60 * 1000;

/** MCP 进程空闲自动退出时间(ms) */
export const PROCESS_IDLE_TIMEOUT = 60 * 60 * 1000;

/** 页面会话默认过期时间(ms) */
export const SESSION_TIMEOUT = 5 * 60 * 1000;

/** Cookie 自动备份间隔(ms) */
export const COOKIE_BACKUP_INTERVAL = 5 * 60 * 1000;

// ========== 代理配置 ==========

export interface ProxyConfig {
    server: string;
    username?: string;
    password?: string;
}

/** 从环境变量读取代理配置 */
export function getProxyConfig(): ProxyConfig | undefined {
    const proxy = process.env.MCP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!proxy) return undefined;
    try {
        const url = new URL(proxy);
        return {
            server: `${url.protocol}//${url.hostname}${url.port ? ":" + url.port : ""}`,
            username: url.username || undefined,
            password: url.password || undefined,
        };
    } catch {
        // 非标准格式，直接作为 server 使用
        return { server: proxy };
    }
}

// ========== 真实浏览器 Headers ==========

export const BROWSER_HEADERS: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    DNT: "1",
    "Upgrade-Insecure-Requests": "1",
};

// ========== 截图配置 ==========

export type ImageQuality = "hd" | "default" | "fast";

export interface QualityConfig {
    jpegQuality: number;
    viewportWidth: number;
}

export const QUALITY_PRESETS: Record<ImageQuality, QualityConfig> = {
    hd: { jpegQuality: 85, viewportWidth: 1920 },
    default: { jpegQuality: 55, viewportWidth: 1280 },
    fast: { jpegQuality: 30, viewportWidth: 1024 },
};

// ========== 输出模式 ==========

export const OUTPUT_MODE_LIMITS: Record<string, number> = {
    compact: 8000,
    summary: 3000,
};

// ========== SPA 检测 ==========

export const SPA_DOMAINS = [
    "bilibili.com", "miyoushe.com", "xiaohongshu.com",
    "douyin.com", "weibo.com", "zhihu.com",
    "taobao.com", "jd.com",
];

export const SPA_SKELETON_KEYWORDS = [
    "Loading", "loading", "加载中", "正在加载",
    "页面跳转", "即将跳转", "请稍候",
    "skeleton", "placeholder",
];

export const SPA_SKELETON_THRESHOLD = 200;

// ========== 中文页脚垃圾关键词 ==========

export const FOOTER_GARBAGE = [
    "ICP备", "ICP证", "营业执照", "网安备", "公安备",
    "违法不良信息举报", "网络文化经营许可",
    "增值电信业务经营许可", "广播电视节目制作经营许可",
];
