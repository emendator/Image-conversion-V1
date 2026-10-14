import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, fetchMe, guestLogin as apiGuestLogin, guestLogout as apiGuestLogout } from '../api/auth';
import { TOKEN_KEY } from '../api/api';
import type { UserInfo, RegisterPayload, UserRole } from '../types';

interface AuthContextValue {
    /** 当前登录用户（未登录为 null） */
    user: UserInfo | null;
    /** 是否已登录 */
    isLogin: boolean;
    /** 是否正在恢复登录态 */
    loading: boolean;
    login: (username: string, password: string) => Promise<UserInfo>;
    guestLogin: () => Promise<UserInfo>;
    register: (payload: RegisterPayload) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<UserInfo | null>;
    hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isLogin: false,
    loading: true,
    login: async () => { throw new Error('not ready'); },
    guestLogin: async () => { throw new Error('not ready'); },
    register: async () => { throw new Error('not ready'); },
    logout: () => { },
    refreshUser: async () => null,
    hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);

    // 启动时用本地 token 恢复登录态
    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            setLoading(false);
            return;
        }
        fetchMe()
            .then((u) => setUser(u))
            .catch((e: any) => {
                // 仅当鉴权失败（401 token 失效）时清除 token；
                // 网络/服务错误（502 等）保留 token，刷新后自动重试恢复
                if (e?.response?.status === 401) {
                    localStorage.removeItem(TOKEN_KEY);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (username: string, password: string): Promise<UserInfo> => {
        const res = await apiLogin(username, password);
        localStorage.setItem(TOKEN_KEY, res.token);
        setUser(res.user);
        return res.user;
    }, []);

    const guestLogin = useCallback(async (): Promise<UserInfo> => {
        const res = await apiGuestLogin();
        localStorage.setItem(TOKEN_KEY, res.token);
        setUser(res.user);
        return res.user;
    }, []);

    const register = useCallback(async (payload: RegisterPayload) => {
        await apiRegister(payload);
    }, []);

    const logout = useCallback(() => {
        const u = user;
        // 游客退出：先通知后端清除账号及全部数据（此时 token 仍有效），再清除本地
        if (u?.role === 'guest') {
            apiGuestLogout().catch(() => { });
        }
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
    }, [user]);

    const refreshUser = useCallback(async (): Promise<UserInfo | null> => {
        try {
            const u = await fetchMe();
            setUser(u);
            return u;
        } catch {
            return null;
        }
    }, []);

    const hasRole = useCallback(
        (...roles: UserRole[]) => (user ? roles.includes(user.role) : false),
        [user]
    );

    const value: AuthContextValue = {
        user,
        isLogin: !!user,
        loading,
        login,
        guestLogin,
        register,
        logout,
        refreshUser,
        hasRole,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
