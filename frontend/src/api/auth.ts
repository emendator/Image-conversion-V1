import { http, TOKEN_KEY } from './api';
import type {
    AuthResponse,
    RegisterPayload,
    UserInfo,
    CompaniesResponse,
} from '../types';

export async function login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await http.post('/api/auth/login', { username, password });
    return data;
}

export async function register(payload: RegisterPayload): Promise<{ success: boolean; message: string }> {
    const { data } = await http.post('/api/auth/register', payload);
    return data;
}

export async function fetchMe(): Promise<UserInfo> {
    const { data } = await http.get('/api/auth/me');
    return data;
}

/** 游客登录：创建临时账号（数据不保留，退出自动清除） */
export async function guestLogin(): Promise<AuthResponse> {
    const { data } = await http.post('/api/auth/guest');
    return data;
}

/** 游客退出：清除游客账号及全部数据。
 * 注意：必须在 token 清除前调用；此处用 fetch 并在调用时同步读取 token 携带，
 * 避免经 axios 拦截器异步读取时 token 已被移除导致 401。 */
export async function guestLogout(): Promise<{ success: boolean; message: string }> {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch('/api/auth/guest-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
        try {
            const err = await res.json();
            throw new Error(err?.detail || '游客退出失败');
        } catch (e: any) {
            throw e?.message ? e : new Error('游客退出失败');
        }
    }
    return res.json();
}

export async function fetchCompanies(): Promise<CompaniesResponse> {
    const { data } = await http.get('/api/companies');
    return data;
}

/** 检测邀请码（注册时按级别展示不同表单） */
export async function fetchInviteCodeInfo(code: string): Promise<{
    valid: boolean;
    level?: 1 | 2;
    message?: string;
}> {
    const { data } = await http.get('/api/auth/invite-code-info', { params: { code } });
    return data;
}

// ========== 邀请码（超管/管理员） ==========

export interface InviteCodeItem {
    id: number;
    code: string;
    level: 1 | 2;
    status: 'unused' | 'used';
    created_by: number | null;
    creator_username?: string | null;
    used_by_username?: string | null;
    valid_until: string | null;
    created_at: string;
    used_at: string | null;
}

export async function createInviteCode(level: 1 | 2, validUntil: string): Promise<{ invite: InviteCodeItem }> {
    const { data } = await http.post('/api/auth/invite-codes', { level, valid_until: validUntil });
    return data;
}

export async function fetchInviteCodes(): Promise<{ invites: InviteCodeItem[] }> {
    const { data } = await http.get('/api/auth/invite-codes');
    return data;
}

export async function deleteInviteCode(id: number): Promise<{ success: boolean }> {
    const { data } = await http.delete(`/api/auth/invite-codes/${id}`);
    return data;
}
