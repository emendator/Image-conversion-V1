/* ============================================================
   ui-meta.ts — 页面元信息动态化（detail.design #77/#78/#101/#106）
   - 动态 Favicon：按路由切换页面图标（emoji SVG），生成中显示旋转加载环
   - 动态主题色：<meta name="theme-color"> 随页面主色变化（沉浸式）
   ============================================================ */

const THEMES: Record<string, { emoji: string; color: string }> = {
    '/': { emoji: '✨', color: '#8b5cf6' },
    '/login': { emoji: '✨', color: '#8b5cf6' },
    '/ecommerce': { emoji: '🛒', color: '#4f6ef7' },
    '/poster': { emoji: '🎨', color: '#8b5cf6' },
    '/slice': { emoji: '📦', color: '#f97316' },
    '/library': { emoji: '🗂️', color: '#4f6ef7' },
    '/admin/users': { emoji: '👥', color: '#4f6ef7' },
};

let faviconEl: HTMLLinkElement | null = null;
let themeEl: HTMLMetaElement | null = null;

function ensureEls() {
    if (!faviconEl) {
        faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!faviconEl) {
            faviconEl = document.createElement('link');
            faviconEl.rel = 'icon';
            document.head.appendChild(faviconEl);
        }
    }
    if (!themeEl) {
        themeEl = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (!themeEl) {
            themeEl = document.createElement('meta');
            themeEl.name = 'theme-color';
            document.head.appendChild(themeEl);
        }
    }
}

function emojiFavicon(emoji: string) {
    ensureEls();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
    faviconEl!.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 按路径应用页面图标 + 主题色 */
export function applyPageTheme(pathname: string) {
    const theme = THEMES[pathname] || THEMES['/'];
    ensureEls();
    emojiFavicon(theme.emoji);
    themeEl!.content = theme.color;
}

/** 生成中：Favicon 变为旋转加载环（跨浏览器可见的状态传达） */
export function setLoadingFavicon(loading: boolean, color = '#4f6ef7') {
    ensureEls();
    if (!loading) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<circle cx="50" cy="50" r="36" fill="none" stroke="${color}22" stroke-width="10"/>` +
        `<circle cx="50" cy="50" r="36" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="62 170">` +
        `<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="0.9s" repeatCount="indefinite"/>` +
        `</circle></svg>`;
    faviconEl!.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
