/**
 * 深度反检测脚本集
 *
 * 多层防御：JS 属性伪装、WebGL 指纹、Plugin 伪装、硬件信息一致性等。
 * 注意：这些是 JS 层面的防护，对于使用 TLS 指纹/二进制级检测的高安全
 * WAF（如 Cloudflare Enterprise），需要 Patchright/Camoufox 级别方案。
 */

type StealthScript = () => void;

export function getStealthScripts(): StealthScript[] {
    return [
        // 1. navigator.webdriver 伪装
        () => {
            Object.defineProperty(navigator, "webdriver", { get: () => false });
        },

        // 2. Chrome runtime 伪装
        () => {
            // @ts-ignore
            window.chrome = {
                runtime: {
                    onMessage: { addListener: () => { }, removeListener: () => { } },
                    sendMessage: () => { },
                },
                loadTimes: () => ({}),
                csi: () => ({}),
            };
        },

        // 3. Permissions API 伪装
        () => {
            const originalQuery = window.navigator.permissions?.query;
            if (originalQuery) {
                // @ts-ignore
                window.navigator.permissions.query = (parameters: any) => {
                    if (parameters.name === "notifications") {
                        return Promise.resolve({ state: Notification.permission } as PermissionStatus);
                    }
                    return originalQuery.call(window.navigator.permissions, parameters);
                };
            }
        },

        // 4. Plugin 伪装 — 模拟真实 Chrome 的 3 个默认插件
        () => {
            Object.defineProperty(navigator, "plugins", {
                get: () => {
                    const fakePlugins = [
                        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
                        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "", length: 1 },
                        { name: "Native Client", filename: "internal-nacl-plugin", description: "", length: 1 },
                    ];
                    return Object.assign(fakePlugins, { item: (i: number) => fakePlugins[i], namedItem: (name: string) => fakePlugins.find(p => p.name === name) });
                },
            });
        },

        // 5. languages 伪装
        () => {
            Object.defineProperty(navigator, "languages", {
                get: () => ["zh-CN", "zh", "en-US", "en"],
            });
        },

        // 6. 硬件信息 — 与 User-Agent (Windows/Chrome) 保持一致
        () => {
            Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
            Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
            Object.defineProperty(navigator, "platform", { get: () => "Win32" });
        },

        // 7. WebGL 渲染器伪装
        () => {
            const getParam = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (param: number) {
                if (param === 37445) return "Google Inc. (NVIDIA)";
                if (param === 37446) return "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)";
                return getParam.call(this, param);
            };
        },

        // 8. 清除自动化工具注入标记
        () => {
            // @ts-ignore
            delete window.__playwright;
            // @ts-ignore
            delete window.__pw_manual;
            // @ts-ignore
            delete window.playwright;
        },

        // 9. 屏幕信息一致性
        () => {
            Object.defineProperty(screen, "colorDepth", { get: () => 24 });
            Object.defineProperty(screen, "pixelDepth", { get: () => 24 });
        },
    ];
}
