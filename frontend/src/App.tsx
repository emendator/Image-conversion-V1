import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './context/AuthContext';
import { ApiConfigProvider } from './context/ApiConfigContext';
import ReadingProgress from './components/ReadingProgress';
import RouteGuard from './components/RouteGuard';
import Home from './pages/Home';
import Login from './pages/Login';
import Ecommerce from './pages/Ecommerce';
import Poster from './pages/Poster';
import Slice from './pages/Slice';
import Library from './pages/Library';
import AdminUsers from './pages/AdminUsers';
import NotFound from './pages/NotFound';
import { applyPageTheme } from './ui-meta';

// 路由变化时动态更新浏览器 Favicon 与主题色（detail.design #77/#78/#101/#106）
function RouteMetaSync() {
    const location = useLocation();
    useEffect(() => {
        applyPageTheme(location.pathname);
    }, [location.pathname]);
    return null;
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <ApiConfigProvider>
                        <RouteMetaSync />
                        <ReadingProgress />
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/" element={<RouteGuard><Home /></RouteGuard>} />
                            <Route path="/ecommerce" element={<RouteGuard><Ecommerce /></RouteGuard>} />
                            <Route path="/poster" element={<RouteGuard><Poster /></RouteGuard>} />
                            <Route path="/slice" element={<RouteGuard><Slice /></RouteGuard>} />
                            <Route path="/library" element={<RouteGuard><Library /></RouteGuard>} />
                            <Route path="/admin/users" element={<RouteGuard roles={['super_admin', 'admin']}><AdminUsers /></RouteGuard>} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </ApiConfigProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
