import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApiConfig } from '../context/ApiConfigContext';
import { useAuth } from '../context/AuthContext';
import CountUp from './CountUp';
import UsageHistoryModal from './UsageHistoryModal';
import '../ui-details.css';

const generators = [
    { path: '/ecommerce', label: '🛒 电商主图生成器', icon: '🛒', title: '电商主图生成器' },
    { path: '/poster', label: '🎨 营销海报生成器', icon: '🎨', title: '营销海报生成器' },
    { path: '/slice', label: '📦 营销切片生成器', icon: '📦', title: '营销切片生成器' },
];

const ROLE_LABEL: Record<string, string> = {
    super_admin: '最高级管理员',
    admin: '管理员',
    user: '用户',
    guest: '游客',
};

const ROLE_COLOR: Record<string, string> = {
    super_admin: '#ad1457',
    admin: '#4f6ef7',
    user: '#2e7d32',
    guest: '#6b7280',
};

export default function Header() {
    const navigate = useNavigate();
    const location = useLocation();
    const current = generators.find((g) => g.path === location.pathname);
    const { status, setOpen } = useApiConfig();
    const { user, logout } = useAuth();
    const [showUsageHistory, setShowUsageHistory] = useState(false);

    // 页面转场：生成器页面派发退场事件（由页面播放模块退场动画后跳转目标），其余页面直接跳转
    const handleTransition = (to: string) => {
        if (generators.some((g) => g.path === location.pathname)) {
            window.dispatchEvent(new CustomEvent('page-transition', { detail: { to } }));
        } else {
            navigate(to);
        }
    };

    // 左上角按钮：生成器页 → 返回选择界面；图片库 / 用户管理等 → 返回之前所在的生成器
    const isGenerator = generators.some((g) => g.path === location.pathname);
    const handleBack = () => {
        if (isGenerator) {
            window.dispatchEvent(new CustomEvent('page-transition', { detail: { to: '/' } }));
        } else {
            const last = sessionStorage.getItem('last-generator');
            navigate(last && generators.some((g) => g.path === last) ? last : '/');
        }
    };

    return (
        <div
            className="ui-header"
            style={{
                padding: '14px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {/* 返回选择界面 / 返回生成器 */}
                <button
                    onClick={handleBack}
                    className="ui-nav-btn"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: '1.5px solid #e0e3eb',
                        background: '#fff',
                        color: '#4f6ef7',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {isGenerator ? '← 返回选择界面' : '← 返回生成器'}
                </button>
                {current && (
                    <h1 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                            style={{
                                width: 32,
                                height: 32,
                                background: '#4f6ef7',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: 16,
                            }}
                        >
                            {current.icon}
                        </span>
                        {current.title}
                    </h1>
                )}
                {/* 图片库入口 */}
                <button
                    onClick={() => handleTransition('/library')}
                    className="ui-nav-btn ui-btn-shimmer"
                    style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1.5px solid',
                        borderColor: location.pathname === '/library' ? '#4f6ef7' : '#e0e3eb',
                        background: location.pathname === '/library' ? '#eef1ff' : '#fff',
                        color: location.pathname === '/library' ? '#4f6ef7' : '#636e72',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    🗂️ 图片库
                </button>
                {/* 用户管理入口（超管/管理员） */}
                {(user?.role === 'super_admin' || user?.role === 'admin') && (
                    <button
                        onClick={() => handleTransition('/admin/users')}
                        className="ui-nav-btn ui-btn-shimmer"
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: '1.5px solid',
                            borderColor: location.pathname === '/admin/users' ? '#4f6ef7' : '#e0e3eb',
                            background: location.pathname === '/admin/users' ? '#eef1ff' : '#fff',
                            color: location.pathname === '/admin/users' ? '#4f6ef7' : '#636e72',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        👥 用户管理
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* 累计 Token 消耗（点击查看消耗历史） */}
                {status && (
                    <span
                        onClick={status.has_api_key ? () => setShowUsageHistory(true) : undefined}
                        title={status.has_api_key ? '点击查看消耗历史（每一笔明细）' : '当前未配置 API 凭证，无法使用 AI 功能'}
                        style={{
                            fontSize: 12,
                            background: status.has_api_key ? '#eef1ff' : '#fff3e0',
                            color: status.has_api_key ? '#4f6ef7' : '#e65100',
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontWeight: 500,
                            cursor: status.has_api_key ? 'pointer' : 'default',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => { if (status.has_api_key) e.currentTarget.style.background = '#e0e6ff'; }}
                        onMouseLeave={(e) => { if (status.has_api_key) e.currentTarget.style.background = '#eef1ff'; }}
                    >
                        {status.has_api_key ? (status.provider === 'jimeng' ? '🖼️ ' : '⚡ ') : '⚠ '}
                        {status.has_api_key
                            ? status.provider === 'jimeng'
                                ? <>图片 <CountUp value={status.total_images ?? 0} /></>
                                : <>Token <CountUp value={status.total_tokens ?? 0} /></>
                            : '未配置凭证'}
                    </span>
                )}
                <button
                    onClick={() => setOpen(true)}
                    className="ui-nav-btn ui-btn-shimmer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        background: status?.has_api_key ? '#eef1ff' : '#4f6ef7',
                        color: status?.has_api_key ? '#4f6ef7' : '#fff',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s',
                    }}
                >
                    🔑 API 设置
                </button>
                {/* 用户信息 */}
                {user && (
                    <>
                        {/* 有效期临近提醒 */}
                        {user.valid_until && (() => {
                            const days = Math.ceil((new Date(user.valid_until).getTime() - Date.now()) / 86400000);
                            if (days < 0 || days > 7) return null;
                            return (
                                <span
                                    title="账号有效期"
                                    style={{
                                        fontSize: 12,
                                        padding: '4px 12px',
                                        borderRadius: 20,
                                        fontWeight: 500,
                                        background: '#fff8f0',
                                        color: '#e65100',
                                        border: '1px solid #ffe0b2',
                                        cursor: 'default',
                                    }}
                                >
                                    ⚠️ {days === 0 ? '今日到期' : `${days} 天后到期`}
                                </span>
                            );
                        })()}
                        <span
                            title={user.role === 'guest' ? '游客模式：可使用全部功能，但数据不保留，退出后自动清除使用痕迹' : `公司：${user.company_name}`}
                            style={{
                                fontSize: 12,
                                padding: '4px 12px',
                                borderRadius: 20,
                                fontWeight: 500,
                                background: '#f5f6fa',
                                color: ROLE_COLOR[user.role] || '#636e72',
                                cursor: 'default',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            👤 {user.username}
                            <span style={{
                                fontSize: 10,
                                padding: '1px 8px',
                                borderRadius: 10,
                                background: (ROLE_COLOR[user.role] || '#999') + '22',
                                color: ROLE_COLOR[user.role] || '#999',
                            }}>
                                {ROLE_LABEL[user.role]}
                            </span>
                            {user.role === 'guest' && (
                                <span style={{
                                    fontSize: 10,
                                    padding: '1px 8px',
                                    borderRadius: 10,
                                    background: '#fff3e0',
                                    color: '#e65100',
                                }}>
                                    数据不保留
                                </span>
                            )}
                        </span>
                        <button
                            onClick={() => { logout(); navigate('/login'); }}
                            className="ui-nav-btn"
                            style={{
                                fontSize: 12,
                                padding: '4px 12px',
                                borderRadius: 20,
                                border: '1px solid #e0e3eb',
                                background: '#fff',
                                color: '#636e72',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            退出
                        </button>
                    </>
                )}
            </div>
            <UsageHistoryModal open={showUsageHistory} onClose={() => setShowUsageHistory(false)} />
        </div>
    );
}
