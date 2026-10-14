import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * 页面毛玻璃模糊退场 + 转场预加载：
 * 监听 Header 派发的 page-transition 事件（携带目标路径 to），
 * 触发 leaving 状态（根容器加 ui-leave 毛玻璃模糊退场动画），
 * 退场动画期间目标页可开始加载内容（跳转后挂载并并行加载），动画结束后 navigate 到目标页。
 */
export function usePageLeave() {
    const navigate = useNavigate();
    const location = useLocation();
    const [leaving, setLeaving] = useState(false);
    const leavingRef = useRef(false);

    // 记录当前生成器页面路径，供 Header「返回生成器」使用
    useEffect(() => {
        try {
            sessionStorage.setItem('last-generator', location.pathname);
        } catch {
            /* ignore */
        }
    }, [location.pathname]);

    useEffect(() => {
        const onTransition = (e: Event) => {
            if (leavingRef.current) return;
            const to = (e as CustomEvent<{ to?: string }>).detail?.to || '/';
            leavingRef.current = true;
            setLeaving(true);
            // 退场动画 0.38s + 余量后跳转目标页（目标页挂载后立即并行加载数据，与入场动画重叠）
            setTimeout(() => navigate(to), 600);
        };
        window.addEventListener('page-transition', onTransition);
        // 兼容旧的 request-home 事件
        window.addEventListener('request-home', onTransition);
        return () => {
            window.removeEventListener('page-transition', onTransition);
            window.removeEventListener('request-home', onTransition);
        };
    }, [navigate]);

    return { leaving };
}
