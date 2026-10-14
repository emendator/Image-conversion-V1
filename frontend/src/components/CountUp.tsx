import { useEffect, useRef, useState } from 'react';

/**
 * CountUp — 数字滚动（从当前值平滑滚动到目标值）
 * - easeOutExpo 缓动，rAF 驱动
 * - 尊重 prefers-reduced-motion：直接显示目标值
 */
export default function CountUp({
    value,
    duration = 1.1,
    className,
    style,
}: {
    value: number;
    duration?: number;
    className?: string;
    style?: React.CSSProperties;
}) {
    const [display, setDisplay] = useState(value);
    const fromRef = useRef(value);
    const rafRef = useRef(0);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setDisplay(value);
            fromRef.current = value;
            return;
        }
        const from = fromRef.current;
        const start = performance.now();
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / (duration * 1000));
            // easeOutExpo：先快后慢的「落地」感
            const eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
            setDisplay(Math.round(from + (value - from) * eased));
            if (p < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = value;
            }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [value, duration]);

    return (
        <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
            {display.toLocaleString()}
        </span>
    );
}
