import path from "path";
import os from "os";

// ========== 浏览器配置 ==========

/** 浏览器用户数据目录 — 独立 profile，保存登录态 */
export const BROWSER_PROFILE_DIR = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "my-web-fetcher-profile"
);

/** Cookie 备份文件路径 */
export const COOKIES_BACKUP_FILE = path.join(BROWSER_PROFILE_DIR, "cookies-backup.json");

/** 默认 User-Agent — 模拟真实 Chrome */
export const DEFAULT_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/** 默认页面加载超时(ms) */
export const DEFAULT_TIMEOUT = 30000;

/** 返回内容最大字符数 */
export const CHARACTER_LIMIT = 50000;

/** 反爬随机延迟范围(ms) */
export const ANTI_BOT_DELAY_MIN = 300;
export const ANTI_BOT_DELAY_MAX = 1200;

/** 域名级请求最小间隔(ms) */
export const DOMAIN_COOLDOWN = 3000;

/** 浏览器空闲自动关闭时间(ms) */
export const BROWSER_IDLE_TIMEOUT = 20 * 60 * 1000; // 20 分钟

/** MCP 进程空闲自动退出时间(ms) */
export const PROCESS_IDLE_TIMEOUT = 60 * 60 * 1000; // 60 分钟

// ========== 真实浏览器 Headers ==========

export const BROWSER_HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    DNT: "1",
    "Upgrade-Insecure-Requests": "1",
};

// ========== 截图质量 ==========

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

/** 已知 SPA 懒加载站点 */
export const SPA_DOMAINS = [
    "bilibili.com", "miyoushe.com", "xiaohongshu.com",
    "douyin.com", "weibo.com", "zhihu.com",
    "taobao.com", "jd.com",
];

/** SPA 空壳检测关键词 */
export const SPA_SKELETON_KEYWORDS = [
    "Loading", "loading", "加载中", "正在加载",
    "页面跳转", "即将跳转", "请稍候",
    "skeleton", "placeholder",
];

/** 空壳内容字数阈值 */
export const SPA_SKELETON_THRESHOLD = 200;

// ========== 中文页脚垃圾关键词 ==========

export const FOOTER_GARBAGE = [
    "ICP备", "ICP证", "营业执照", "网安备", "公安备",
    "违法不良信息举报", "网络文化经营许可",
    "增值电信业务经营许可", "广播电视节目制作经营许可",
];
