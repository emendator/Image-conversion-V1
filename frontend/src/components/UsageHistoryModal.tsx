import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApiConfig } from '../context/ApiConfigContext';
import { getUsageHistory } from '../api/api';
import type { UsageHistoryItem } from '../types';
import '../ui-details.css';

/**
 * 消耗历史弹窗：展示当前账号每一笔 AI 调用的 Token 消耗明细
 * - 顶部：累计消耗概览（Token / 图片 / 调用次数）
 * - 列表：时间、来源、Token、图片数（倒序，保留最近 500 笔）
 */
export default function UsageHistoryModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { status } = useApiConfig();
    const [history, setHistory] = useState<UsageHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'dashscope' | 'jimeng'>('all');

    const loadHistory = async () => {
        setLoading(true);
        try {
            const list = await getUsageHistory(filter === 'all' ? undefined : filter);
            setHistory(list);
        } catch {
            setHistory([]);
        } finally {
            setLoading(false);
        }
    };

    // 打开或切换供应商筛选时加载历史
    useEffect(() => {
        if (open) loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, filter]);

    if (!open) return null;

    // 按筛选范围计算累计概览（全部 = 各供应商求和；单个 = 该供应商独立统计）
    const usageByProvider = status?.usage_by_provider ?? {};
    let totalTokens = 0;
    let totalImages = 0;
    let calls = 0;
    if (filter === 'all') {
        Object.values(usageByProvider).forEach((u) => {
            totalTokens += u?.total_tokens ?? 0;
            totalImages += u?.total_images ?? 0;
            calls += u?.calls ?? 0;
        });
    } else {
        const u = usageByProvider[filter];
        totalTokens = u?.total_tokens ?? 0;
        totalImages = u?.total_images ?? 0;
        calls = u?.calls ?? 0;
    }

    const isJimeng = filter === 'jimeng';
    const summary = [
        { label: isJimeng ? '累计图片' : '累计 Token', value: isJimeng ? String(totalImages) : totalTokens.toLocaleString(), icon: isJimeng ? '🖼️' : '⚡', color: '#4f6ef7' },
        { label: '生成图片', value: String(totalImages), icon: '🖼️', color: '#8b5cf6' },
        { label: '调用次数', value: String(calls), icon: '🔁', color: '#e67e22' },
    ];

    // 通过 Portal 渲染到 body 顶层：Header 位于带 transform/filter 的 .ui-page 容器内，
    // 若不脱离该层叠上下文，fixed 定位会被 transform 改变包含块、z-index 被容器内元素覆盖。
    // 图层约定：全局弹窗遮罩统一 z-index 1000（Toast 1100 最高）
    return createPortal(
        <div
            onClick={onClose}
            className="ui-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="ui-modal"
                style={{
                    background: '#fff',
                    borderRadius: 14,
                    boxShadow: '0 2px 8px rgba(15,23,42,0.10), 0 24px 80px rgba(15,23,42,0.22)',
                    width: '100%',
                    maxWidth: 540,
                    padding: 24,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
                }}
            >
                {/* 头部 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>📜</span>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#2d3436', flex: 1 }}>消耗历史</h2>
                    <span
                        onClick={onClose}
                        className="ui-close-btn"
                        style={{
                            cursor: 'pointer',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f0f2f5',
                            color: '#636e72',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                        }}
                        title="关闭"
                    >
                        ✕
                    </span>
                </div>
                <p style={{ fontSize: 12, color: '#636e72', marginBottom: 12 }}>
                    当前账号每一笔 AI 调用的消耗明细（倒序展示，保留最近 500 笔）
                </p>

                {/* 供应商筛选：消耗按供应商分开统计 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {([
                        ['all', '全部'],
                        ['jimeng', '即梦'],
                        ['dashscope', '阿里云百炼'],
                    ] as const).map(([key, label]) => (
                        <span
                            key={key}
                            onClick={() => setFilter(key)}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 14,
                                fontSize: 12,
                                cursor: 'pointer',
                                background: filter === key ? '#4f6ef7' : '#f0f2f5',
                                color: filter === key ? '#fff' : '#636e72',
                                fontWeight: filter === key ? 600 : 500,
                            }}
                        >
                            {label}
                        </span>
                    ))}
                </div>

                {/* 累计消耗概览 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {summary.map((s) => (
                        <div
                            key={s.label}
                            style={{
                                background: '#f8f9ff',
                                border: '1px solid #e8eaff',
                                borderRadius: 10,
                                padding: '10px 12px',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                {s.icon} {s.label}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* 列表标题 + 刷新 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#2d3436' }}>
                        明细记录{history.length > 0 ? `（共 ${history.length} 笔）` : ''}
                    </span>
                    <span onClick={loadHistory} style={{ fontSize: 12, color: '#4f6ef7', cursor: 'pointer' }}>🔄 刷新</span>
                </div>

                {/* 明细列表 */}
                {loading ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#999' }}>加载中…</div>
                ) : history.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#999', border: '1px dashed #e0e3eb', borderRadius: 8 }}>
                        暂无消耗记录（完成一次 AI 生成后即可在此看到每一笔明细）
                    </div>
                ) : (
                    <div
                        style={{
                            maxHeight: 320,
                            overflowY: 'auto',
                            border: '1px solid #eef0f5',
                            borderRadius: 8,
                            background: '#fff',
                        }}
                    >
                        {history.map((h, i) => {
                            const isJimengItem = h.provider === 'jimeng';
                            return (
                                <div
                                    key={h.ts + '-' + i}
                                    title={isJimengItem
                                        ? `${h.time} · ${h.provider === 'jimeng' ? '即梦' : '阿里云百炼'} · ${h.scene} · ${h.image_count ?? 0} 张图片`
                                        : `${h.time} · ${h.provider === 'jimeng' ? '即梦' : '阿里云百炼'} · ${h.scene} · ${h.total_tokens} Tokens（输入 ${h.input_tokens ?? 0} / 输出 ${h.output_tokens ?? 0}）`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '9px 12px',
                                        borderBottom: i < history.length - 1 ? '1px solid #f0f2f5' : 'none',
                                        fontSize: 12,
                                    }}
                                >
                                    <span style={{ color: '#999', whiteSpace: 'nowrap', fontSize: 11, width: 88 }}>{h.time.slice(5)}</span>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            padding: '1px 6px',
                                            borderRadius: 8,
                                            whiteSpace: 'nowrap',
                                            background: isJimengItem ? '#f3e8ff' : '#eef1ff',
                                            color: isJimengItem ? '#7c3aed' : '#4f6ef7',
                                        }}
                                    >
                                        {isJimengItem ? '即梦' : '百炼'}
                                    </span>
                                    <span style={{ flex: 1, color: '#636e72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.scene}</span>
                                    {(h.image_count ?? 0) > 0
                                        ? <span style={{ color: '#4f6ef7', fontWeight: 600, whiteSpace: 'nowrap' }}>🖼️{h.image_count}张{(h.total_tokens ?? 0) > 0 ? `（${h.total_tokens.toLocaleString()} Tokens）` : ''}</span>
                                        : <span style={{ color: '#4f6ef7', fontWeight: 600, whiteSpace: 'nowrap' }}>⚡{h.total_tokens.toLocaleString()}</span>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
