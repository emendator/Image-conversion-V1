import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { fetchApiConfig, saveApiConfig } from '../api/api';
import { transitEncrypt } from '../utils/crypto';
import { useAuth } from './AuthContext';
import ApiSettingsModal from '../components/ApiSettingsModal';
import type { ApiConfigStatus } from '../types';

interface ApiConfigContextValue {
    /** 后端返回的 API 配置状态 */
    status: ApiConfigStatus | null;
    /** 首次加载中 */
    loading: boolean;
    /** 设置弹窗开关 */
    open: boolean;
    setOpen: (v: boolean) => void;
    /** 重新拉取配置（如 AI 调用后更新累计用量） */
    refresh: () => Promise<ApiConfigStatus | null>;
    /** 保存新的 AI 生图凭证（前端做传输混淆，后端加密落盘）
     * - dashscope: apiKey
     * - jimeng: accessKey + secretKey（火山引擎 Access Key ID / Secret Access Key）
     * 凭证为空时仅保存供应商切换 / 高级选项
     */
    saveKey: (opts?: {
        provider?: string;
        apiKey?: string;
        accessKey?: string;
        secretKey?: string;
        baseUrl?: string;
        model?: string;
    }) => Promise<ApiConfigStatus | null>;
    /** 是否已配置 AI 生图凭证 */
    hasKey: boolean;
    /** 本次 AI 消耗展示后调用：刷新累计用量 */
    recordUsed: () => void;
}

const ApiConfigContext = createContext<ApiConfigContextValue>({
    status: null,
    loading: true,
    open: false,
    setOpen: () => { },
    refresh: async () => null,
    saveKey: async () => null,
    hasKey: false,
    recordUsed: () => { },
});

export const useApiConfig = () => useContext(ApiConfigContext);

export function ApiConfigProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<ApiConfigStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const { isLogin, loading: authLoading } = useAuth();

    const refresh = useCallback(async (): Promise<ApiConfigStatus | null> => {
        // 登录态尚未恢复完成：保持加载中，不显示"加载失败"
        if (authLoading) {
            setLoading(true);
            return null;
        }
        // 未登录：保持待定状态（status 为 null、loading 为 true），由路由守卫保证业务页仅在登录后渲染
        if (!isLogin) {
            return null;
        }
        try {
            const s = await fetchApiConfig();
            setStatus(s);
            return s;
        } catch (e) {
            console.error('获取 API 配置失败', e);
            setStatus(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, [isLogin, authLoading]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const saveKey = useCallback(async (opts?: {
        provider?: string;
        apiKey?: string;
        accessKey?: string;
        secretKey?: string;
        baseUrl?: string;
        model?: string;
    }) => {
        const o = opts || {};
        const nonce = status?.transit_nonce || Math.random().toString(36).slice(2);
        const payload: Record<string, string> = {};
        if (o.provider) payload.provider = o.provider;
        if (o.apiKey) {
            payload.encrypted_key = transitEncrypt(o.apiKey, nonce);
            payload.nonce = nonce;
        }
        if (o.accessKey) {
            payload.encrypted_access_key = transitEncrypt(o.accessKey, nonce);
            payload.nonce = nonce;
        }
        if (o.secretKey) {
            payload.encrypted_secret_key = transitEncrypt(o.secretKey, nonce);
            payload.nonce = nonce;
        }
        if (o.baseUrl) payload.base_url = o.baseUrl;
        if (o.model) payload.model = o.model;
        const s = await saveApiConfig(payload);
        setStatus(s);
        setOpen(false);
        return s;
    }, [status]);

    const recordUsed = useCallback(() => {
        // AI 调用消耗 Token 后，轻量刷新累计用量（无需强制弹窗）
        fetchApiConfig().then((s) => setStatus(s)).catch(() => { });
    }, []);

    const value: ApiConfigContextValue = {
        status,
        loading,
        open,
        setOpen,
        refresh,
        saveKey,
        hasKey: !!status?.has_api_key,
        recordUsed,
    };

    return (
        <ApiConfigContext.Provider value={value}>
            {children}
            <ApiSettingsModal
                open={open}
                onClose={() => {
                    // 允许用户选择不配置 API Key（仅 AI 功能受限，非 AI 功能不受影响）
                    setOpen(false);
                }}
            />
        </ApiConfigContext.Provider>
    );
}
