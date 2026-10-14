import { useNavigate } from 'react-router-dom';

/**
 * NotFound — 趣味 404 页（detail.design #32 Interactive 404 Page / #65 Interactive Error Page）
 * 把「死路」变成一次小小的惊喜：漂浮的图形、有温度的文案、可回退的操作。
 */
export default function NotFound() {
    const navigate = useNavigate();

    return (
        <div
            className="ui-page ui-page-purple ui-aurora"
            style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}
        >
            <div className="ui-orb" style={{ left: '10%', top: '15%', width: 300, height: 300, zIndex: 0, background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 65%)', animationDuration: '24s' }} />
            <div className="ui-orb" style={{ right: '12%', bottom: '12%', width: 340, height: 340, zIndex: 0, background: 'radial-gradient(circle, rgba(79,110,247,0.35), transparent 65%)', animationDuration: '30s', animationDelay: '-10s' }} />

            <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, padding: '40px 24px' }}>
                <div
                    className="ui-float"
                    style={{
                        width: 84,
                        height: 84,
                        margin: '0 auto 22px',
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
                        boxShadow: '0 8px 32px rgba(79,110,247,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 42,
                        cursor: 'pointer',
                        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(14deg) scale(1.12)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
                    title="迷路的图形"
                >
                    🛸
                </div>
                <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: 2, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    404
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#2d3436', marginTop: 14 }}>
                    这里空空如也，像被 AI 裁掉的画布边缘
                </p>
                <p style={{ fontSize: 13, color: '#636e72', marginTop: 8, lineHeight: 1.8 }}>
                    你访问的页面不存在，或已被移动。
                    <br />
                    不过别担心，好用的工具都还在。
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26 }}>
                    <button
                        onClick={() => navigate('/')}
                        className="ui-btn-primary ui-btn-shimmer ui-ripple"
                        style={{
                            padding: '10px 28px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: '#fff',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        ✨ 回到首页
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="ui-btn-ghost"
                        style={{
                            padding: '10px 24px', borderRadius: 10, border: '1.5px solid #d5dbe8',
                            background: '#fff', color: '#636e72', fontSize: 14, fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        ← 返回上一页
                    </button>
                </div>
                <p style={{ fontSize: 11, color: '#aaa', marginTop: 28, lineHeight: 1.8 }}>
                    Error 404 · 也可能是页面打了个盹
                </p>
            </div>
        </div>
    );
}
