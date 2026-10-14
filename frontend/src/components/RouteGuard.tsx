import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

export default function RouteGuard({ children, roles }: { children: ReactNode; roles?: UserRole[] }) {
    const { user, isLogin, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#f5f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
                <span style={{ color: '#636e72', fontSize: 14 }}>加载中…</span>
            </div>
        );
    }

    if (!isLogin) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    if (roles && user && !roles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
