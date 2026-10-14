import axios from 'axios';
import type {
    TemplatesResponse,
    UploadResponse,
    MultipleUploadResponse,
    GenerateEcommerceResponse,
    GeneratePosterResponse,
    PosterProgressResponse,
    EditPosterResponse,
    UploadSliceResponse,
    ApiConfigStatus,
    UsageHistoryItem,
} from '../types';

const API_BASE = '/api';

/** localStorage 中保存 JWT 的键名 */
export const TOKEN_KEY = 'image_converter_token';

// 带鉴权的 axios 实例（自动附加 Authorization，401 自动跳转登录）
export const http = axios.create({});

http.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

http.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
            localStorage.removeItem(TOKEN_KEY);
            window.location.href = '/login';
        }
        return Promise.reject(err);
    }
);

/** 文件 URL 追加 token（供 <img> 等无法带 Header 的场景使用） */
export function authedFileUrl(url: string): string {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export async function fetchApiConfig(): Promise<ApiConfigStatus> {
    const { data } = await http.get(`${API_BASE}/config/api`);
    return data;
}

export async function saveApiConfig(payload: {
    /** 生图供应商：dashscope / jimeng */
    provider?: string;
    encrypted_key?: string;
    nonce?: string;
    api_key?: string;
    encrypted_access_key?: string;
    encrypted_secret_key?: string;
    access_key?: string;
    secret_key?: string;
    base_url?: string;
    model?: string;
}): Promise<ApiConfigStatus> {
    const { data } = await http.post(`${API_BASE}/config/api`, payload);
    return data;
}

/** 测试即梦连接（后端用已保存的 AK/SK 轻量探测鉴权，不创建任务） */
export async function testApiConfig(): Promise<{ success: boolean; detail: string }> {
    const { data } = await http.post(`${API_BASE}/config/api/test`);
    return data;
}

/** 获取当前账号的 API 消耗历史（每笔明细，倒序；provider 可选，按供应商过滤） */
export async function getUsageHistory(provider?: string): Promise<UsageHistoryItem[]> {
    const params = provider ? { provider } : undefined;
    const { data } = await http.get(`${API_BASE}/config/usage-history`, { params });
    return data?.history || [];
}

export async function fetchTemplates(): Promise<TemplatesResponse> {
    const { data } = await http.get(`${API_BASE}/templates`);
    return data;
}

export async function fetchSliceTemplates(orientation?: string): Promise<TemplatesResponse> {
    const params = orientation ? { orientation } : {};
    const { data } = await http.get(`${API_BASE}/slice-templates`, { params });
    return data;
}

export async function uploadImage(file: File, endpoint: string): Promise<UploadResponse> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post(`${API_BASE}/${endpoint}`, form);
    return data;
}

export async function uploadMultipleProducts(files: File[]): Promise<MultipleUploadResponse> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const { data } = await http.post(`${API_BASE}/upload-multiple-products`, form);
    return data;
}

export async function generateEcommerceFinal(
    blob: Blob,
    colorPrompt: string,
    size: string
): Promise<GenerateEcommerceResponse> {
    const form = new FormData();
    form.append('file', blob, 'ecommerce_preview.png');
    if (colorPrompt) form.append('color_prompt', colorPrompt);
    form.append('size', size);
    const { data } = await http.post(`${API_BASE}/generate-ecommerce-final`, form);
    return data;
}

export async function generatePoster(payload: {
    prompt: string;
    logo_path: string;
    qr_path: string;
    brand_path: string;
    use_existing_base?: boolean;
    /** 素材嵌入方式：ai=素材随底图一起交给 AI 生成（AI 嵌入素材） */
    ai_embed?: boolean;
    base_image_id?: number;
    temp_base_id?: string;
    num?: number;
    positions?: Record<string, { xPct: number; yPct: number; wPct: number; hPct: number }>;
}): Promise<GeneratePosterResponse> {
    const { data } = await http.post(`${API_BASE}/generate-poster`, payload);
    return data;
}

export async function editPoster(payload: {
    prompt: string;
    image_path?: string;
}): Promise<EditPosterResponse> {
    const { data } = await http.post(`${API_BASE}/edit-poster`, payload);
    return data;
}

export async function getPosterProgress(taskId: string): Promise<PosterProgressResponse> {
    const { data } = await http.get(`${API_BASE}/generate-poster-progress/${taskId}`);
    return data;
}

export async function uploadSliceResult(blob: Blob): Promise<UploadSliceResponse> {
    const form = new FormData();
    form.append('file', blob, 'slice_result.png');
    const { data } = await http.post(`${API_BASE}/upload-slice-result`, form);
    return data;
}

