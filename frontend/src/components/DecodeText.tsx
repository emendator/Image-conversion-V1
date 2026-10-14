import { useEffect, useState } from 'react';

/**
 * DecodeText — 乱码解码文本（Randomized / Glitch Text）
 * 文字从随机字符逐渐「解码」为清晰内容，模拟 AI 生成 / 数据解析过程。
 * - 尊重 prefers-reduced-motion：直接显示完整文本
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+=<>アカサタナハマヤラワ';

export default function DecodeText({
    text,
    className,
    style,
}: {
    text: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const [out, setOut] = useState(text);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setOut(text);
            return;
        }
        let raf = 0;
        const start = performance.now();
        const duration = 900 + text.length * 26;
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            // 已解出的字符数（先快后慢）
            const reveal = Math.floor((1 - Math.pow(1 - p, 2)) * text.length);
            let s = '';
            for (let i = 0; i < text.length; i++) {
                if (i < reveal || Math.random() < 0.42) {
                    s += text[i];
                } else {
                    s += CHARS[(Math.random() * CHARS.length) | 0];
                }
            }
            setOut(s);
            if (p < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                setOut(text);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text]);

    return (
        <span className={className} style={style}>
            {out}
        </span>
    );
}
