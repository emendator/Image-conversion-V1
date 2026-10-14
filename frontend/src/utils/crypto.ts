/**
 * 前端轻量传输混淆工具
 * 使用后端下发的一次性 nonce 对 API Key 做 XOR 混淆后以 base64 提交，
 * 避免 API Key 以明文形式出现在网络请求体 / 浏览器开发者工具中。
 * 注意：这属于“防明文”混淆层（与后端 transit_decrypt 对称），
 * 真正的密钥安全由后端 Fernet 加密落盘保证。
 */

export function transitEncrypt(plain: string, nonce: string): string {
    if (!plain) return '';
    const nonceBytes = new TextEncoder().encode(nonce);
    const bytes = new TextEncoder().encode(plain);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ nonceBytes[i % nonceBytes.length];
    }
    let bin = '';
    for (let i = 0; i < out.length; i++) {
        bin += String.fromCharCode(out[i]);
    }
    return btoa(bin);
}
