export interface TemplateItem {
    id?: number;
    name: string;
    path: string;
    thumbnail: string;
    /** 图片库原始文件 URL（需带 token 访问） */
    file_url?: string;
    category?: string;
    orientation?: string;
}

export interface TemplatesResponse {
    templates: TemplateItem[];
}

export interface UploadResponse {
    path: string;
    name: string;
    preview: string;
}

export interface MultipleUploadResponse {
    success: boolean;
    products: UploadResponse[];
    count: number;
}

export interface GenerateEcommerceResponse {
    success: boolean;
    preview: string;
    download_url: string;
    elapsed: number;
    size: string;
    /** 本次 AI 匹配消耗（未使用 AI 时为空对象） */
    usage?: UsageInfo;
    ai_used?: boolean;
}

export interface GeneratePosterResponse {
    task_id: string;
    message: string;
}

export interface EditPosterResponse {
    success: boolean;
    preview: string;
    download_url: string;
    elapsed: number;
    size: string;
    usage?: UsageInfo;
    ai_used?: boolean;
}

export interface PosterProgressResponse {
    status: 'running' | 'completed' | 'failed';
    step: number;
    step_name: string;
    progress: number;
    error: string | null;
    result: {
        success: boolean;
        preview: string;
        download_url: string;
        /** 文生图模式下本次 AI 生成的底图下载地址（供用户选择保留入库） */
        base_download_url?: string;
        /** 本次 AI 生成但未入库的临时底图标识（供前端按预览位置合成） */
        temp_base_id?: string;
        /** 文生图模式一次生成的多张底图预览（供用户选择其一） */
        base_previews?: string[];
        /** 与 base_previews 对应的临时底图标识 */
        temp_base_ids?: string[];
        /** 与 base_previews 对应的下载地址（AI 嵌入素材模式选择方案后可直接下载） */
        base_download_urls?: string[];
        /** 是否为 AI 嵌入素材模式（生成结果即成品海报，无需再合成） */
        ai_embed?: boolean;
        use_existing_base?: boolean;
        elapsed: number;
        size: string;
        usage?: UsageInfo;
        ai_used?: boolean;
    } | null;
    elapsed: number;
}

export interface UploadSliceResponse {
    success: boolean;
    preview: string;
    download_url: string;
}

export interface TextLine {
    id: string;
    text: string;
    color: string;
    fontSize: number;
    xPct: number;
    yPct: number;
    section: string;
}

/** 一次 AI 调用的用量信息（归一化字段） */
export interface UsageInfo {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    image_count?: number;
    [key: string]: unknown;
}

/** API 配置状态（后端返回） */
export interface ApiConfigStatus {
    /** dashscope（阿里云百炼）/ jimeng（即梦 AI 图片生成4.6） */
    provider: string;
    provider_name: string;
    has_api_key: boolean;
    /** DashScope API Key 掩码 */
    api_key_masked: string;
    /** 即梦 Access Key ID 掩码 */
    access_key_masked?: string;
    /** 即梦 Secret Access Key 掩码 */
    secret_key_masked?: string;
    /** 当前供应商展示用的凭证掩码（DashScope 用 Key，即梦用 Access Key ID） */
    key_masked?: string;
    /** 已保存过凭证的供应商列表（切换回时无需重新输入） */
    configured_providers?: string[];
    /** 后端能力版本（旧后端无此字段，无法保存即梦 AK/SK） */
    api_version?: number;
    /** 各供应商独立统计的累计用量：{dashscope|jimeng: {total_tokens, total_images, calls}} */
    usage_by_provider?: Record<string, { total_tokens: number; total_images: number; calls: number }>;
    base_url: string;
    model: string;
    /** 模型展示名（即梦固定为即梦图片4.6） */
    model_name?: string;
    /** 当前凭证累计消耗 Token 总量 */
    total_tokens: number;
    total_images: number;
    calls: number;
    /** 一次性传输混淆 nonce（仅 GET 返回） */
    transit_nonce?: string;
}

/** 一次 AI 调用的消耗历史明细（后端返回，倒序） */
export interface UsageHistoryItem {
    ts: number;
    time: string;
    /** 消耗来源（如「营销海报·生成底图」「电商主图·颜色修改」） */
    scene: string;
    /** 产生消耗的供应商：dashscope / jimeng（用于分开统计） */
    provider?: string;
    total_tokens: number;
    input_tokens?: number;
    output_tokens?: number;
    image_count?: number;
}

// ========== 登录 / 权限 ==========

export type UserRole = 'super_admin' | 'admin' | 'user' | 'guest';

export interface UserInfo {
    id: number;
    username: string;
    email: string;
    role: UserRole;
    company_id: number;
    company_name: string;
    invite_code_id: number | null;
    created_at: string;
    last_login_at: string | null;
    valid_until: string | null;
    expired: boolean;
    status: string;
    has_api_key: boolean;
}

export interface AuthResponse {
    token: string;
    user: UserInfo;
}

export interface RegisterPayload {
    username: string;
    password: string;
    email: string;
    invite_code: string;
    action: 'join' | 'create';
    company_name: string;
    company_db_password: string;
}

// ========== 图片库 ==========

export type ImageCategory = 'ecommerce' | 'slice' | 'poster_base';
export type Orientation = 'horizontal' | 'vertical';

export interface ImageItem {
    id: number;
    category: ImageCategory;
    orientation: Orientation | '';
    /** 自定义业务分类（用户可自由新增，可为空） */
    label?: string;
    name: string;
    filename: string;
    size: number;
    uploaded_by: number | null;
    created_at: string;
    updated_at: string | null;
    thumbnail: string;
    file_url: string;
    /** 是否为系统默认模板（所有公司共用，只读） */
    is_default?: boolean;
}

export interface ImagesResponse {
    images: ImageItem[];
}

export interface ImageLabelsResponse {
    labels: string[];
}

// ========== 邀请码 / 用户管理 ==========

export interface AdminUserItem {
    id: number;
    username: string;
    email: string;
    role: UserRole;
    company_id: number;
    company_name: string;
    created_at: string;
    last_login_at: string | null;
    valid_until: string | null;
    expired: boolean;
    status: string;
    has_api_key: boolean;
}

export interface AdminUsersResponse {
    users: AdminUserItem[];
}

export interface CompanyItem {
    id: number;
    name: string;
    created_at: string;
}

export interface CompaniesResponse {
    companies: CompanyItem[];
}
