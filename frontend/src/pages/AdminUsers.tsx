import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
    createInviteCode,
    fetchInviteCodes,
    deleteInviteCode,
    type InviteCodeItem,
} from '../api/auth';
import { http } from '../api/api';
import type { AdminUserItem, AdminUsersResponse } from '../types';
import '../ui-details.css';
import { copyText, selectElementText } from '../utils/clipboard';

const ROLE_LABEL: Record<string, string> = {
    super_admin: '最高级管理员',
    admin: '管理员',
    user: '用户',
};

function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return iso;
    }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 由"当前时间 + N 天"生成 datetime-local 默认值（本地时间，YYYY-MM-DDTHH:MM） */
function defaultValidUntil(daysFromNow: number): string {
    const d = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 将 datetime-local 值（本地时间）转换为 UTC ISO 有效期（YYYY-MM-DDTHH:MM:SSZ） */
function toUtcIso(dtLocal: string): string {
    const d = new Date(dtLocal);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 19) + 'Z';
}

export default function AdminUsers() {
    const { showToast } = useToast();
    const { user: me } = useAuth();
    const [tab, setTab] = useState<'users' | 'invites'>('users');

    // ---- 账号管理 ----
    const [users, setUsers] = useState<AdminUserItem[]>([]);

    // ---- 邀请码管理 ----
    const [invites, setInvites] = useState<InviteCodeItem[]>([]);
    const [invLevel, setInvLevel] = useState<1 | 2>(2);
    const [invValidUntil, setInvValidUntil] = useState(() => defaultValidUntil(30));

    const loadUsers = useCallback(async () => {
        try {
            const { data } = await http.get<AdminUsersResponse>('/api/admin/users');
            setUsers(data.users);
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '加载账号失败', 'error');
        }
    }, [showToast]);

    const loadInvites = useCallback(async () => {
        try {
            const res = await fetchInviteCodes();
            setInvites(res.invites);
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '加载邀请码失败', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        if (tab === 'users') loadUsers();
        else loadInvites();
    }, [tab, loadUsers, loadInvites]);

    const handleExtend = async (u: AdminUserItem) => {
        const days = window.prompt(`为账号「${u.username}」延长有效期。请输入在现有有效期基础上增加的天数（正整数）：`, '30');
        if (days === null) return;
        const n = parseInt(days, 10);
        if (!n || n <= 0) {
            showToast('请输入正整数天数', 'error');
            return;
        }
        // 延长 = 从 max(现在, 现有有效期) 起再增加 n 天，避免缩短原有有效期
        const base = u.valid_until ? Math.max(Date.now(), new Date(u.valid_until).getTime()) : Date.now();
        const newUntil = new Date(base + n * 24 * 3600 * 1000).toISOString().slice(0, 19) + 'Z';
        try {
            await http.post(`/api/admin/users/${u.id}/extend`, { valid_until: newUntil });
            showToast(`已延长至 ${newUntil}`);
            loadUsers();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '延长失败', 'error');
        }
    };

    const handleDisable = async (u: AdminUserItem) => {
        if (!window.confirm(`确定禁用账号「${u.username}」吗？禁用后将无法登录。`)) return;
        try {
            await http.post(`/api/admin/users/${u.id}/disable`);
            showToast('账号已禁用');
            loadUsers();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '禁用失败', 'error');
        }
    };

    const handleDeleteUser = async (u: AdminUserItem) => {
        const isAdmin = u.role === 'admin';
        const tip = isAdmin
            ? `确定删除管理员「${u.username}」吗？其名下通过其邀请码注册的用户账号将同步被清除！`
            : `确定删除用户「${u.username}」吗？`;
        if (!window.confirm(tip)) return;
        try {
            const { data } = await http.delete(`/api/admin/users/${u.id}`);
            showToast(data?.message || '账号已删除');
            loadUsers();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '删除失败', 'error');
        }
    };

    const handleCreateInvite = async () => {
        if (invLevel === 1 && me?.role !== 'super_admin') {
            showToast('仅最高级管理员可创建一级邀请码', 'error');
            return;
        }
        if (!invValidUntil) {
            showToast('请选择有效日期', 'error');
            return;
        }
        const validUntil = toUtcIso(invValidUntil);
        if (!validUntil || new Date(validUntil).getTime() <= Date.now()) {
            showToast('有效日期需晚于当前时间', 'error');
            return;
        }
        try {
            const res = await createInviteCode(invLevel, validUntil);
            showToast(`邀请码生成成功：${res.invite.code}（${invLevel === 1 ? '管理员' : '用户'}，有效期至 ${formatTime(validUntil)}）`);
            loadInvites();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '生成失败', 'error');
        }
    };

    const handleDeleteInvite = async (inv: InviteCodeItem) => {
        if (!window.confirm(`确定作废邀请码「${inv.code}」吗？`)) return;
        try {
            await deleteInviteCode(inv.id);
            showToast('邀请码已作废');
            loadInvites();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '作废失败', 'error');
        }
    };

    const inputStyle: React.CSSProperties = {
        padding: '8px 12px',
        border: '1px solid #e0e3eb',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        background: '#fff',
    };

    return (
        <div className="ui-page ui-page-blue ui-reveal" style={{ minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
            <Header />
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2d3436', marginBottom: 4 }}>👥 用户管理</h2>
                <p style={{ fontSize: 12, color: '#636e72', marginBottom: 18 }}>
                    管理邀请码与账号 · 账号到期后自动禁止登录，可延长有效时间或清除账号
                </p>

                {/* Tab */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {([['users', '👤 账号管理'], ['invites', '🎟️ 邀请码管理']] as const).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            className="ui-nav-btn"
                            style={{
                                padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                                border: `1.5px solid ${tab === k ? '#4f6ef7' : '#e0e3eb'}`,
                                background: tab === k ? '#eef1ff' : '#fff',
                                color: tab === k ? '#4f6ef7' : '#636e72',
                                fontSize: 13, fontWeight: tab === k ? 600 : 400, fontFamily: 'inherit',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {tab === 'users' ? (
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', overflow: 'hidden' }}>
                        {users.length === 0 ? (
                            <div style={{ padding: 60, textAlign: 'center', color: '#999', fontSize: 13, lineHeight: 2 }}>
                                暂无账号。前往「<b style={{ color: '#4f6ef7' }}>🎟️ 邀请码管理</b>」创建邀请码，邀请同事注册后即可在此管理。
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8f9ff', color: '#636e72' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>用户名</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>角色</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>公司</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>注册时间</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>最后登录</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>有效期</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>状态</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="ui-row" style={{ borderTop: '1px solid #f0f2f5' }}>
                                            <td style={{ padding: '10px 16px', fontWeight: 500, color: '#2d3436' }}>
                                                {u.username}
                                                {u.id === me?.id && <span style={{ marginLeft: 6, fontSize: 11, color: '#4f6ef7' }}>（我）</span>}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                                                    background: u.role === 'super_admin' ? '#fde8ef' : u.role === 'admin' ? '#eef1ff' : '#e8f5e9',
                                                    color: u.role === 'super_admin' ? '#ad1457' : u.role === 'admin' ? '#4f6ef7' : '#2e7d32',
                                                }}>
                                                    {ROLE_LABEL[u.role]}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px', color: '#636e72' }}>{u.company_name}</td>
                                            <td style={{ padding: '10px 16px', color: '#999' }}>{formatTime(u.created_at)}</td>
                                            <td style={{ padding: '10px 16px', color: '#999' }}>{formatTime(u.last_login_at)}</td>
                                            <td style={{ padding: '10px 16px', color: u.expired ? '#c62828' : '#636e72' }}>
                                                {formatTime(u.valid_until)}{u.expired && ' ⚠️'}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                                                    background: u.status === 'active' ? '#e8f5e9' : '#ffebee',
                                                    color: u.status === 'active' ? '#2e7d32' : '#c62828',
                                                }}>
                                                    {u.status === 'active' ? '正常' : '已禁用'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {u.id !== me?.id && (
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={() => handleExtend(u)} className="ui-nav-btn" style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e0e3eb', background: '#fff', color: '#4f6ef7', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>延长</button>
                                                        {u.status === 'active' ? (
                                                            <button onClick={() => handleDisable(u)} className="ui-nav-btn" style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ffe0b2', background: '#fff8f0', color: '#e65100', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>禁用</button>
                                                        ) : (
                                                            <button onClick={() => handleExtend(u)} className="ui-nav-btn" style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e8f5e9', background: '#f1f8e9', color: '#2e7d32', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>恢复</button>
                                                        )}
                                                        <button onClick={() => handleDeleteUser(u)} className="ui-nav-btn" style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>删除</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    <div>
                        {/* 创建邀请码 */}
                        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>🎟️ 生成新邀请码</div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ fontSize: 12, color: '#636e72', marginBottom: 6, display: 'block' }}>邀请码级别</label>
                                    <select className="ui-input" style={inputStyle} value={invLevel} onChange={(e) => setInvLevel(Number(e.target.value) as 1 | 2)}>
                                        <option value={2}>二级 · 用户注册</option>
                                        {me?.role === 'super_admin' && <option value={1}>一级 · 管理员注册</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: '#636e72', marginBottom: 6, display: 'block' }}>有效日期</label>
                                    <input
                                        className="ui-input"
                                        style={{ ...inputStyle, width: 210 }}
                                        type="datetime-local"
                                        value={invValidUntil}
                                        min={defaultValidUntil(0)}
                                        onChange={(e) => setInvValidUntil(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleCreateInvite}
                                    className="ui-btn-primary"
                                    style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: '#4f6ef7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    ＋ 生成邀请码
                                </button>
                            </div>
                            <p style={{ fontSize: 11, color: '#aaa', marginTop: 10, lineHeight: 1.6 }}>
                                💡 邀请码一次性使用，绑定账号后即作废；注册出的账号有效期与邀请码有效期一致，到期自动禁止登录。
                            </p>
                        </div>

                        {/* 邀请码列表 */}
                        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', overflow: 'hidden' }}>
                            {invites.length === 0 ? (
                                <div style={{ padding: 60, textAlign: 'center', color: '#999', fontSize: 13, lineHeight: 2 }}>
                                    暂无邀请码。点击上方「<b style={{ color: '#4f6ef7' }}>＋ 生成邀请码</b>」即可创建。
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8f9ff', color: '#636e72' }}>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>邀请码</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>级别</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>状态</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>创建者</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>有效期</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>使用者</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>创建时间</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invites.map((inv) => (
                                            <tr key={inv.id} className="ui-row" style={{ borderTop: '1px solid #f0f2f5' }}>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span
                                                        title="点击复制邀请码"
                                                        onClick={async (e) => {
                                                            const el = e.currentTarget;
                                                            const ok = await copyText(inv.code);
                                                            if (ok) {
                                                                showToast(`邀请码 ${inv.code} 已复制`);
                                                            } else {
                                                                selectElementText(el);
                                                                showToast('复制失败，已选中邀请码，请按 Ctrl+C 手动复制', 'error');
                                                            }
                                                        }}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            fontFamily: 'Consolas, monospace',
                                                            fontWeight: 600,
                                                            color: '#2d3436',
                                                            letterSpacing: 0.5,
                                                            background: '#f6f7fb',
                                                            border: '1px solid #e8eaf2',
                                                            borderRadius: 8,
                                                            padding: '5px 12px',
                                                            cursor: 'copy',
                                                            transition: 'all 0.2s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1ff'; e.currentTarget.style.borderColor = '#c9d4ff'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f6f7fb'; e.currentTarget.style.borderColor = '#e8eaf2'; }}
                                                    >
                                                        {inv.code}
                                                        <span style={{ fontSize: 11, color: '#4f6ef7' }}>⧉</span>
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, background: inv.level === 1 ? '#fde8ef' : '#eef1ff', color: inv.level === 1 ? '#ad1457' : '#4f6ef7' }}>
                                                        {inv.level === 1 ? '一级·管理员' : '二级·用户'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, background: inv.status === 'unused' ? '#e8f5e9' : '#f0f2f5', color: inv.status === 'unused' ? '#2e7d32' : '#999' }}>
                                                        {inv.status === 'unused' ? '未使用' : '已使用'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#636e72' }}>{inv.creator_username || '—'}</td>
                                                <td style={{ padding: '10px 16px', color: '#636e72' }}>{formatTime(inv.valid_until)}</td>
                                                <td style={{ padding: '10px 16px', color: '#636e72' }}>{inv.used_by_username || '—'}</td>
                                                <td style={{ padding: '10px 16px', color: '#999' }}>{formatTime(inv.created_at)}</td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    {inv.status === 'unused' && (
                                                        <button onClick={() => handleDeleteInvite(inv)} className="ui-nav-btn" style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>作废</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
