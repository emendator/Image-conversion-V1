/**
 * 复制文本到剪贴板。
 *
 * 优先使用异步 Clipboard API（navigator.clipboard），它需要 HTTPS 或 localhost 等安全上下文；
 * 失败时回退到兼容旧浏览器的 document.execCommand('copy')。
 * 全部失败时返回 false，由调用方引导用户手动选择复制。
 */
export async function copyText(text: string): Promise<boolean> {
    // 1. 现代异步剪贴板 API（安全上下文可用）
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // 权限被拒 / 被其他策略拦截，回退到下方兼容方案
        }
    }

    // 2. 兼容方案：隐藏 textarea + execCommand('copy')
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/**
 * 选中某个元素内的文本，方便用户手动 Ctrl+C / ⌘C 复制。
 * 剪贴板 API 全部失败时作为兜底提示。
 */
export function selectElementText(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
}
