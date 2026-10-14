import type { UsageInfo } from '../types';
import CountUp from './CountUp';

/**
 * 本次生图消耗展示
 * - 优先按生成的图片张数展示（万相/即梦均按张计费）
 * - tokens 仅作接口参考信息，以次要样式展示
 * - 未调用大模型（后端返回空 usage 对象）时不展示
 */
export default function TokenUsage({ usage, accent = '#4f6ef7' }: { usage?: UsageInfo | null; accent?: string }) {
    if (!usage) return null;
    const tokens = usage.total_tokens ?? 0;
    const images = usage.image_count ?? 0;
    const hasTokens = tokens > 0;
    // 未调用大模型 / 无任何消耗（后端返回空对象）时不展示任何消耗标签
    if (!hasTokens && images <= 0) return null;

    return (
        <span
            title={JSON.stringify(usage)}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 12,
                background: 'rgba(79,110,247,0.08)',
                border: `1px solid ${accent}33`,
                color: accent,
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: 'nowrap',
            }}
        >
            🖼️ 本次消耗
            {images > 0 && <b><CountUp value={images} duration={0.9} /> 张</b>}
            {hasTokens && images > 0 && <span style={{ opacity: 0.65, fontWeight: 400 }}>（{tokens.toLocaleString()} Tokens）</span>}
            {!hasTokens && images <= 0 && <b>{tokens.toLocaleString()} Tokens</b>}
        </span>
    );
}
