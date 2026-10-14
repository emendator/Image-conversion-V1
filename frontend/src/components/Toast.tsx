import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastItem {
    id: number;
    message: string;
    type: 'success' | 'error';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1100, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}> {/* 图层约定：Toast 最高 1100，始终在弹窗(1000)之上 */}
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className="ui-toast"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '11px 16px 12px',
                            borderRadius: 10,
                            color: '#fff',
                            fontSize: 13,
                            marginBottom: 8,
                            boxShadow: '0 2px 8px rgba(15,23,42,0.12), 0 12px 32px rgba(15,23,42,0.18)',
                            borderLeft: '3px solid rgba(255,255,255,0.55)',
                            background: t.type === 'error' ? '#e74c3c' : '#27ae60',
                            maxWidth: 340,
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        <span
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                flexShrink: 0,
                                background: 'rgba(255,255,255,0.24)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 700,
                            }}
                        >
                            {t.type === 'error' ? '✕' : '✓'}
                        </span>
                        <span style={{ lineHeight: 1.5 }}>{t.message}</span>
                        <span className="ui-toast-progress" />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
