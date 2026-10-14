import { useEffect, useRef, useState } from 'react';
import { useApiConfig } from '../context/ApiConfigContext';
import { testApiConfig } from '../api/api';
import { useToast } from './Toast';
import CountUp from './CountUp';
import '../ui-details.css';

const PROVIDERS = [
    {
        id: 'dashscope',
        name: '阿里云百炼(DashScope)',
        model: '默认：wan2.7-image',
        desc: '',
    },
    {
        id: 'jimeng',
        name: '即梦AI(seedance)',
        model: '默认：即梦4.6',
        desc: '',
    },
];

// 各供应商生图模型的计费参考（按生成图片张数计费；价格以官方计费文档为准）
const MODEL_PRICES: Record<string, { label: string; price: string }> = {
    'wan2.7-image': { label: '阿里云百炼 · wan2.7-image', price: '0.20 元/张' },
    'wan2.7-image-pro': { label: '阿里云百炼 · wan2.7-image-pro', price: '0.50 元/张' },
    'jimeng_seedream46_cvtob': { label: '即梦 · 图片生成4.6', price: '0.22 元/张（按量）' },
};

export default function ApiSettingsModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { status, saveKey, refresh } = useApiConfig();
    const { showToast } = useToast();

    const [provider, setProvider] = useState(status?.provider || 'dashscope');
    const [apiKey, setApiKey] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [model, setModel] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const modalRef = useRef<HTMLDivElement | null>(null);

    // 弹窗内容较长：固定高度 + 滚动条，并监听鼠标滚轮在弹窗内滚动（避免内容超出屏幕无法查看）
    useEffect(() => {
        if (!open) return;
        const el = modalRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const delta = e.deltaY;
            const canScrollDown = delta > 0 && scrollTop + clientHeight < scrollHeight - 1;
            const canScrollUp = delta < 0 && scrollTop > 0;
            if (canScrollDown || canScrollUp) {
                e.preventDefault();
                el.scrollTop += delta;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [open]);

    if (!open) return null;

    const isJimeng = provider === 'jimeng';
    const totalTokens = status?.total_tokens ?? 0;
    const totalImages = status?.total_images ?? 0;
    const calls = status?.calls ?? 0;
    const currentKeyMask = status?.key_masked || status?.api_key_masked || '';

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await testApiConfig();
            if (res?.success) {
                showToast('✅ 即梦连接正常：' + (res.detail || '鉴权成功'), 'success');
            } else {
                showToast('❌ 即梦连接失败：' + (res.detail || '未知错误'), 'error');
            }
        } catch (e: any) {
            showToast('测试失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'), 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        const key = apiKey.trim();
        const ak = accessKey.trim();
        const sk = secretKey.trim();
        const bUrl = baseUrl.trim();
        const mdl = model.trim();

        // 当前目标供应商是否已经配置过凭证（允许仅保存高级选项/切换而不覆盖凭证）
        const currentHasKey = provider === status?.provider
            ? !!status?.has_api_key
            : !!status?.configured_providers?.includes(provider);
        const hasChanges =
            provider !== status?.provider || !!key || !!ak || !!sk || !!bUrl || !!mdl;
        if (!hasChanges) {
            showToast('未做任何修改', 'error');
            return;
        }

        if (isJimeng) {
            if ((ak && !sk) || (!ak && sk)) {
                showToast('即梦需同时填写 Access Key ID 和 Secret Access Key', 'error');
                return;
            }
            if (!currentHasKey && !ak && !sk) {
                showToast('请输入即梦的 Access Key ID 和 Secret Access Key', 'error');
                return;
            }
            if (ak && ak.length < 8) {
                showToast('Access Key ID 长度过短，请检查是否填写完整', 'error');
                return;
            }
            if (sk && sk.length < 8) {
                showToast('Secret Access Key 长度过短，请检查是否填写完整', 'error');
                return;
            }
        } else {
            if (key && key.length < 8) {
                showToast('API Key 长度过短，请检查是否填写完整', 'error');
                return;
            }
            if (!currentHasKey && !key) {
                showToast('请输入 API Key', 'error');
                return;
            }
        }

        setSaving(true);
        try {
            const s = await saveKey({
                provider,
                apiKey: key || undefined,
                accessKey: ak || undefined,
                secretKey: sk || undefined,
                baseUrl: bUrl || undefined,
                model: mdl || undefined,
            });
            setApiKey('');
            setAccessKey('');
            setSecretKey('');
            setBaseUrl('');
            setModel('');
            showToast(
                isJimeng
                    ? `即梦凭证已保存并加密存储（${s?.access_key_masked || s?.key_masked || '已配置'}）`
                    : key
                        ? `API Key 已保存并加密存储（${s?.api_key_masked}）`
                        : '高级配置已保存'
            );
            refresh();
        } catch (e: any) {
            const detail = e?.response?.data?.detail || e?.message || '未知错误';
            // 旧后端不认识 provider/access_key/secret_key 字段时会误报“未做任何修改”
            if (detail === '未做任何修改' && (key || ak || sk)) {
                showToast('保存失败：后端仍在运行旧版本，请先停止并重启后端服务（启动.bat / uvicorn），重启后再保存即梦凭证', 'error');
            } else {
                showToast('保存失败: ' + detail, 'error');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            onClick={onClose}
            className="ui-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 1000, /* 图层约定：全局弹窗遮罩统一 1000 */
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                ref={modalRef}
                onClick={(e) => e.stopPropagation()}
                className="ui-modal"
                style={{
                    background: '#fff',
                    borderRadius: 14,
                    boxShadow: '0 2px 8px rgba(15,23,42,0.10), 0 24px 80px rgba(15,23,42,0.22)',
                    width: '100%',
                    maxWidth: 546, // 520px 基础上扩宽 5%
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    padding: 24,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
                }}
            >
                {/* 头部 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>🔑</span>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#2d3436', flex: 1 }}>API 设置</h2>
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
                <p style={{ fontSize: 12, color: '#636e72', marginBottom: 16 }}>
                    生图模型一键切换，切换后所有 AI 生成功能（电商主图颜色修改、营销海报生成/修改）自动使用新供应商。
                </p>

                {/* 旧后端检测 */}
                {status && status.api_version !== 2 && (
                    <div style={{ background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#e65100', marginBottom: 12, lineHeight: 1.6 }}>
                        ⚠️ 检测到后端版本过旧：当前前端已支持即梦 AK/SK，但后端仍是旧代码（无法保存即梦凭证）。
                        请先<b>停止并重启后端服务</b>（关闭窗口后重新运行 启动.bat，或重启 uvicorn），再回来保存。
                    </div>
                )}

                {/* 供应商选择 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {PROVIDERS.map((p) => {
                        const active = provider === p.id;
                        const configured = status?.configured_providers?.includes(p.id);
                        return (
                            <div
                                key={p.id}
                                onClick={() => setProvider(p.id)}
                                style={{
                                    border: active ? '1.5px solid #4f6ef7' : '1px solid #e0e3eb',
                                    background: active ? '#eef1ff' : '#fff',
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span
                                        style={{
                                            width: 14,
                                            height: 14,
                                            borderRadius: '50%',
                                            border: active ? '4px solid #4f6ef7' : '1.5px solid #c4c9d6',
                                            boxSizing: 'border-box',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <b style={{ fontSize: 12.5, color: active ? '#2d3a8c' : '#2d3436' }}>
                                        {p.name}
                                    </b>
                                    {configured && (
                                        <span style={{ fontSize: 10, color: '#2e7d32', background: '#e8f5e9', borderRadius: 8, padding: '1px 6px', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                            已配置
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.5 }}>
                                    {p.desc && <>{p.desc}<br /></>}
                                    <span style={{ fontFamily: 'monospace', color: '#666' }}>{p.model}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 当前状态 / 用量 */}
                <div
                    style={{
                        background: '#f8f9ff',
                        border: '1px solid #e8eaff',
                        borderRadius: 10,
                        padding: '12px 14px',
                        marginBottom: 16,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#636e72', marginBottom: 8 }}>
                        <span>当前凭证（{PROVIDERS.find((p) => p.id === status?.provider)?.name || status?.provider_name || '未知'}）</span>
                        <span
                            style={{
                                padding: '2px 10px',
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 600,
                                background: status?.has_api_key ? '#e8f5e9' : '#fff3e0',
                                color: status?.has_api_key ? '#2e7d32' : '#e65100',
                            }}
                        >
                            {status?.has_api_key ? '已配置' : '未配置'}
                        </span>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#2d3436', marginBottom: 8 }}>
                        {currentKeyMask || '—（尚未配置，请选择供应商并填写下方凭证）'}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12,
                            color: '#636e72',
                            borderTop: '1px dashed #e0e3eb',
                            paddingTop: 10,
                            marginBottom: 8,
                        }}
                    >
                        <span style={{ fontWeight: 600, color: '#4f6ef7' }}>🧠 当前使用模型</span>
                        <span title={status?.model || '默认模型'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <b style={{ color: '#2d3436', fontFamily: 'monospace', fontSize: 12 }}>
                                {status?.model_name || status?.model || '默认模型'}
                            </b>
                            <b style={{ color: '#e67e22', fontSize: 11 }}>
                                {MODEL_PRICES[status?.model || '']?.price ?? '价格以供应商为准'}
                            </b>
                        </span>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12,
                            color: '#636e72',
                            borderTop: '1px dashed #e0e3eb',
                            paddingTop: 10,
                        }}
                    >
                        <span style={{ fontWeight: 600, color: '#4f6ef7' }}>📊 当前供应商累计消耗</span>
                        <span style={{ display: 'flex', gap: 10 }}>
                            <span title="累计消耗 Token 总量">Token <b style={{ color: '#4f6ef7' }}><CountUp value={totalTokens} /></b></span>
                            <span title="累计生成图片张数">图片 <b style={{ color: '#4f6ef7' }}><CountUp value={totalImages} /></b></span>
                            <span title="累计调用次数">调用 <b style={{ color: '#4f6ef7' }}><CountUp value={calls} /></b></span>
                        </span>
                    </div>
                    {/* 各供应商独立消耗一览 */}
                    {(() => {
                        const byProvider = status?.usage_by_provider ?? {};
                        const entries = Object.entries(byProvider);
                        if (entries.length === 0) return null;
                        const names: Record<string, string> = { dashscope: '阿里云百炼', jimeng: '即梦' };
                        return (
                            <div
                                style={{
                                    fontSize: 11,
                                    color: '#999',
                                    borderTop: '1px dashed #e0e3eb',
                                    marginTop: 8,
                                    paddingTop: 8,
                                    lineHeight: 1.8,
                                }}
                            >
                                {entries.map(([p, u]) => (
                                    <div key={p} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <span>🔹 {names[p] || p}</span>
                                        <span>
                                            {u.total_images > 0 ? <b style={{ color: '#8b5cf6' }}>{u.total_images} 张</b> : null}
                                            {u.total_images > 0 && u.total_tokens > 0 ? ' · ' : ''}
                                            {u.total_tokens > 0 ? <b style={{ color: '#4f6ef7' }}>{u.total_tokens.toLocaleString()} Tokens</b> : null}
                                            {' · '}
                                            <b style={{ color: '#e67e22' }}>{u.calls} 次</b>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {!status?.has_api_key && (
                    <div style={{ background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#e65100', marginBottom: 16, lineHeight: 1.6 }}>
                        ⚠️ 当前尚未配置凭证。<b>AI 功能</b>（电商主图 AI 颜色修改、营销海报 AI 生成底图）暂不可用；
                        点击右上角 ✕ 或「暂不配置」即可跳过，<b>图片库、营销切片、电商/海报合成等非 AI 功能不受影响</b>。
                    </div>
                )}

                {/* 凭证输入：按供应商切换 */}
                {isJimeng ? (
                    <>
                        <label style={{ fontSize: 12, color: '#636e72', display: 'block', marginBottom: 6 }}>
                            Access Key ID（火山引擎访问密钥，输入后自动加密保存）
                        </label>
                        <input
                            type="password"
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value)}
                            placeholder={status?.provider === 'jimeng' ? (status?.access_key_masked || 'AK...') : '例如 AKLT...'}
                            autoComplete="off"
                            className="ui-input"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e0e3eb',
                                borderRadius: 8,
                                fontSize: 13,
                                fontFamily: 'inherit',
                                outline: 'none',
                                boxSizing: 'border-box',
                                marginBottom: 12,
                            }}
                        />
                        <label style={{ fontSize: 12, color: '#636e72', display: 'block', marginBottom: 6 }}>
                            Secret Access Key（输入后自动加密保存）
                        </label>
                        <input
                            type="password"
                            value={secretKey}
                            onChange={(e) => setSecretKey(e.target.value)}
                            placeholder={status?.provider === 'jimeng' ? (status?.secret_key_masked || 'SK...') : '请输入 Secret Access Key'}
                            autoComplete="off"
                            className="ui-input"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e0e3eb',
                                borderRadius: 8,
                                fontSize: 13,
                                fontFamily: 'inherit',
                                outline: 'none',
                                boxSizing: 'border-box',
                                marginBottom: 12,
                            }}
                        />
                        <label style={{ fontSize: 12, color: '#636e72', display: 'block', marginBottom: 6 }}>
                            模型 / req_key（可选，默认即梦图片4.6 jimeng_seedream46_cvtob）
                        </label>
                        <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder={status?.provider === 'jimeng' ? (status?.model || 'jimeng_seedream46_cvtob') : '例如 jimeng_seedream46_cvtob'}
                            autoComplete="off"
                            className="ui-input"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e0e3eb',
                                borderRadius: 8,
                                fontSize: 13,
                                fontFamily: 'inherit',
                                outline: 'none',
                                boxSizing: 'border-box',
                                marginBottom: 8,
                            }}
                        />
                        <div style={{ background: '#f0f7ff', border: '1px solid #d5e8ff', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#3a6ea5', lineHeight: 1.7, marginBottom: 12 }}>
                            📘 即梦接入说明：在火山引擎控制台<a href="https://console.volcengine.com/iam/keymanage/" target="_blank" rel="noreferrer" style={{ color: '#4f6ef7' }}>「访问控制 → API 访问密钥」</a>获取 Access Key ID 与 Secret Access Key；模型默认即梦4.6，可自行填写任意即梦生图服务标识（req_key）切换。
                        </div>
                        <button
                            onClick={handleTest}
                            disabled={testing || saving}
                            style={{
                                width: '100%',
                                padding: '9px 0',
                                borderRadius: 8,
                                border: '1px solid #4f6ef7',
                                background: '#eef1ff',
                                color: '#4f6ef7',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: testing || saving ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                marginBottom: 16,
                            }}
                        >
                            {testing ? '⏳ 正在测试连接...' : '🔌 测试即梦连接（不创建任务、不计费）'}
                        </button>
                    </>
                ) : (
                    <>
                        <label style={{ fontSize: 12, color: '#636e72', display: 'block', marginBottom: 6 }}>
                            新的 API Key（输入后自动加密保存，仅前端显示掩码）
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={status?.api_key_masked || 'sk-...'}
                            autoComplete="off"
                            className="ui-input"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e0e3eb',
                                borderRadius: 8,
                                fontSize: 13,
                                fontFamily: 'inherit',
                                outline: 'none',
                                boxSizing: 'border-box',
                                marginBottom: 12,
                            }}
                        />
                        <div style={{ background: '#f0f7ff', border: '1px solid #d5e8ff', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#3a6ea5', lineHeight: 1.7, marginBottom: 12 }}>
                            📘 阿里云百炼接入说明：在<a href="https://bailian.console.aliyun.com/" target="_blank" rel="noreferrer" style={{ color: '#4f6ef7' }}>百炼控制台 → API Key 管理</a>创建 API Key；模型默认 wan2.7-image，可在下方高级选项中自由填写其他百炼生图模型标识进行切换。
                        </div>
                    </>
                )}

                {/* 高级选项（仅 DashScope 需要） */}
                {!isJimeng && (
                    <div style={{ marginBottom: 16 }}>
                        <span
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{ fontSize: 12, color: '#4f6ef7', cursor: 'pointer', userSelect: 'none' }}
                        >
                            {showAdvanced ? '▾ 收起高级选项' : '▸ 高级选项（Base URL / 模型）'}
                        </span>
                        <div className={`ui-acc${showAdvanced ? ' ui-acc-open' : ''}`}>
                            <div className="ui-acc-inner" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Base URL（可选）</label>
                                    <input
                                        type="text"
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder={status?.base_url || ''}
                                        className="ui-input"
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #e0e3eb',
                                            borderRadius: 8,
                                            fontSize: 12,
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>模型（可选）</label>
                                    <input
                                        type="text"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                        placeholder={status?.model || ''}
                                        className="ui-input"
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #e0e3eb',
                                            borderRadius: 8,
                                            fontSize: 12,
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 操作 */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={onClose}
                        className="ui-btn-ghost"
                        style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: 8,
                            border: '1px solid #e0e3eb',
                            background: '#fff',
                            color: '#636e72',
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {status?.has_api_key ? '取消' : '暂不配置'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="ui-btn-primary ui-btn-shimmer"
                        style={{
                            flex: 2,
                            padding: '10px 0',
                            borderRadius: 10,
                            border: 'none',
                            background: saving ? '#b0bec5' : '#4f6ef7',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {saving ? '保存中...' : isJimeng ? '💾 保存即梦凭证并切换' : '💾 保存 API Key'}
                    </button>
                </div>

                <p style={{ fontSize: 11, color: '#aaa', marginTop: 14, lineHeight: 1.6 }}>
                    🔒 您的凭证已加密安全保存，仅用于 AI 调用；任何界面均只显示掩码，不会明文展示或写入浏览器缓存。
                    切换供应商不会影响现有功能与非 AI 的图片处理。
                </p>
            </div>
        </div>
    );
}
