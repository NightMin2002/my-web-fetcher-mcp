import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import {
    CHARACTER_LIMIT,
    OUTPUT_MODE_LIMITS,
    FOOTER_GARBAGE,
} from "./constants.js";

// ========== Turndown 初始化 ==========

const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

// 移除无用元素
turndown.remove(["script", "style", "noscript", "iframe"]);

// 广告域名
const AD_DOMAINS = [
    "pagead2.googlesyndication.com",
    "ad.doubleclick.net",
    "analytics.google.com",
    "www.googletagmanager.com",
];

// ========== 内容提取 ==========

/**
 * 从 HTML 提取正文并转为 Markdown
 *
 * 两层策略：
 * 1. Readability 智能提取
 * 2. body 全文 fallback
 */
export function extractContent(
    html: string,
    url: string
): { title: string; content: string } {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // 预清洗 DOM
    preCleanDOM(doc);

    const docTitle = doc.title || "无标题";

    // 策略 1：Readability
    try {
        const cloneDoc = new JSDOM(doc.documentElement.outerHTML, { url });
        const reader = new Readability(cloneDoc.window.document);
        const article = reader.parse();

        if (article && article.content) {
            let md = turndown.turndown(article.content);
            md = cleanFooterGarbage(md);

            if (!isGarbageContent(md)) {
                return {
                    title: article.title || docTitle,
                    content: truncate(md),
                };
            }
        }
    } catch {
        // Readability 失败，降级
    }

    // 策略 2：body 全文
    const body = doc.querySelector("body");
    if (body) {
        let md = turndown.turndown(body.innerHTML);
        md = cleanFooterGarbage(md);
        return {
            title: docTitle,
            content: truncate(md),
        };
    }

    return { title: docTitle, content: "[提取失败] 页面无可提取内容" };
}

/**
 * 预清洗 DOM — 移除广告、追踪脚本、导航栏等噪音
 */
function preCleanDOM(doc: Document): void {
    // 移除广告 iframe
    const iframes = doc.querySelectorAll("iframe");
    iframes.forEach((el) => {
        const src = el.getAttribute("src") || "";
        if (AD_DOMAINS.some((d) => src.includes(d))) {
            el.remove();
        }
    });

    // 移除常见噪音元素
    const noiseSelectors = [
        "nav", "header", "footer",
        "[role='banner']", "[role='navigation']",
        "[class*='ad-']", "[class*='Ad-']", "[id*='ad-']",
        "[class*='sidebar']", "[class*='recommend']",
        ".cookie-banner", ".cookie-notice",
    ];

    noiseSelectors.forEach((sel) => {
        try {
            doc.querySelectorAll(sel).forEach((el) => el.remove());
        } catch {
            // 选择器无效忽略
        }
    });
}

/**
 * 检测是否为垃圾内容（提取失败的信号）
 */
function isGarbageContent(md: string): boolean {
    const text = md.replace(/\s+/g, "");

    // 过短
    if (text.length < 100) return true;

    // 链接比例过高（导航页）
    const linkCount = (md.match(/\[.*?\]\(.*?\)/g) || []).length;
    const wordCount = text.length;
    if (linkCount > 20 && linkCount / wordCount > 0.1) return true;

    return false;
}

/**
 * 清除页脚备案/许可证信息
 */
function cleanFooterGarbage(md: string): string {
    const lines = md.split("\n");
    const cleaned: string[] = [];

    for (const line of lines) {
        const hasGarbage = FOOTER_GARBAGE.some((kw) => line.includes(kw));
        if (!hasGarbage) {
            cleaned.push(line);
        }
    }

    return cleaned.join("\n");
}

/**
 * 截断到字符限制
 */
function truncate(content: string): string {
    if (content.length <= CHARACTER_LIMIT) return content;
    return content.slice(0, CHARACTER_LIMIT) + `\n\n[已截断] 内容超过 ${CHARACTER_LIMIT} 字符限制`;
}

/**
 * 根据输出模式格式化内容
 */
export function formatOutput(
    content: string,
    mode: "full" | "compact" | "summary"
): string {
    if (mode === "full") return content;

    const limit = OUTPUT_MODE_LIMITS[mode] || 8000;
    const lines = content.split("\n");
    const result: string[] = [];
    let charCount = 0;

    for (const line of lines) {
        if (charCount >= limit) break;

        // summary 模式只保留标题
        if (mode === "summary" && !line.startsWith("#")) {
            // 保留第一段正文
            if (result.length < 5) {
                result.push(line);
                charCount += line.length;
            }
            continue;
        }

        result.push(line);
        charCount += line.length;
    }

    const suffix = charCount < content.length
        ? `\n\n[${mode} 模式] 已省略 ${content.length - charCount} 字符`
        : "";

    return result.join("\n") + suffix;
}
