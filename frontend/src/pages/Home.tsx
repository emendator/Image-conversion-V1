import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiConfig } from '../context/ApiConfigContext';
import CountUp from '../components/CountUp';
import '../ui-details.css';

const cards = [
    {
        path: '/ecommerce',
        icon: '🛒',
        title: '电商主图生成器',
        desc: (
            <>
                将商品图与精美模板合成电商主图，
                <br />
                支持自定义文字、Logo、排版布局，
                <br />
                AI 智能美化文字样式。
            </>
        ),
    },
    {
        path: '/poster',
        icon: '🎨',
        title: '营销海报生成器',
        desc: (
            <>
                快速生成营销活动海报，
                <br />
                支持上传 Logo、二维码、品牌图，
                <br />
                AI 两轮流程生成精美海报。
            </>
        ),
    },
    {
        path: '/slice',
        icon: '📦',
        title: '营销切片生成器',
        desc: (
            <>
                多商品展示图一键生成，
                <br />
                上传多张商品图自动排版，
                <br />
                支持模板背景，适合活动展示。
            </>
        ),
    },
];

const orbs = [
    { left: '-6%', top: '8%', size: 340, color: 'rgba(139,92,246,0.5)', dur: '21s', delay: '0s' },
    { right: '-9%', top: '26%', size: 300, color: 'rgba(79,110,247,0.45)', dur: '27s', delay: '-9s' },
    { left: '26%', bottom: '-12%', size: 400, color: 'rgba(190,120,250,0.38)', dur: '32s', delay: '-16s' },
    { right: '18%', bottom: '-6%', size: 260, color: 'rgba(99,132,255,0.35)', dur: '24s', delay: '-5s' },
];

export default function Home() {
    const navigate = useNavigate();
    const { status, loading, setOpen } = useApiConfig();
    // 退场状态：点击开始使用后，模块逐步退场，完成后跳转目标页
    const [leaving, setLeaving] = useState(false);

    const handleNavigate = (path: string) => {
        if (leaving) return;
        setLeaving(true);
        // 等退场动画（最长延迟 0.4s + 动画 0.38s）基本完成后跳转
        setTimeout(() => navigate(path), 820);
    };

    return (
        <div
            className="ui-page ui-page-purple ui-aurora"
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {/* 极光悬浮光球（背景层） */}
            {orbs.map((o, i) => (
                <div
                    key={i}
                    className="ui-orb"
                    style={{
                        left: o.left,
                        right: o.right,
                        top: o.top,
                        bottom: o.bottom,
                        width: o.size,
                        height: o.size,
                        zIndex: 0,
                        background: `radial-gradient(circle, ${o.color}, transparent 65%)`,
                        animationDuration: o.dur,
                        animationDelay: o.delay,
                    }}
                />
            ))}

            <div
                style={{
                    maxWidth: 720,
                    width: '100%',
                    padding: '40px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div style={{ marginBottom: 48 }}>
                    {/* 整块错峰：Logo 弹性弹入（退场延迟 0.32s），悬停果冻回弹 */}
                    <div className={leaving ? 'ui-leave' : 'ui-bounce-in'} style={{ animationDelay: leaving ? '0.32s' : '0.05s' }}>
                        <div
                            className="ui-logo-glow ui-jelly"
                            style={{
                                width: 72,
                                height: 72,
                                background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
                                borderRadius: 20,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 36,
                                color: '#fff',
                                marginBottom: 20,
                                boxShadow: '0 8px 32px rgba(79,110,247,0.3)',
                            }}
                        >
                            ✨
                        </div>
                    </div>
                    {/* 逐字错峰：标题逐字升起 + 模糊消散 + 渐变流动（退场整体 0.24s） */}
                    <h1 className={leaving ? 'ui-leave' : undefined} style={{ fontSize: 28, fontWeight: 700, marginBottom: 10, animationDelay: leaving ? '0.24s' : undefined }}>
                        {"AI 图片生成器".split('').map((ch, i) => (
                            <span
                                key={i}
                                className={`ui-char${leaving ? '' : ' ui-text-flow'}`}
                                style={{
                                    animationDelay: `${0.18 + i * 0.06}s`,
                                    background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6, #4f6ef7)',
                                    backgroundSize: '220% 100%',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}
                            >
                                {ch === ' ' ? '\u00A0' : ch}
                            </span>
                        ))}
                    </h1>
                    {/* 整块错峰：副标题（退场 0.16s） */}
                    <p className={leaving ? 'ui-leave' : 'ui-enter'} style={{ fontSize: 15, color: '#636e72', lineHeight: 1.6, animationDelay: leaving ? '0.16s' : '0.45s' }}>
                        请选择您需要的图片生成工具，开始创作
                    </p>
                </div>

                {/* API 状态横幅（入场 0.55s / 退场 0.08s） */}
                <div
                    className={leaving ? 'ui-leave' : 'ui-enter'}
                    style={{
                        width: '100%',
                        marginBottom: 24,
                        padding: '14px 18px',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        animationDelay: leaving ? '0.08s' : '0.55s',
                        border: status?.has_api_key ? '1px solid #d5e8ff' : '1px solid #ffe0b2',
                        background: status?.has_api_key ? '#f4f9ff' : '#fff8ef',
                    }}
                >
                    <span className={loading ? '' : 'ui-float'} style={{ fontSize: 22, display: 'inline-block' }}>{loading ? '⏳' : status?.has_api_key ? '🔑' : '⚠️'}</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3436' }}>
                            {loading
                                ? '正在加载 API 配置…'
                                : !status
                                    ? 'API 配置加载失败'
                                    : `${status.provider_name} · ${status.has_api_key ? '已配置 API' : '未配置 API'}`}
                        </div>
                        <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>
                            {loading
                                ? '请稍候…'
                                : !status
                                    ? '请检查后端服务是否已启动'
                                    : status.has_api_key
                                        ? status.provider === 'jimeng'
                                            ? <>当前凭证 {status.key_masked || status.api_key_masked} · 累计生成 <CountUp value={status.total_images ?? 0} /> 张图片</>
                                            : <>当前 Key {status.key_masked || status.api_key_masked} · 累计消耗 <CountUp value={status.total_tokens ?? 0} /> Tokens</>
                                        : '配置 API 凭证后即可使用 AI 功能（电商主图颜色修改、营销海报生成）'}
                        </div>
                    </div>
                    <button
                        onClick={() => setOpen(true)}
                        disabled={loading}
                        className="ui-btn-primary ui-btn-shimmer ui-ripple"
                        style={{
                            padding: '8px 18px',
                            borderRadius: 8,
                            border: 'none',
                            background: loading ? '#b0bec5' : status?.has_api_key ? '#4f6ef7' : '#e65100',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {loading ? '加载中…' : status?.has_api_key ? '更换 / 查看' : '去配置'}
                    </button>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 20,
                        width: '100%',
                    }}
                >
                    {cards.map((card, i) => (
                        <div
                            key={card.path}
                            onClick={() => handleNavigate(card.path)}
                            className={`${leaving ? 'ui-leave' : 'ui-arc-in'} ui-tilt ui-magnetic ui-ripple ui-card-hover`}
                            style={{
                                borderRadius: 16,
                                padding: '36px 28px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                animationDelay: leaving ? `${i * 0.07}s` : `${0.65 + i * 0.08}s`,
                            }}
                            onAnimationEnd={(e) => {
                                // 入场动画结束后移除动画类，释放 transform 交给 3D 倾斜引擎
                                if (e.animationName === 'uiArcIn') e.currentTarget.classList.remove('ui-arc-in');
                            }}
                        >
                            {/* 3D 高光跟随 */}
                            <div className="ui-tilt-glare" />
                            <span
                                className="ui-shimmer"
                                style={{
                                    position: 'absolute',
                                    top: 16,
                                    right: 16,
                                    fontSize: 11,
                                    padding: '3px 10px',
                                    borderRadius: 12,
                                    fontWeight: 500,
                                    background: '#e8f5e9',
                                    color: '#2e7d32',
                                    zIndex: 2,
                                }}
                            >
                                ✨ 已就绪
                            </span>
                            <div className="ui-jelly" style={{ fontSize: 52, marginBottom: 16, position: 'relative', zIndex: 2 }}>{card.icon}</div>
                            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, color: '#2d3436', position: 'relative', zIndex: 2 }}>
                                {card.title}
                            </h2>
                            <p style={{ fontSize: 13, color: '#636e72', lineHeight: 1.7, marginBottom: 20, position: 'relative', zIndex: 2 }}>
                                {card.desc}
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigate(card.path);
                                }}
                                className="ui-btn-primary ui-btn-shimmer ui-ripple"
                                style={{
                                    padding: '10px 32px',
                                    borderRadius: 8,
                                    background: '#4f6ef7',
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    position: 'relative',
                                    zIndex: 2,
                                }}
                            >
                                开始使用 <span className="ui-go-arrow">→</span>
                            </button>
                        </div>
                    ))}
                </div>

                <div className={leaving ? 'ui-leave' : 'ui-enter'} style={{ marginTop: 48, fontSize: 12, color: '#aaa', animationDelay: leaving ? '0.4s' : '0.9s' }}>
                    <span className="ui-footer-egg">
                        <span className="ui-footer-egg-main">AI Powered · {status?.provider_name || 'AI 图片生成器'}</span>
                        <span className="ui-footer-egg-reveal">✨ 99% 功能 + 100% 细节</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
