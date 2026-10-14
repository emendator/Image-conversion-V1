import { useEffect, useState } from 'react';

/**
 * ReadingProgress — 阅读进度指示器
 * 页面滚动时顶部细进度条填充（scaleX 驱动，无回流）
 */
export default function ReadingProgress() {
    const [pct, setPct] = useState(0);
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setEnabled(false);
            return;
        }
        let raf = 0;
        const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const doc = document.documentElement;
                const h = doc.scrollHeight - window.innerHeight;
                setPct(h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0);
            });
        };
        measure();
        window.addEventListener('scroll', measure, { passive: true });
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('scroll', measure);
            window.removeEventListener('resize', measure);
            cancelAnimationFrame(raf);
        };
    }, []);

    if (!enabled) return null;
    return <div className="ui-reading-progress" style={{ transform: `scaleX(${pct / 100})` }} />;
}
