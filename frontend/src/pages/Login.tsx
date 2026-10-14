import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { useToast } from '../components/Toast';
import { fetchCompanies, fetchInviteCodeInfo } from '../api/auth';
import type { CompanyItem } from '../types';
import './login.css';

type Tab = 'login' | 'register';

// ---- 实时校验（copywriting-8：用约束表达，而非责备用户） ----
const usernameOk = (v: string) => v.trim().length >= 2 && v.trim().length <= 20;
const passwordOk = (v: string) => v.length >= 6;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// 密码可见性切换（interactivity：意图优先于输入，猜用户想看什么）
function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={shown ? '隐藏密码' : '显示密码'}
            title={shown ? '隐藏密码' : '显示密码'}
            style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'transparent', cursor: 'pointer',
                padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9aa3b2', lineHeight: 1,
            }}
        >
            {shown ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            )}
        </button>
    );
}

// 内联字段校验提示（有输入才显示；ok 时打勾，bad 时给出约束说明）
function Hint({ show, ok, text }: { show: boolean; ok: boolean; text: string }) {
    if (!show) return null;
    return (
        <div style={{ fontSize: 11, marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, color: ok ? '#2e7d32' : '#c62828', lineHeight: 1.4 }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{ok ? '✓' : '✗'}</span>
            {text}
        </div>
    );
}

export default function Login() {
    const { login, guestLogin, register, isLogin } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation() as { state?: { from?: string } };

    const [tab, setTab] = useState<Tab>('login');
    const [submitting, setSubmitting] = useState(false);
    // 密码可见性（登录 / 注册密码 / 注册确认）
    const [showPw, setShowPw] = useState(false);
    const [showRPw, setShowRPw] = useState(false);
    const [showRConfirm, setShowRConfirm] = useState(false);
    // 登录失败时轻摇卡片（motion-16）
    const [shake, setShake] = useState(false);

    // ---- 背景流体视差：极光 / 玻璃光球 / 光柱 随鼠标缓慢反向位移 ----
    const pageRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const pointer = useRef({ x: 0.5, y: 0.5 });
    // 3D 翻转容器引用（登录/注册翻面由 is-flipped class + CSS transition 控制）
    const flipRef = useRef<HTMLDivElement>(null);
    // 多层级背景视差：极光（深层）/ 玻璃光球（中层）/ 光柱（近层）
    const auroraRef = useRef<HTMLDivElement>(null);
    const glassRef = useRef<HTMLDivElement>(null);
    const raysRef = useRef<HTMLDivElement>(null);
    const par = useRef({
        aurora: { x: 0, y: 0 },
        glass: { x: 0, y: 0 },
        rays: { x: 0, y: 0 },
    });
    // 卡片 3D 唤醒入场动画是否已结束（结束后清除动画，避免卡在 68° 倾倒帧导致布局/点击异常）
    const [cardEntered, setCardEntered] = useState(false);
    // 兜底：无论动画是否正常结束，1.6s 后强制清除（覆盖 animationend 不触发的情况）
    useEffect(() => {
        const t = setTimeout(() => setCardEntered(true), 1600);
        return () => clearTimeout(t);
    }, []);

    // 预热 3D 翻转合成层：挂载时强制一次布局，让两个卡片面的合成层在交互前就绪
    useEffect(() => {
        if (flipRef.current) void flipRef.current.offsetWidth;
    }, []);

    useEffect(() => {
        const el = pageRef.current;
        if (!el) return;
        // 尊重系统「减少动态效果」：不启用背景视差
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;

        let raf = 0;
        // 指针活动时间戳：静止后停止 rAF，空闲时不再空转消耗 CPU/GPU
        let lastMove = performance.now();
        // 鼠标移出页面后，保持循环一小段时间把视差层带回中心
        let leaveUntil = 0;
        const tick = () => {
            raf = 0;
            const nx = pointer.current.x - 0.5;
            const ny = pointer.current.y - 0.5;
            // 背景视差：三图层按深度分级反向位移（慢速惰性跟随，营造空间纵深）
            const applyPar = (
                ref: React.RefObject<HTMLDivElement | null>,
                key: 'aurora' | 'glass' | 'rays',
                depth: number,
            ) => {
                const layer = ref.current;
                if (!layer) return;
                const t = par.current[key];
                t.x += (nx * depth - t.x) * 0.08;
                t.y += (ny * depth - t.y) * 0.08;
                layer.style.transform = `translate3d(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px, 0)`;
            };
            applyPar(auroraRef, 'aurora', -26);
            applyPar(glassRef, 'glass', 16);
            applyPar(raysRef, 'rays', 10);
            // 指针静止 ≥180ms 且不在「移出归位窗口」内时停止循环
            const idleMs = performance.now() - lastMove;
            if (idleMs < 180 || performance.now() < leaveUntil) {
                raf = requestAnimationFrame(tick);
            }
        };
        const onMove = (e: MouseEvent) => {
            const r = el.getBoundingClientRect();
            pointer.current.x = (e.clientX - r.left) / r.width;
            pointer.current.y = (e.clientY - r.top) / r.height;
            lastMove = performance.now();
            if (!raf) raf = requestAnimationFrame(tick);
        };
        const onLeave = () => {
            pointer.current.x = 0.5;
            pointer.current.y = 0.5;
            lastMove = performance.now();
            leaveUntil = performance.now() + 400;
            if (!raf) raf = requestAnimationFrame(tick);
        };
        el.addEventListener('mousemove', onMove);
        el.addEventListener('mouseleave', onLeave);
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('mouseleave', onLeave);
        };
    }, []);

    // ---- 背景点击涟漪：点击空白处泛起一圈主题色光环 ----
    useEffect(() => {
        const el = pageRef.current;
        if (!el) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const onBgClick = (e: MouseEvent) => {
            if (reduced) return;
            const t = e.target as HTMLElement | null;
            if (!t) return;
            // 交互区域不触发（输入框 / 按钮 / 滑块 / 3D 卡片）
            if (t.closest('button, input, select, textarea, a, .login-pill, .login-card3d, .login-flip')) return;
            const r = el.getBoundingClientRect();
            const size = 90 + Math.random() * 70;
            const ring = document.createElement('div');
            ring.className = 'login-ripple-ring';
            ring.style.width = `${size}px`;
            ring.style.height = `${size}px`;
            ring.style.left = `${e.clientX - r.left - size / 2}px`;
            ring.style.top = `${e.clientY - r.top - size / 2}px`;
            el.appendChild(ring);
            ring.addEventListener('animationend', () => ring.remove(), { once: true });
        };
        el.addEventListener('click', onBgClick);
        return () => el.removeEventListener('click', onBgClick);
    }, []);



    // ---- 登录字段 ----
    const [lUsername, setLUsername] = useState('');
    const [lPassword, setLPassword] = useState('');

    // ---- 注册字段 ----
    const [rUsername, setRUsername] = useState('');
    const [rPassword, setRPassword] = useState('');
    const [rConfirm, setRConfirm] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rCode, setRCode] = useState('');
    const [inviteInfo, setInviteInfo] = useState<{ valid: boolean; level?: 1 | 2; message?: string } | null>(null);
    const [companyAction, setCompanyAction] = useState<'join' | 'create'>('join');
    const [companies, setCompanies] = useState<CompanyItem[]>([]);
    const [joinCompanyId, setJoinCompanyId] = useState('');
    const [createCompanyName, setCreateCompanyName] = useState('');
    const [dbPassword, setDbPassword] = useState('');

    useEffect(() => {
        // 已登录直接进入首页
        if (isLogin) navigate('/', { replace: true });
    }, [isLogin, navigate]);

    // 进入注册 Tab 时加载公司列表
    useEffect(() => {
        if (tab !== 'register') return;
        fetchCompanies().then((res) => setCompanies(res.companies)).catch(() => { });
    }, [tab]);

    // 邀请码检测（输入后自动）
    useEffect(() => {
        if (tab !== 'register' || !rCode.trim()) {
            setInviteInfo(null);
            return;
        }
        const t = setTimeout(() => {
            fetchInviteCodeInfo(rCode.trim()).then(setInviteInfo).catch(() => setInviteInfo(null));
        }, 400);
        return () => clearTimeout(t);
    }, [rCode, tab]);

    const handleLogin = async () => {
        if (!lUsername.trim() || !lPassword) {
            showToast('请输入用户名和密码', 'error');
            return;
        }
        setSubmitting(true);
        try {
            await login(lUsername.trim(), lPassword);
            showToast('登录成功');
            navigate(location.state?.from || '/', { replace: true });
        } catch (e: any) {
            setShake(true); // 登录失败：轻摇卡片提示"此路不通"（motion-16）
            showToast(e?.response?.data?.detail || '登录失败', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleGuest = async () => {
        setSubmitting(true);
        try {
            await guestLogin();
            showToast('已进入游客模式：可体验全部功能，数据不保留，退出自动清除');
            navigate('/', { replace: true });
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '游客模式进入失败', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegister = async () => {
        if (!rUsername.trim() || !rPassword || !rEmail.trim() || !rCode.trim()) {
            showToast('请填写完整注册信息', 'error');
            return;
        }
        if (rPassword.length < 6) {
            showToast('密码至少 6 位', 'error');
            return;
        }
        if (rPassword !== rConfirm) {
            showToast('两次输入的密码不一致', 'error');
            return;
        }
        if (!inviteInfo?.valid) {
            showToast(inviteInfo?.message || '邀请码无效', 'error');
            return;
        }
        const isAdmin = inviteInfo.level === 1;
        let companyName = '';
        if (isAdmin && companyAction === 'create') {
            companyName = createCompanyName.trim();
            if (!companyName) {
                showToast('请输入新公司名称', 'error');
                return;
            }
        } else {
            const comp = companies.find((c) => String(c.id) === joinCompanyId);
            if (!comp) {
                showToast('请选择要加入的公司', 'error');
                return;
            }
            companyName = comp.name;
        }
        if (!dbPassword) {
            showToast('请输入公司数据库密码', 'error');
            return;
        }
        if (dbPassword.length < 6) {
            showToast('公司数据库密码至少 6 位', 'error');
            return;
        }
        setSubmitting(true);
        try {
            await register({
                username: rUsername.trim(),
                password: rPassword,
                email: rEmail.trim(),
                invite_code: rCode.trim(),
                action: isAdmin ? companyAction : 'join',
                company_name: companyName,
                company_db_password: dbPassword,
            });
            showToast('注册成功，请登录');
            setTab('login');
            setRUsername(''); setRPassword(''); setRConfirm(''); setREmail(''); setRCode('');
            setInviteInfo(null); setDbPassword(''); setJoinCompanyId(''); setCreateCompanyName('');
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '注册失败', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '11px 14px',
        border: '1px solid #e0e3eb',
        borderRadius: 10,
        fontSize: 14,
        fontFamily: 'inherit',
        outline: 'none',
        background: '#fff',
        boxSizing: 'border-box',
    };

    // 带密码可见性切换的输入框（右侧预留图标空间）
    const inputStylePw: React.CSSProperties = { ...inputStyle, paddingRight: 40 };

    const labelStyle: React.CSSProperties = { fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' };

    return (
        <div
            ref={pageRef}
            className="login-page"
            style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, rgba(79,110,247,0.20) 0%, rgba(139,92,246,0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}
        >
            {/* 极光层：大尺度色斑缓慢漂移（深层视差 -26px，JS rAF 惰性跟随） */}
            <div ref={auroraRef} className="login-aurora">
                <div className="login-aurora-blob" style={{ left: '-10%', top: '-22%', width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(139,92,246,0.42), transparent 62%)', animationDuration: '24s' }} />
                <div className="login-aurora-blob" style={{ right: '-16%', top: '8%', width: '48vw', height: '48vw', background: 'radial-gradient(circle, rgba(79,110,247,0.38), transparent 62%)', animationDuration: '30s', animationDelay: '-10s' }} />
                <div className="login-aurora-blob" style={{ left: '18%', bottom: '-26%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(236,72,153,0.24), transparent 62%)', animationDuration: '36s', animationDelay: '-18s' }} />
            </div>
            {/* 丁达尔光柱层：柔和光束缓慢摆动（近层视差 10px） */}
            <div ref={raysRef} className="login-rays">
                <div className="login-ray" style={{ left: '12%', animationDuration: '13s' }} />
                <div className="login-ray" style={{ left: '45%', animationDuration: '17s', animationDelay: '-6s' }} />
                <div className="login-ray" style={{ left: '78%', animationDuration: '15s', animationDelay: '-11s' }} />
            </div>
            {/* 流体层：固定方向单向流动层（背景流动；鼠标跟随光团使用全局 .ui-cursor-glow，与营销海报生成器一致） */}
            <div className="login-fluid-field">
                <div className="login-flow" />
            </div>
            {/* 悬浮粒子：发光小光球漂浮，点缀活力（背景层） */}
            {[
                { l: 8, t: 14, s: 8 }, { l: 20, t: 66, s: 6 }, { l: 30, t: 24, s: 11 },
                { l: 44, t: 78, s: 7 }, { l: 55, t: 12, s: 9 }, { l: 66, t: 58, s: 6 },
                { l: 78, t: 20, s: 12 }, { l: 88, t: 70, s: 8 }, { l: 95, t: 32, s: 6 },
                { l: 14, t: 40, s: 10 }, { l: 38, t: 8, s: 7 }, { l: 72, t: 84, s: 9 },
                { l: 50, t: 40, s: 6 }, { l: 84, t: 48, s: 11 }, { l: 6, t: 82, s: 7 },
                { l: 28, t: 92, s: 6 }, { l: 60, t: 90, s: 8 }, { l: 92, t: 88, s: 6 },
            ].map((p, i) => (
                <div key={i} className="login-particle" style={{ left: `${p.l}%`, top: `${p.t}%`, width: p.s, height: p.s, animationDelay: `${(i % 5) * 0.7}s`, animationDuration: `${6 + (i % 4)}s` }} />
            ))}
            {/* 玻璃光球层：毛玻璃圆角片悬浮漂浮（中层视差 16px，覆盖在流动流体之上产生「液态玻璃」质感） */}
            <div ref={glassRef} className="login-glass-layer">
                {[
                    { l: '6%', t: '12%', s: 150, r: 30, d: '18s', de: '-3s' },
                    { l: '78%', t: '16%', s: 108, r: 22, d: '22s', de: '-8s' },
                    { l: '10%', t: '62%', s: 128, r: 26, d: '20s', de: '-12s' },
                    { l: '66%', t: '68%', s: 168, r: 34, d: '24s', de: '-5s' },
                    { l: '42%', t: '6%', s: 86, r: 18, d: '17s', de: '-10s' },
                    { l: '88%', t: '42%', s: 96, r: 20, d: '19s', de: '-14s' },
                ].map((o, i) => (
                    <div key={i} className="login-glass-float" style={{ left: o.l, top: o.t, animationDuration: o.d, animationDelay: o.de }}>
                        <div className="login-glass" style={{ width: o.s, height: o.s, borderRadius: o.r }} />
                    </div>
                ))}
            </div>
            {/* 流星：偶发划过夜空的光迹 */}
            <div className="login-star" style={{ top: '14%', left: '84%', animationDelay: '2.5s' }} />
            <div className="login-star" style={{ top: '28%', left: '92%', animationDelay: '7s', animationDuration: '11s' }} />
            <div className="login-star" style={{ top: '6%', left: '68%', animationDelay: '11s', animationDuration: '9.5s' }} />
            {/* 胶片颗粒 + 暗角：电影质感收尾（覆盖全部背景层） */}
            <div className="login-grain" />
            <div className="login-vignette" />
            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 460 }}>
                {/* 品牌区：逐字错峰入场 */}
                <div style={{ textAlign: 'center', marginBottom: 26 }}>
                    <div className="login-enter" style={{ animationDelay: '0.05s', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <div className="login-logo" style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', boxShadow: '0 8px 32px rgba(79,110,247,0.3)' }}>✨</div>
                        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 0 }}>
                        {"AI 图片生成器".split('').map((ch, i) => (
                            <span
                                key={i}
                                className="login-char ui-text-flow"
                                style={{
                                    animationDelay: `${0.12 + i * 0.055}s`,
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
                    </div>
                    <p className="login-enter" style={{ fontSize: 13, color: '#636e72', animationDelay: '0.5s' }}>登录后使用电商主图 / 营销海报 / 营销切片生成工具</p>
                </div>

                {/* 胶囊滑块（独立于 3D 填写模块之外）：登录 / 注册 切换，滑块右滑 → 卡片向右翻到背面 */}
                <div className="login-pill login-enter" role="tablist" aria-label="登录或注册" style={{ animationDelay: '0.38s' }}>
                    <div className="login-pill-thumb" style={{ transform: tab === 'login' ? 'translateX(0)' : 'translateX(100%)' }} />
                    {(['login', 'register'] as Tab[]).map((t) => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={tab === t}
                            onClick={() => setTab(t)}
                            className="login-pill-btn"
                            style={{ color: tab === t ? '#fff' : '#7a7f96', fontWeight: tab === t ? 700 : 500 }}
                        >
                            {t === 'login' ? '登 录' : '注 册'}
                        </button>
                    ))}
                </div>

                {/* 3D 翻转填写模块：正面登录 / 背面注册 */}
                <div
                    className={`login-card-enter${cardEntered ? ' login-card-done' : ''}`}
                    onAnimationEnd={(e) => {
                        if (e.animationName === 'loginCardWake') setCardEntered(true);
                    }}
                >
                    <div
                        ref={cardRef}
                        className={`login-card3d${shake ? ' login-shake' : ''}`}
                        onAnimationEnd={() => setShake(false)}
                    >
                        <div ref={flipRef} className={`login-flip${tab === 'register' ? ' is-flipped' : ''}`}>
                            {/* 正面：登录 */}
                            <div className="login-face login-face-front" style={{ background: '#fff', borderRadius: 18, border: '1px solid rgba(255,255,255,0.6)', padding: 28 }}>
                                <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                                    <div style={{ marginBottom: 16 }}>
                                        <label htmlFor="login-username" style={labelStyle}>用户名</label>
                                        <input id="login-username" className="login-input" style={inputStyle} autoComplete="username" value={lUsername} onChange={(e) => setLUsername(e.target.value)} placeholder="请输入用户名" onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }} />
                                    </div>
                                    <div style={{ marginBottom: 22 }}>
                                        <label htmlFor="login-password" style={labelStyle}>密码</label>
                                        <div style={{ position: 'relative' }}>
                                            <input id="login-password" className="login-input" style={inputStylePw} type={showPw ? 'text' : 'password'} autoComplete="current-password" value={lPassword} onChange={(e) => setLPassword(e.target.value)} placeholder="请输入密码" onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }} />
                                            {lPassword && <EyeToggle shown={showPw} onClick={() => setShowPw((s) => !s)} />}
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={submitting}
                                        style={{
                                            width: '100%',
                                            padding: '12px 0',
                                            borderRadius: 10,
                                            border: 'none',
                                            background: submitting ? '#b0bec5' : 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
                                            color: '#fff',
                                            fontSize: 15,
                                            fontWeight: 600,
                                            cursor: submitting ? 'not-allowed' : 'pointer',
                                            fontFamily: 'inherit',
                                            boxShadow: submitting ? 'none' : '0 6px 20px rgba(79,110,247,0.3)',
                                        }}
                                    >
                                        {submitting ? '登录中…' : '登 录'}
                                    </button>
                                    {/* 游客入口 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 2px' }}>
                                        <div style={{ flex: 1, height: 1, background: '#eef0f4' }} />
                                        <span style={{ fontSize: 11, color: '#aaa' }}>或</span>
                                        <div style={{ flex: 1, height: 1, background: '#eef0f4' }} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGuest}
                                        disabled={submitting}
                                        className="btn-ghost"
                                        style={{
                                            width: '100%',
                                            padding: '11px 0',
                                            borderRadius: 10,
                                            border: '1.5px solid #d5dbe8',
                                            background: '#fff',
                                            color: '#636e72',
                                            fontSize: 14,
                                            fontWeight: 500,
                                            cursor: submitting ? 'not-allowed' : 'pointer',
                                            fontFamily: 'inherit',
                                        }}
                                    >
                                        👤 以游客身份进入
                                    </button>
                                    <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
                                        游客可体验全部功能（AI 需自备 API Key），数据不保留，退出自动清除。
                                    </p>
                                </form>
                            </div>
                            {/* 背面：注册 */}
                            <div className="login-face login-face-back" style={{ background: '#fff', borderRadius: 18, border: '1px solid rgba(255,255,255,0.6)', padding: 28 }}>
                                <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
                                    {/* 用户名 */}
                                    <div style={{ marginBottom: 14 }}>
                                        <label htmlFor="reg-username" style={labelStyle}>用户名</label>
                                        <input id="reg-username" className="login-input" style={inputStyle} autoComplete="username" value={rUsername} onChange={(e) => setRUsername(e.target.value)} placeholder="2-20 位字符" />
                                        <Hint show={rUsername.trim().length > 0} ok={usernameOk(rUsername)} text="用户名需为 2-20 位字符" />
                                    </div>
                                    {/* 密码 */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                        <div>
                                            <label htmlFor="reg-password" style={labelStyle}>密码</label>
                                            <div style={{ position: 'relative' }}>
                                                <input id="reg-password" className="login-input" style={inputStylePw} type={showRPw ? 'text' : 'password'} autoComplete="new-password" value={rPassword} onChange={(e) => setRPassword(e.target.value)} placeholder="至少 6 位" />
                                                {rPassword && <EyeToggle shown={showRPw} onClick={() => setShowRPw((s) => !s)} />}
                                            </div>
                                            <Hint show={rPassword.length > 0} ok={passwordOk(rPassword)} text="密码至少 6 位" />
                                        </div>
                                        <div>
                                            <label htmlFor="reg-confirm" style={labelStyle}>确认密码</label>
                                            <div style={{ position: 'relative' }}>
                                                <input id="reg-confirm" className="login-input" style={inputStylePw} type={showRConfirm ? 'text' : 'password'} autoComplete="new-password" value={rConfirm} onChange={(e) => setRConfirm(e.target.value)} placeholder="再次输入" />
                                                {rConfirm && <EyeToggle shown={showRConfirm} onClick={() => setShowRConfirm((s) => !s)} />}
                                            </div>
                                            <Hint show={rConfirm.length > 0} ok={passwordOk(rPassword) && rConfirm === rPassword} text="两次输入的密码需一致" />
                                        </div>
                                    </div>
                                    {/* 邮箱 + 邀请码 */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                        <div>
                                            <label htmlFor="reg-email" style={labelStyle}>邮箱</label>
                                            <input id="reg-email" className="login-input" style={inputStyle} type="email" autoComplete="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="name@company.com" />
                                            <Hint show={rEmail.trim().length > 0} ok={emailOk(rEmail)} text="请输入有效的邮箱地址" />
                                        </div>
                                        <div>
                                            <label htmlFor="reg-code" style={labelStyle}>邀请码</label>
                                            <input id="reg-code" className="login-input" style={inputStyle} autoCapitalize="characters" spellCheck={false} value={rCode} onChange={(e) => setRCode(e.target.value.toUpperCase())} placeholder="请输入邀请码" />
                                        </div>
                                    </div>

                                    {/* 邀请码状态 */}
                                    {rCode.trim() && inviteInfo && (
                                        <div style={{ padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14, lineHeight: 1.6, background: inviteInfo.valid ? '#e8f5e9' : '#ffebee', color: inviteInfo.valid ? '#2e7d32' : '#c62828' }}>
                                            {inviteInfo.valid
                                                ? `✅ 邀请码有效 · 注册身份：${inviteInfo.level === 1 ? '管理员' : '用户'}`
                                                : `❌ ${inviteInfo.message}`}
                                        </div>
                                    )}

                                    {/* 公司选择（管理员） */}
                                    {inviteInfo?.valid && inviteInfo.level === 1 && (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={labelStyle}>公司归属</label>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {(['create', 'join'] as const).map((a) => (
                                                    <button
                                                        key={a}
                                                        type="button"
                                                        onClick={() => setCompanyAction(a)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '9px 0',
                                                            borderRadius: 8,
                                                            border: `1.5px solid ${companyAction === a ? '#4f6ef7' : '#e0e3eb'}`,
                                                            background: companyAction === a ? '#eef1ff' : '#fff',
                                                            color: companyAction === a ? '#4f6ef7' : '#636e72',
                                                            fontSize: 13,
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            fontFamily: 'inherit',
                                                        }}
                                                    >
                                                        {a === 'create' ? '创建新公司' : '加入公司'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 公司名称 */}
                                    {inviteInfo?.valid && (inviteInfo.level === 2 || (inviteInfo.level === 1 && companyAction === 'join')) ? (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={labelStyle}>选择加入的公司</label>
                                            <select style={inputStyle} value={joinCompanyId} onChange={(e) => setJoinCompanyId(e.target.value)}>
                                                <option value="">请选择公司</option>
                                                {companies.map((c) => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : inviteInfo?.valid && inviteInfo.level === 1 && companyAction === 'create' ? (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={labelStyle}>新公司名称（提交后不可修改）</label>
                                            <input style={inputStyle} value={createCompanyName} onChange={(e) => setCreateCompanyName(e.target.value)} placeholder="请输入公司名称" />
                                            <div style={{ fontSize: 11, color: '#e65100', marginTop: 6, lineHeight: 1.5 }}>
                                                ⚠️ 公司名称提交后将不可修改，请确认无误
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* 公司数据库密码 */}
                                    {inviteInfo?.valid && (
                                        <div style={{ marginBottom: 14 }}>
                                            <label style={labelStyle}>
                                                {inviteInfo.level === 1 && companyAction === 'create' ? '设置公司数据库密码' : '公司数据库密码'}
                                            </label>
                                            <input style={inputStyle} type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder={inviteInfo.level === 1 && companyAction === 'create' ? '为该公司的图片库设置密码' : '请输入该公司数据库密码'} />
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={submitting}
                                        style={{
                                            width: '100%',
                                            padding: '12px 0',
                                            borderRadius: 10,
                                            border: 'none',
                                            background: submitting ? '#b0bec5' : 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
                                            color: '#fff',
                                            fontSize: 15,
                                            fontWeight: 600,
                                            cursor: submitting ? 'not-allowed' : 'pointer',
                                            fontFamily: 'inherit',
                                            boxShadow: submitting ? 'none' : '0 6px 20px rgba(79,110,247,0.3)',
                                        }}
                                    >
                                        {submitting ? '注册中…' : '注 册'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="login-enter" style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 18, animationDelay: '0.85s' }}>
                    <span className="ui-footer-egg">
                        <span className="ui-footer-egg-main">AI Powered · AI 图片生成器</span>
                        <span className="ui-footer-egg-reveal">✨ 99% 功能 + 100% 细节</span>
                    </span>
                </p>
            </div>
        </div>
    );
}
