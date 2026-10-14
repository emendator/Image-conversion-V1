import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import UploadZone from '../components/UploadZone';
import TokenUsage from '../components/TokenUsage';
import DecodeText from '../components/DecodeText';
import { setLoadingFavicon, applyPageTheme } from '../ui-meta';
import { useToast } from '../components/Toast';
import { useApiConfig } from '../context/ApiConfigContext';
import { usePageLeave } from '../hooks/usePageLeave';
import { authedFileUrl } from '../api/api';
import { uploadImage, generatePoster, getPosterProgress, editPoster as editPosterApi } from '../api/api';
import { fetchImages, fetchImageLabels, savePosterBase } from '../api/library';
import type { UsageInfo, ImageItem } from '../types';
import '../ui-details.css';

interface PctPos {
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
}

interface Uploaded {
    path: string;
    preview: string;
}

// 嵌入模式切换时保存/恢复的 AI 底图相关页面数据（切换页面不丢失已生成底图）
interface EmbedModeSnapshot {
    prompt: string;
    phase: 'prompt' | 'compose';
    baseOptions: { preview: string; tempBaseId: string; downloadUrl: string }[];
    selectedBaseIdx: number | null;
    tempBaseId: string;
    aiBasePreview: string;
    aiBaseId: number;
    savePending: boolean;
    preview: string;
    downloadUrl: string;
    showResult: boolean;
    baseCount: number;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

// 将 API 原始报错转为友好原因提示（未命中则原样返回）
const friendlyApiError = (msg: string): string => {
    const m = msg || '';
    if (/datainspectionfailed|green net|content.*check/i.test(m)) return '内容安全审核未通过：输入的文字或图片疑似包含违规/敏感内容，无法生成，请修改后再试。';
    if (/ratelimit|throttling|flow control/i.test(m)) return '调用过于频繁已被限流，请稍等片刻再试。';
    if (/insufficientbalance/i.test(m)) return '账户余额不足，无法继续调用 AI，请充值后再试。';
    if (/invalidapikey|authentication|unauthorized/i.test(m)) return 'API Key 无效或没有权限，请在「API 设置」中检查。';
    if (/modelnotfound|model not found/i.test(m)) return '模型不存在或不可用，请在「API 设置」中检查模型名称。';
    if (/timeout|timed out/i.test(m)) return '请求超时，请稍后重试。';
    return m;
};

// 素材默认位置（百分比，相对 520×1150 画布）
const DEFAULT_LOGO: PctPos = { xPct: 0, yPct: 0, wPct: 48, hPct: 22 };
const DEFAULT_QR: PctPos = { xPct: 48, yPct: 0, wPct: 48, hPct: 22 };
const DEFAULT_BRAND: PctPos = { xPct: 0, yPct: 70, wPct: 100, hPct: 30 };

// ========== 可拖拽 + 缩放素材 ==========
function PosterOverlay({ label, src, pct, onChange, zIndex }: {
    label: string;
    src: string;
    pct: PctPos;
    onChange: (p: PctPos) => void;
    zIndex: number;
}) {
    const start = useRef({ px: 0, py: 0, xPct: 0, yPct: 0, wPct: 0, hPct: 0 });
    const fittedRef = useRef('');

    // 图片加载后，按图片实际宽高比自动适配虚线框尺寸（仅首次/换图时执行一次），
    // 使图片填满框、无留白，避免“占用空间与图片实际大小不符”
    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return;
        if (fittedRef.current === src) return; // 已适配过同一图片
        fittedRef.current = src;
        // 容器为 520:1150 竖版；保持宽度不变，按图片比例换算高度百分比
        // 像素比 wPx/hPx = (wPct/100*520)/(hPct/100*1150) = w/h
        const newHPct = pct.wPct * (520 / 1150) * (h / w);
        const clamped = Math.max(1, Math.min(100, newHPct));
        onChange({ ...pct, hPct: clamped });
    };

    const onDragStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const container = e.currentTarget.parentElement!;
        const rect = container.getBoundingClientRect();
        start.current = { px: e.clientX, py: e.clientY, xPct: pct.xPct, yPct: pct.yPct, wPct: 0, hPct: 0 };
        const onMove = (ev: PointerEvent) => {
            const dx = (ev.clientX - start.current.px) / rect.width * 100;
            const dy = (ev.clientY - start.current.py) / rect.height * 100;
            onChange({ ...pct, xPct: clamp(start.current.xPct + dx), yPct: clamp(start.current.yPct + dy) });
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const onResizeStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const container = e.currentTarget.parentElement!.parentElement!;
        const rect = container.getBoundingClientRect();
        start.current = { px: e.clientX, py: e.clientY, xPct: 0, yPct: 0, wPct: pct.wPct, hPct: pct.hPct };
        const ratio = pct.hPct / pct.wPct || 1;
        const onMove = (ev: PointerEvent) => {
            const dw = (ev.clientX - start.current.px) / rect.width * 100;
            let w = clamp(start.current.wPct + dw);
            let h = w * ratio;
            if (h > 100) { h = 100; w = h / ratio; }
            onChange({ ...pct, wPct: w, hPct: h });
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    return (
        <div
            onPointerDown={onDragStart}
            style={{ position: 'absolute', left: `${pct.xPct}%`, top: `${pct.yPct}%`, width: `${pct.wPct}%`, height: `${pct.hPct}%`, cursor: 'move', zIndex, touchAction: 'none' }}
        >
            <img
                src={src}
                alt={label}
                onLoad={handleImageLoad}
                style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', border: '1.5px dashed #8b5cf6', borderRadius: 6, background: 'rgba(139,92,246,0.06)', boxSizing: 'border-box' }}
            />
            <span style={{ position: 'absolute', top: -20, left: 0, fontSize: 10, background: '#8b5cf6', color: '#fff', padding: '1px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                {label}
            </span>
            <span
                onPointerDown={onResizeStart}
                style={{ position: 'absolute', right: -7, bottom: -7, width: 15, height: 15, background: '#8b5cf6', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
                title="拖拽调整大小"
            />
        </div>
    );
}

// ========== 主页面 ==========
export default function Poster() {
    const { leaving } = usePageLeave();
    const { showToast } = useToast();
    const { hasKey, setOpen, recordUsed } = useApiConfig();
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState('');

    // 生成中：浏览器标签页图标变为加载环（detail.design #101 Dynamic Favicon）
    useEffect(() => {
        if (loading) setLoadingFavicon(true, '#8b5cf6');
        else applyPageTheme('/poster');
    }, [loading]);
    // 生成结果图是否展示（可手动关闭；关闭后回到预览编辑区，也可在多种操作时自动关闭）
    const [showResult, setShowResult] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [lastUsage, setLastUsage] = useState<UsageInfo | null>(null);

    // Uploads
    const [logo, setLogo] = useState<Uploaded | null>(null);
    const [qr, setQr] = useState<Uploaded | null>(null);
    const [brand, setBrand] = useState<Uploaded | null>(null);

    // 素材位置（预览拖拽）
    const [logoPos, setLogoPos] = useState<PctPos>(DEFAULT_LOGO);
    const [qrPos, setQrPos] = useState<PctPos>(DEFAULT_QR);
    const [brandPos, setBrandPos] = useState<PctPos>(DEFAULT_BRAND);

    // 底图来源模式：ai=AI 生成底图 / existing=使用现有底图 / edit=修改现有海报
    const [baseMode, setBaseMode] = useState<'ai' | 'existing' | 'edit'>('ai');
    const useExistingBase = baseMode === 'existing';
    const [bases, setBases] = useState<ImageItem[]>([]);
    const [selectedBase, setSelectedBase] = useState<ImageItem | null>(null);
    // 使用现有底图：底图选择模块是否展开（收起时仅显示当前选择 + 选择按钮）
    const [expandBase, setExpandBase] = useState(true);
    // 使用现有底图：底图选择按分类筛选
    const [baseLabelFilter, setBaseLabelFilter] = useState('');
    const [baseLabels, setBaseLabels] = useState<string[]>([]);

    // 修改现有海报（上传海报 + 提示词迭代修改）
    const [editPoster, setEditPoster] = useState<Uploaded | null>(null);
    const [editPrompt, setEditPrompt] = useState('');
    const [editResult, setEditResult] = useState<{ preview: string; download_url: string; elapsed: number; usage: UsageInfo | null } | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editHasLastResult, setEditHasLastResult] = useState(false);
    // 校验失败时轻摇对应操作按钮（motion-24：disarmed click 需回应）
    const [shake, setShake] = useState<string | null>(null);
    // AI 底图生成数量（1~4）
    const [baseCount, setBaseCount] = useState(4);

    // Progress
    const [step1, setStep1] = useState<'pending' | 'running' | 'done'>('pending');
    const [step2, setStep2] = useState<'pending' | 'running' | 'done'>('pending');

    // AI 底图生成阶段：prompt（待生成底图）→ compose（底图已生成，可上传素材并合成）
    const [phase, setPhase] = useState<'prompt' | 'compose'>('prompt');
    const [aiBaseId, setAiBaseId] = useState(0);
    const [aiBasePreview, setAiBasePreview] = useState('');
    // 当前进行中的操作（区分 loading 文案：生成底图 / 合成）
    const [action, setAction] = useState<'base' | 'compose' | null>(null);
    // 素材嵌入方式：manual=AI 生成底图后手动合成（现有逻辑）/ ai=素材随底图一起交给 AI 生成
    const [embedMode, setEmbedMode] = useState<'manual' | 'ai'>('manual');
    // 本次 AI 生成的临时底图标识（未入库，供第二步按预览合成）
    const [tempBaseId, setTempBaseId] = useState('');
    // 一次生成的多张底图方案（供用户选择其一）
    const [baseOptions, setBaseOptions] = useState<{ preview: string; tempBaseId: string; downloadUrl: string }[]>([]);
    const [selectedBaseIdx, setSelectedBaseIdx] = useState<number | null>(null);
    // 底图生成后是否待用户确认保存（强制选择，未选择前不可合成）
    const [savePending, setSavePending] = useState(false);
    const [saving, setSaving] = useState(false);
    // 保存底图到图片库时的分类（选择已有或新增）
    const [saveLabel, setSaveLabel] = useState('');
    const [saveLabelMode, setSaveLabelMode] = useState<'select' | 'new'>('select');
    const [saveLabelNew, setSaveLabelNew] = useState('');
    const [posterLabels, setPosterLabels] = useState<string[]>([]);

    const previewRef = useRef<HTMLDivElement>(null);
    const composeBtnRef = useRef<HTMLButtonElement>(null);
    // 多张底图挑选时预览最大高度（不超过「请先选择一张底图」按钮位置）
    const [previewMaxH, setPreviewMaxH] = useState<number | null>(null);

    // 进入"选用现有底图"时加载本公司底图 + 可选分类
    useEffect(() => {
        if (!useExistingBase) return;
        fetchImages({ category: 'poster_base' }).then((res) => {
            setBases(res.images);
            if (res.images.length > 0 && !selectedBase) setSelectedBase(res.images[0]);
        }).catch(() => { });
        fetchImageLabels('poster_base').then((res) => setBaseLabels(res.labels)).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [useExistingBase]);

    // 进入"保存底图"流程时加载海报底图已有分类
    useEffect(() => {
        if (!savePending) return;
        fetchImageLabels('poster_base').then((res) => setPosterLabels(res.labels)).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savePending]);

    const handleUpload = async (files: File[], endpoint: string, setter: (d: Uploaded) => void) => {
        try {
            const data = await uploadImage(files[0], endpoint);
            setter(data);
            setShowResult(false); // 上传新素材后回到编辑预览
            showToast('上传成功');
        } catch {
            showToast('上传失败', 'error');
        }
    };

    // 嵌入模式切换时保存/恢复页面数据（手动 ⇄ AI 来回切换不丢失已生成的底图等最新数据）
    const embedSnapshots = useRef<Partial<Record<'manual' | 'ai', EmbedModeSnapshot>>>({});

    const saveEmbedState = (mode: 'manual' | 'ai') => {
        embedSnapshots.current[mode] = {
            prompt, phase, baseOptions, selectedBaseIdx, tempBaseId,
            aiBasePreview, aiBaseId, savePending, preview, downloadUrl, showResult, baseCount,
        };
    };

    const restoreEmbedState = (mode: 'manual' | 'ai') => {
        const s = embedSnapshots.current[mode];
        setPrompt(s?.prompt ?? '');
        setPhase(s?.phase ?? 'prompt');
        setBaseOptions(s?.baseOptions ?? []);
        setSelectedBaseIdx(s?.selectedBaseIdx ?? null);
        setTempBaseId(s?.tempBaseId ?? '');
        setAiBasePreview(s?.aiBasePreview ?? '');
        setAiBaseId(s?.aiBaseId ?? 0);
        setSavePending(s?.savePending ?? false);
        setPreview(s?.preview ?? '');
        setDownloadUrl(s?.downloadUrl ?? '');
        setShowResult(s?.showResult ?? false);
        setBaseCount(s?.baseCount ?? 4);
    };

    // 切换底图来源模式
    const handleModeChange = (m: 'ai' | 'existing' | 'edit') => {
        // 离开 AI 模式：保存当前嵌入模式的最新页面数据
        if (baseMode === 'ai' && m !== 'ai') saveEmbedState(embedMode);
        setBaseMode(m);
        // 回到 AI 模式：恢复该嵌入模式保存的数据（含已生成底图），无历史则给默认值
        if (m === 'ai') {
            restoreEmbedState(embedMode);
            setExpandBase(true);
            return;
        }
        setSavePending(false);
        setShowResult(false); // 切换底图来源模式时关闭结果预览
        setExpandBase(true);  // 切换到底图来源模式时默认展开底图选择
    };

    // 修改海报：上传待修改的营销海报
    const handleEditUpload = async (files: File[]) => {
        try {
            const data = await uploadImage(files[0], 'upload-poster-edit');
            setEditPoster(data);
            setEditResult(null);
            setEditHasLastResult(false);
            setShowResult(false);
            showToast('海报上传成功');
        } catch {
            showToast('上传失败', 'error');
        }
    };

    // 修改海报：按提示词生成修改后的新海报
    // restart=false：未修改过时用最初上传的原海报；已修改过则基于上一次修改结果继续迭代（接着修改）
    // restart=true：始终以最初上传的原海报为输入，重新开始修改（重新开始）
    const handleEditPoster = async (restart: boolean = false) => {
        if (!editPrompt.trim()) {
            setShake('edit');
            showToast('请输入修改内容', 'error');
            return;
        }
        if (!editPoster && !editHasLastResult) {
            setShake('edit');
            showToast('请先上传营销海报', 'error');
            return;
        }
        if (restart && !editPoster) {
            setShake('edit');
            showToast('请先上传营销海报', 'error');
            return;
        }
        setEditLoading(true);
        try {
            // 重新开始：始终以最初上传的原海报为输入；接着修改：未修改过用原海报，修改过则基于上一次结果继续
            const imagePath = restart
                ? (editPoster?.path || '')
                : ((!editHasLastResult && editPoster) ? editPoster.path : undefined);
            const res = await editPosterApi({ prompt: editPrompt.trim(), image_path: imagePath });
            if (res.success) {
                setEditResult({ preview: res.preview, download_url: res.download_url, elapsed: res.elapsed, usage: res.usage || null });
                setEditHasLastResult(true);
                setShowResult(true); // 修改完成后展示新海报预览
                showToast(restart ? `已从原海报重新开始修改！耗时 ${res.elapsed}s` : `海报修改完成！耗时 ${res.elapsed}s`);
            }
        } catch (e: any) {
            showToast('修改失败：' + friendlyApiError(e?.message || '未知错误'), 'error');
        } finally {
            setEditLoading(false);
        }
    };

    const buildPositions = (): Record<string, PctPos> => {
        const pos: Record<string, PctPos> = {};
        if (logo) pos.logo = logoPos;
        if (qr) pos.qr = qrPos;
        if (brand) pos.brand = brandPos;
        return pos;
    };

    // 第一步：AI 生成海报（手动模式生成底图→后续合成；AI 嵌入模式直接生成成品）
    const handleGenerateBase = async () => {
        if (!prompt.trim()) {
            setShake('base'); // 校验未通过：轻摇提示「此路不通」
            showToast('请输入海报描述内容', 'error');
            return;
        }
        if (embedMode === 'ai' && !logo && !qr && !brand) {
            setShake('base');
            showToast('AI 嵌入素材模式请至少上传一个素材（Logo / 二维码 / 品牌图）', 'error');
            return;
        }
        if (!hasKey) {
            setShake('base');
            showToast('请先配置 API Key 再生成海报', 'error');
            setOpen(true);
            return;
        }
        setLoading(true);
        setAction('base');
        setPreview('');
        setShowResult(false); // 重新生成底图时关闭结果预览
        setDownloadUrl('');
        setLastUsage(null);
        setAiBaseId(0);
        setSavePending(false);
        setBaseOptions([]);
        setSelectedBaseIdx(null);
        setTempBaseId('');
        setAiBasePreview('');
        setStep1('pending');
        setStep2('pending');
        setStep1('running');

        try {
            const res = await generatePoster({
                prompt: prompt.trim(),
                logo_path: embedMode === 'ai' ? (logo?.path || '') : '',
                qr_path: embedMode === 'ai' ? (qr?.path || '') : '',
                brand_path: embedMode === 'ai' ? (brand?.path || '') : '',
                use_existing_base: false,
                ai_embed: embedMode === 'ai',
                base_image_id: 0,
                num: baseCount,
                positions: {},
            });
            const taskId = res.task_id;
            let finished = false;
            while (!finished) {
                await new Promise((r) => setTimeout(r, 1500));
                const progress = await getPosterProgress(taskId);
                if (progress.status === 'completed') {
                    finished = true;
                    setStep1('done');
                    setStep2('done');
                    if (progress.result) {
                        const previews = progress.result.base_previews || [];
                        const ids = progress.result.temp_base_ids || [];
                        const dlUrls = progress.result.base_download_urls || [];
                        const options = previews.map((p, i) => ({ preview: p, tempBaseId: ids[i] || '', downloadUrl: dlUrls[i] || '' }));
                        setBaseOptions(options);
                        setSelectedBaseIdx(null);
                        setTempBaseId('');
                        setAiBasePreview('');
                        setAiBaseId(0);
                        setSavePending(false);
                        setElapsed(progress.result.elapsed);
                        setLastUsage(progress.result.usage || null);
                        recordUsed();
                        if (options.length > 0) {
                            showToast(embedMode === 'ai' ? `海报生成成功！共 ${options.length} 张方案，请选择一张` : `海报底图生成成功！共 ${options.length} 张方案，请选择一张`);
                        } else {
                            // 兼容单张结果：直接展示
                            setAiBasePreview(progress.result.preview || '');
                            setTempBaseId(progress.result.temp_base_id || '');
                            if (embedMode === 'ai') {
                                // AI 嵌入素材模式：单张结果即成品海报，直接展示并允许下载
                                setPreview(progress.result.preview || '');
                                setDownloadUrl(progress.result.download_url || '');
                                setShowResult(true);
                                setSavePending(false);
                            } else {
                                setSavePending(true);
                            }
                            showToast(`${embedMode === 'ai' ? '海报生成成功' : '海报底图生成成功'}！耗时 ${progress.result.elapsed}s · 本次消耗 ${progress.result.usage?.total_tokens ?? 0} Tokens`);
                        }
                        // 进入合成阶段前的「选择底图」流程（仅手动嵌入素材模式需要后续合成）
                        if (embedMode !== 'ai') {
                            setPhase('compose');
                        }
                    }
                } else if (progress.status === 'failed') {
                    finished = true;
                    showToast('底图生成失败：' + friendlyApiError(progress.error || '未知错误'), 'error');
                }
            }
        } catch (err: any) {
            showToast('请求失败：' + friendlyApiError(err?.message || '未知错误'), 'error');
        } finally {
            setLoading(false);
            setAction(null);
        }
    };

    // 从多张底图方案中选择一张
    const handleSelectBase = (idx: number) => {
        const opt = baseOptions[idx];
        if (!opt) return;
        setSelectedBaseIdx(idx);
        setTempBaseId(opt.tempBaseId);
        setAiBasePreview(opt.preview);
        setAiBaseId(0);          // 重新选择后需重新决定是否保存
        setShowResult(false);
        if (embedMode === 'ai') {
            // AI 嵌入素材模式：所选方案即最终成品海报，直接展示并允许下载
            setPreview(opt.preview);
            setDownloadUrl(opt.downloadUrl);
            setShowResult(true);
            setSavePending(false);
        } else {
            setSavePending(true);    // 强制选择是否保存到图片库
        }
    };

    // 返回重新选择底图
    const handleReselectBase = () => {
        setSelectedBaseIdx(null);
        setTempBaseId('');
        setAiBasePreview('');
        setAiBaseId(0);
        setSavePending(false);
        setShowResult(false);
    };

    // 用户选择「保存到图片库」：将本次 AI 底图入库（供后续「使用现有底图」）
    const handleConfirmSaveBase = async () => {
        setSaving(true);
        try {
            const blob = await (await fetch(aiBasePreview)).blob();
            const finalLabel = saveLabelMode === 'new' ? saveLabelNew.trim() : saveLabel.trim();
            const res = await savePosterBase(blob, `海报底图_${new Date().toISOString().slice(0, 10)}`, finalLabel);
            setAiBaseId(res.image?.id || 0);
            setSavePending(false);
            setSaveLabel('');
            setSaveLabelMode('select');
            setSaveLabelNew('');
            showToast('底图已保存到图片库');
        } catch (e: any) {
            showToast('保存失败: ' + (e?.message || '未知错误'), 'error');
        } finally {
            setSaving(false);
        }
    };

    // 用户选择「不保存」：仅本次合成使用（临时底图）
    const handleSkipSaveBase = () => {
        setSavePending(false);
        setSaveLabel('');
        setSaveLabelMode('select');
        setSaveLabelNew('');
        showToast('已选择不保存底图');
    };

    // 第二步：按预览位置合成最终海报（AI 底图 / 现有底图 + 素材 + 位置）
    const handleCompose = async () => {
        const baseId = useExistingBase ? (selectedBase?.id || 0) : aiBaseId;
        if (useExistingBase && !selectedBase) {
            setShake('compose');
            showToast('请先选择现有底图', 'error');
            return;
        }
        // AI 模式：已入库（aiBaseId）或持有临时底图（tempBaseId）均可合成
        if (!useExistingBase && !baseId && !tempBaseId) {
            setShake('compose');
            showToast('请先生成海报底图', 'error');
            return;
        }
        setLoading(true);
        setAction('compose');
        setPreview('');
        setShowResult(false); // 重新合成前先关闭旧结果
        setDownloadUrl('');
        setLastUsage(null);
        setStep1('pending');
        setStep2('pending');
        setStep2('running');

        try {
            const res = await generatePoster({
                prompt: '',
                logo_path: logo?.path || '',
                qr_path: qr?.path || '',
                brand_path: brand?.path || '',
                use_existing_base: true,
                base_image_id: baseId,
                temp_base_id: !useExistingBase && !baseId ? tempBaseId : '',
                positions: buildPositions(),
            });
            const taskId = res.task_id;
            let finished = false;
            while (!finished) {
                await new Promise((r) => setTimeout(r, 1500));
                const progress = await getPosterProgress(taskId);
                if (progress.status === 'completed') {
                    finished = true;
                    setStep1('done');
                    setStep2('done');
                    if (progress.result) {
                        setPreview(progress.result.preview);
                        setShowResult(true); // 合成成功后展示结果预览
                        setDownloadUrl(progress.result.download_url);
                        setElapsed(progress.result.elapsed);
                        setLastUsage(progress.result.usage || null);
                    }
                    showToast(`海报生成成功！耗时 ${progress.result?.elapsed || 0}s`);
                } else if (progress.status === 'failed') {
                    finished = true;
                    showToast('生成失败：' + friendlyApiError(progress.error || '未知错误'), 'error');
                }
            }
        } catch (err: any) {
            showToast('请求失败：' + friendlyApiError(err?.message || '未知错误'), 'error');
        } finally {
            setLoading(false);
            setAction(null);
        }
    };

    const stepStyle = (status: 'pending' | 'running' | 'done') => {
        const colors = {
            pending: { bg: '#e0e0e0', color: '#999' },
            running: { bg: '#4f6ef7', color: '#fff' },
            done: { bg: '#27ae60', color: '#fff' },
        };
        const c = colors[status];
        return {
            width: 20, height: 20, borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 10,
            flexShrink: 0, background: c.bg, color: c.color,
        };
    };

    // 预览区底图：选用现有底图 → 图片库底图；AI 模式 → 刚生成并入库的底图
    const previewBaseSrc = useExistingBase
        ? (selectedBase ? authedFileUrl(selectedBase.file_url) : '')
        : (phase === 'compose' ? aiBasePreview : '');

    // 正在从多张底图方案中挑选（此时预览高度受限于「请先选择一张底图」按钮位置）
    const isSelectingBase = baseMode === 'ai' && baseOptions.length > 0 && selectedBaseIdx === null;
    const lastEditElapsed = editResult?.elapsed ?? 0;

    // 使用现有底图：按分类筛选后的底图列表
    const visibleBases = useExistingBase && baseLabelFilter
        ? bases.filter((b) => (b.label || '') === baseLabelFilter)
        : bases;

    // 测量：预览最大高度 = 「请先选择一张底图」按钮底部 - 预览区顶部
    useEffect(() => {
        const update = () => {
            const btn = composeBtnRef.current;
            const box = previewRef.current;
            if (!btn || !box) return;
            const boxTop = box.getBoundingClientRect().top;
            const btnBottom = btn.getBoundingClientRect().bottom;
            setPreviewMaxH(Math.max(300, Math.round(btnBottom - boxTop)));
        };
        if (isSelectingBase) {
            update();
            window.addEventListener('resize', update);
            return () => window.removeEventListener('resize', update);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSelectingBase, phase]);

    return (
        <div className={`ui-page ui-page-purple ${leaving ? 'ui-leave' : 'ui-reveal'}`} style={{ minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
            <Header />
            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '24px 32px', display: 'grid', gridTemplateColumns: '3fr 7fr', gap: 24 }}>
                {/* LEFT */}
                <div>
                    {/* 使用现有底图开关 */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>🖼️ 底图来源</span>
                            <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', width: 260, height: 34, background: '#eef0f5', borderRadius: 17, overflow: 'hidden', userSelect: 'none', flexShrink: 0 }}>
                                <div className="ui-seg-thumb" style={{ position: 'absolute', top: 3, bottom: 3, left: 0, transform: `translateX(${({ ai: 0, existing: 1, edit: 2 } as Record<'ai' | 'existing' | 'edit', number>)[baseMode] * 100}%)`, width: 'calc(100% / 3)', background: '#8b5cf6', borderRadius: 14 }} />
                                {([
                                    { key: 'ai', label: 'AI 生成底图' },
                                    { key: 'existing', label: '使用现有底图' },
                                    { key: 'edit', label: '修改海报' },
                                ] as { key: 'ai' | 'existing' | 'edit'; label: string }[]).map((m) => (
                                    <div
                                        key={m.key}
                                        onClick={() => handleModeChange(m.key)}
                                        title={`当前：${m.label}`}
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: baseMode === m.key ? '#fff' : '#636e72', position: 'relative', zIndex: 1, transition: 'color 0.25s', cursor: 'pointer' }}
                                    >
                                        {m.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {useExistingBase ? (
                            bases.length === 0 ? (
                                <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f8f9ff', fontSize: 12, color: '#636e72', lineHeight: 1.7 }}>
                                    暂无可用底图，请先在「<b style={{ color: '#8b5cf6' }}>图片库</b>」上传海报底图，或在生成后选择保留本次底图。
                                </div>
                            ) : (
                                <div>
                                    {/* 当前选择 + 展开/收起 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {selectedBase ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                                {selectedBase.thumbnail ? (
                                                    <img src={selectedBase.thumbnail} alt={selectedBase.name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '2px solid #8b5cf6', flexShrink: 0 }} />
                                                ) : (
                                                    <div style={{ width: 44, height: 44, borderRadius: 6, background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🖼️</div>
                                                )}
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3436', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedBase.name}</div>
                                                    <div style={{ fontSize: 11, color: '#999' }}>当前底图</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <span style={{ flex: 1, fontSize: 13, color: '#999' }}>尚未选择底图</span>
                                        )}
                                        <button
                                            onClick={() => setExpandBase(!expandBase)}
                                            className="ui-btn-ghost"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 8, border: '1px solid #8b5cf6', background: '#f3f0ff', color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        >
                                            {expandBase ? '收起 ▲' : '选择底图 ▾'}
                                        </button>
                                    </div>
                                    {/* 展开的底图选择区（手风琴平滑展开） */}
                                    <div className={`ui-acc${expandBase ? ' ui-acc-open' : ''}`}>
                                        <div className="ui-acc-inner" style={{ marginTop: 12 }}>
                                            {/* 分类筛选 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                <span style={{ fontSize: 12, color: '#636e72' }}>按分类筛选：</span>
                                                <select
                                                    value={baseLabelFilter}
                                                    onChange={(e) => setBaseLabelFilter(e.target.value)}
                                                    className="ui-input"
                                                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', color: '#2d3436' }}
                                                >
                                                    <option value="">全部分类</option>
                                                    {baseLabels.map((l) => (
                                                        <option key={l} value={l}>{l}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {visibleBases.length === 0 ? (
                                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#999', lineHeight: 1.8 }}>该分类下暂无底图，可切换分类或到「图片库」上传新底图</div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                                    {visibleBases.map((b) => (
                                                        <div
                                                            key={b.id}
                                                            onClick={() => { setSelectedBase(b); setExpandBase(false); }}
                                                            className="ui-tpl"
                                                            style={{ border: `2px solid ${selectedBase?.id === b.id ? '#8b5cf6' : '#e0e3eb'}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', position: 'relative', boxShadow: selectedBase?.id === b.id ? '0 0 0 3px rgba(139,92,246,0.2)' : 'none' }}
                                                        >
                                                            {selectedBase?.id === b.id && (
                                                                <div style={{ position: 'absolute', top: 4, right: 6, background: '#8b5cf6', color: '#fff', width: 20, height: 20, borderRadius: '50%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✓</div>
                                                            )}
                                                            {b.label && (
                                                                <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, background: 'rgba(79,110,247,0.9)', color: '#fff', padding: '1px 6px', borderRadius: 8, maxWidth: '60%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
                                                            )}
                                                            {b.thumbnail ? (
                                                                <img src={b.thumbnail} alt={b.name} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                                                            ) : (
                                                                <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 22, background: '#f0f2f5' }}>🖼️</div>
                                                            )}
                                                            <div style={{ fontSize: 10, color: '#636e72', textAlign: 'center', padding: '4px 0' }}>{b.name}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : baseMode === 'edit' ? (
                            <p style={{ fontSize: 12, color: '#999', lineHeight: 1.7 }}>
                                💡 上传一张现有营销海报，输入修改要求后由 AI 生成修改后的新海报，可多次迭代修改。
                            </p>
                        ) : embedMode === 'ai' ? (
                            <p style={{ fontSize: 12, color: '#999', lineHeight: 1.7 }}>
                                💡 上传 Logo / 二维码 / 品牌图素材，并在描述中说明放置位置，AI 生成时会将素材一并嵌入，直接得到成品海报。
                            </p>
                        ) : (
                            <p style={{ fontSize: 12, color: '#999', lineHeight: 1.7 }}>
                                💡 先生成海报底图，生成后再上传 Logo / 二维码 / 品牌图，并在预览区调整位置与大小后合成。
                            </p>
                        )}
                    </div>

                    {/* 修改现有海报（上传海报 + 提示词迭代修改） */}
                    {baseMode === 'edit' && (
                        <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.06s' } as React.CSSProperties}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>🖼️ 上传营销海报</div>
                            <UploadZone
                                label="营销海报"
                                hint="JPG/PNG"
                                hasImage={!!editPoster}
                                preview={editPoster?.preview || ''}
                                onFiles={handleEditUpload}
                            />
                            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#fff3e0', border: '1px solid #ffe0b2', fontSize: 12, color: '#e65100', lineHeight: 1.7 }}>
                                ⚠️ 素材经 AI 重绘可能发生变形或失真，存在二维码无法扫描、Logo 扭曲等风险。
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 18, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>✏️ 修改内容</div>
                            <textarea
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                className="ui-input ui-caret-rainbow"
                                placeholder="描述要修改的具体内容，例如：把主标题改成「限时5折」，背景换成蓝色渐变，右下角加上「立即抢购」按钮..."
                                style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e3eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 80, outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                <span style={{ fontSize: 11, color: '#aaa' }}>
                                    💡 「接着修改」基于上一次修改结果继续；「重新开始」回到最初上传的原海报。重新上传海报也可从头开始。
                                </span>
                                <span style={{ fontSize: 10, color: editPrompt.trim().length > 300 ? '#e65100' : '#aaa', whiteSpace: 'nowrap', marginLeft: 8 }}>{editPrompt.trim().length} 字</span>
                            </div>
                            {!editHasLastResult ? (
                                <button
                                    onClick={() => handleEditPoster(false)}
                                    disabled={editLoading || !editPrompt.trim() || !editPoster}
                                    className={`${shake === 'edit' ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer`}
                                    onAnimationEnd={() => setShake(null)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: editLoading || !editPrompt.trim() || !editPoster ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit', width: '100%', marginTop: 14, background: editLoading || !editPrompt.trim() || !editPoster ? '#b0bec5' : '#8b5cf6', color: '#fff' }}
                                >
                                    {editLoading ? '⏳ 修改中...' : '🎨 生成修改后的海报'}
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                                    <button
                                        onClick={() => handleEditPoster(false)}
                                        disabled={editLoading || !editPrompt.trim()}
                                        className={`${shake === 'edit' ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer`}
                                        onAnimationEnd={() => setShake(null)}
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: editLoading || !editPrompt.trim() ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit', background: editLoading || !editPrompt.trim() ? '#b0bec5' : '#8b5cf6', color: '#fff' }}
                                    >
                                        {editLoading ? '⏳ 修改中...' : '🔁 接着修改'}
                                    </button>
                                    <button
                                        onClick={() => handleEditPoster(true)}
                                        disabled={editLoading || !editPrompt.trim() || !editPoster}
                                        className="ui-btn-ghost"
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: editLoading || !editPrompt.trim() || !editPoster ? 'not-allowed' : 'pointer', border: '1px solid #8b5cf6', fontFamily: 'inherit', background: '#f3f0ff', color: '#8b5cf6' }}
                                    >
                                        {editLoading ? '⏳ 修改中...' : '↩️ 重新开始'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 描述海报内容（AI 模式，始终显示：生成底图后可修改描述重新生成） */}
                    {baseMode === 'ai' && (
                        <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.12s' } as React.CSSProperties}>
                            {/* 素材嵌入方式切换：手动 / AI */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ position: 'relative', display: 'flex', width: '100%', height: 38, background: '#eef0f5', borderRadius: 19, overflow: 'hidden', userSelect: 'none' }}>
                                    <div className="ui-seg-thumb" style={{ position: 'absolute', top: 3, bottom: 3, left: 0, transform: `translateX(${embedMode === 'manual' ? 0 : 100}%)`, width: '50%', background: '#8b5cf6', borderRadius: 16 }} />
                                    {([
                                        { key: 'manual', label: '✋ 手动嵌入素材' },
                                        { key: 'ai', label: '🤖 AI 嵌入素材' },
                                    ] as { key: 'manual' | 'ai'; label: string }[]).map((m) => (
                                        <div
                                            key={m.key}
                                            onClick={() => {
                                                if (embedMode === m.key) return;
                                                // 保存当前嵌入方式的最新数据，切换后恢复目标方式的历史数据（已生成底图等保留）
                                                saveEmbedState(embedMode);
                                                setEmbedMode(m.key);
                                                restoreEmbedState(m.key);
                                            }}
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: embedMode === m.key ? '#fff' : '#636e72', position: 'relative', zIndex: 1, transition: 'color 0.25s', cursor: 'pointer' }}
                                        >
                                            {m.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{embedMode === 'ai' ? '✏️ 描述海报风格与素材位置' : '✏️ 描述海报底图风格'}</div>
                                <label style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, color: '#636e72' }}>
                                    <span>生成数量</span>
                                    <select
                                        value={baseCount}
                                        onChange={(e) => setBaseCount(Number(e.target.value))}
                                        className="ui-input"
                                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', color: '#2d3436' }}
                                    >
                                        {[1, 2, 3, 4].map((n) => (
                                            <option key={n} value={n}>{n} 张</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="ui-input"
                                rows={3}
                                placeholder={embedMode === 'ai'
                                    ? "描述海报风格，并说明每个素材的放置位置，例如：\n\n高端护肤品中秋海报，星空渐变背景，Logo 放在左上角，二维码放在右上角，品牌图放在底部居中..."
                                    : "描述您想要的海报底图风格，例如：\n\n一张高端护肤品海报底图，背景为渐变星空紫色调..."}
                                style={{
                                    width: '100%', padding: '12px 14px', border: '1px solid #e0e3eb', borderRadius: 8,
                                    fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 84,
                                    outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                                {embedMode === 'ai'
                                    ? '💡 请在上方描述中说明每个素材的放置位置（如：Logo 放左上角、二维码放右上角、品牌图放底部居中），生成时会一并嵌入。'
                                    : (phase === 'compose' ? '💡 修改描述后可点击「重新生成海报底图」' : '💡 描述越详细，生成效果越好')}
                            </div>
                        </div>
                    )}

                    {/* 生成底图按钮（AI 模式·手动嵌入：首次生成 / 修改描述后重新生成） */}
                    {baseMode === 'ai' && embedMode === 'manual' && (
                        <button
                            onClick={handleGenerateBase}
                            disabled={loading}
                            className={`${shake === 'base' ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer`}
                            onAnimationEnd={() => setShake(null)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit',
                                width: '100%', background: loading ? '#b0bec5' : '#8b5cf6', color: '#fff',
                            }}
                        >
                            {loading ? '⏳ 生成底图中...' : phase === 'compose' ? '🔄 重新生成海报底图' : '🎨 生成营销海报底图'}
                        </button>
                    )}

                    {/* 素材上传（生成底图后 / 使用现有底图 / AI 嵌入素材模式生成前） */}
                    {(baseMode === 'existing' || (baseMode === 'ai' && phase === 'compose') || (baseMode === 'ai' && embedMode === 'ai')) && (
                        <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.18s' } as React.CSSProperties}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>📎 上传素材</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <UploadZone
                                    label="Logo"
                                    hint="JPG/PNG"
                                    hasImage={!!logo}
                                    preview={logo?.preview || ''}
                                    onFiles={(f) => handleUpload(f, 'upload-logo', setLogo)}
                                    style={{ padding: logo ? 6 : '24px 16px' }}
                                >
                                    {!(baseMode === 'ai' && embedMode === 'ai') && (
                                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4, opacity: 0.8 }}>↖ 左上角</span>
                                    )}
                                </UploadZone>
                                <UploadZone
                                    label="二维码"
                                    hint="建议 524×240"
                                    hasImage={!!qr}
                                    preview={qr?.preview || ''}
                                    onFiles={(f) => handleUpload(f, 'upload-qr', setQr)}
                                    style={{ padding: qr ? 6 : '24px 16px' }}
                                >
                                    {!(baseMode === 'ai' && embedMode === 'ai') && (
                                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4, opacity: 0.8 }}>↗ 右上角</span>
                                    )}
                                </UploadZone>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <UploadZone
                                    label="品牌图"
                                    hint="JPG/PNG"
                                    hasImage={!!brand}
                                    preview={brand?.preview || ''}
                                    onFiles={(f) => handleUpload(f, 'upload-brand', setBrand)}
                                >
                                    {!(baseMode === 'ai' && embedMode === 'ai') && (
                                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4, opacity: 0.8 }}>↓ 底部居中</span>
                                    )}
                                </UploadZone>
                            </div>
                        </div>
                    )}

                    {/* 生成海报按钮（AI 嵌入素材模式：位于上传素材模块下方） */}
                    {baseMode === 'ai' && embedMode === 'ai' && (
                        <button
                            onClick={handleGenerateBase}
                            disabled={loading}
                            className={`${shake === 'base' ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer`}
                            onAnimationEnd={() => setShake(null)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit',
                                width: '100%', background: loading ? '#b0bec5' : '#8b5cf6', color: '#fff',
                            }}
                        >
                            {loading ? '⏳ 生成中（嵌入素材）...' : '🎨 生成海报（AI 嵌入素材）'}
                        </button>
                    )}

                    {baseMode !== 'existing' && !hasKey && (
                        <div
                            onClick={() => setOpen(true)}
                            style={{
                                marginBottom: 12, background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 8,
                                padding: '10px 14px', fontSize: 12, color: '#e65100', cursor: 'pointer', lineHeight: 1.6,
                            }}
                        >
                            ⚠️ 尚未配置 API Key，AI 生成底图功能暂不可用。点击前往「API 设置」配置 →
                        </div>
                    )}
                    {/* 合成按钮（已有底图后 / 使用现有底图模式；仅手动嵌入素材模式需要合成） */}
                    {(baseMode === 'existing' || (baseMode === 'ai' && phase === 'compose' && embedMode === 'manual')) && (
                        <button
                            ref={composeBtnRef}
                            onClick={handleCompose}
                            disabled={loading || savePending || (!useExistingBase && selectedBaseIdx === null)}
                            className={`${shake === 'compose' ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer`}
                            onAnimationEnd={() => setShake(null)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                cursor: loading || savePending || (!useExistingBase && selectedBaseIdx === null) ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit',
                                width: '100%', background: loading || savePending || (!useExistingBase && selectedBaseIdx === null) ? '#b0bec5' : '#8b5cf6', color: '#fff',
                            }}
                        >
                            {!useExistingBase && selectedBaseIdx === null ? '请先选择一张底图' : savePending ? '请先选择是否保存底图' : loading ? '⏳ 提交中...' : '🚀 按预览位置生成海报'}
                        </button>
                    )}
                </div>

                {/* RIGHT：预览区 */}
                <div style={{ position: 'sticky', top: 24 }}>
                    {/* 素材嵌入方式优缺点说明（AI 生成底图模式，显示在预览图上方） */}
                    {baseMode === 'ai' && (
                        <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: embedMode === 'manual' ? '#f8f9ff' : '#f3f0ff', border: `1px solid ${embedMode === 'manual' ? '#e0e3ff' : '#e4dbff'}`, fontSize: 12, color: '#636e72', lineHeight: 1.8, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: embedMode === 'manual' ? '#4f6ef7' : '#8b5cf6' }}>
                                {embedMode === 'manual' ? '✋ 手动嵌入素材' : '🤖 AI 嵌入素材'}
                            </div>
                            {embedMode === 'manual' ? (
                                <>
                                    <div><span style={{ color: '#27ae60', fontWeight: 600 }}>✅ 优点：</span>素材位置可自由拖拽、精准可控，可随时隐藏/移除单个素材；程序直接合成、不经 AI 修改，二维码可正常扫描、Logo 不变形；更省 Token——底图按提示词文本计费，素材不上传、本地合成不花钱；底图可保存到图片库复用，下次直接选用不花钱</div>
                                    <div style={{ marginTop: 2 }}><span style={{ color: '#e67e22', fontWeight: 600 }}>⚠️ 缺点：</span>AI 生成底图不预留素材位置，可能与底图重叠，需手动调整；素材程序平铺叠加、不经 AI 光影处理，与底图透视/光影可能不协调；需「选底图 → 合成」两步流程</div>
                                </>
                            ) : (
                                <>
                                    <div><span style={{ color: '#27ae60', fontWeight: 600 }}>✅ 优点：</span>AI 统筹素材与画面整体构图、主动预留位置并做光影融合（投影/描边/光晕），成品更和谐统一；一次生成即得成品海报，无需二次合成，操作更简单</div>
                                    <div style={{ marginTop: 2 }}><span style={{ color: '#e67e22', fontWeight: 600 }}>⚠️ 缺点：</span>更耗 Token——素材图作为输入图上传计费（单张近万 input tokens），素材越多、生成方案越多花费越高；素材经 AI 重绘可能变形失真，存在二维码无法扫描、Logo 扭曲等风险；素材位置靠描述控制，生成后不能微调，不满意只能重新生成</div>
                                </>
                            )}
                        </div>
                    )}
                    <div
                        ref={previewRef}
                        className="ui-canvas-bg"
                        style={{
                            borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)',
                            overflow: 'hidden', position: 'relative',
                            maxHeight: isSelectingBase && previewMaxH ? previewMaxH : undefined,
                            minHeight: isSelectingBase ? undefined : 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {/* 最终结果优先展示（可手动关闭）；否则修改海报结果/多张底图方案供选择；再展示底图 + 可拖拽素材 */}
                        {showResult && preview ? (
                            <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8, boxSizing: 'border-box' }}>
                                <img src={preview} alt="poster preview" style={{ maxWidth: '100%', maxHeight: '78vh', display: 'block', borderRadius: 6 }} />
                                <button
                                    onClick={() => setShowResult(false)}
                                    title="关闭预览，返回编辑素材位置"
                                    className="ui-btn-ghost"
                                    style={{ padding: '6px 18px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                                >
                                    ✕ 关闭预览
                                </button>
                            </div>
                        ) : baseMode === 'edit' ? (
                            showResult && editResult ? (
                                <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8, boxSizing: 'border-box' }}>
                                    <img src={editResult.preview} alt="修改后海报" style={{ maxWidth: '100%', maxHeight: '78vh', display: 'block', borderRadius: 6 }} />
                                    <button
                                        onClick={() => setShowResult(false)}
                                        title="关闭预览"
                                        className="ui-btn-ghost"
                                        style={{ padding: '6px 18px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                                    >
                                        ✕ 关闭预览
                                    </button>
                                </div>
                            ) : editPoster ? (
                                <div style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '520/1150', overflow: 'hidden', borderRadius: 8 }}>
                                    <img src={editPoster.preview} alt="原海报" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 4 }}>原海报（未修改）</div>
                                </div>
                            ) : (
                                <div style={{ color: '#636e72', fontSize: 13, textAlign: 'center', padding: '40px 20px' }}>
                                    <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.5 }}>🖼️</div>
                                    <p>上传营销海报并输入修改内容后，<br />这里将展示修改后的新海报</p>
                                </div>
                            )
                        ) : isSelectingBase ? (
                            <div style={{ width: '100%', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3436', marginBottom: 10, flexShrink: 0 }}>🖼️ 共生成 {baseOptions.length} 张底图方案，点击选择一张满意</div>
                                <div style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'stretch', justifyContent: 'center' }}>
                                    {baseOptions.map((opt, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectBase(idx)}
                                            className="ui-tpl"
                                            style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: '2px solid #e0e3eb', transition: 'border 0.2s', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', flex: '0 0 calc(25% - 7.5px)', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <img src={opt.preview} alt={`底图方案 ${idx + 1}`} style={{ width: '100%', height: 'auto', display: 'block' }} />
                                            <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
                                                方案 {idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : previewBaseSrc ? (
                            <div style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '520/1150', overflow: 'hidden', borderRadius: 8 }}>
                                <img src={previewBaseSrc} alt="base" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                {logo && <PosterOverlay label="Logo" src={logo.preview} pct={logoPos} onChange={setLogoPos} zIndex={3} />}
                                {qr && <PosterOverlay label="二维码" src={qr.preview} pct={qrPos} onChange={setQrPos} zIndex={4} />}
                                {brand && <PosterOverlay label="品牌图" src={brand.preview} pct={brandPos} onChange={setBrandPos} zIndex={5} />}
                                <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 4 }}>
                                    拖动素材调整位置 · 右下角手柄缩放
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: '#636e72', fontSize: 13, textAlign: 'center', padding: '40px 20px' }}>
                                <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.5 }}>🎨</div>
                                <p>{useExistingBase ? '选择底图后，可在预览区拖拽 Logo / 二维码 / 品牌图位置' : '填写描述内容后\n点击「生成营销海报底图」'}</p>
                            </div>
                        )}
                        {loading && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, borderRadius: 10, padding: 20 }}>
                                <div className="ui-spinner" style={{ width: 40, height: 40, border: '3px solid rgba(139,92,246,0.15)', borderTopColor: '#8b5cf6', marginBottom: 14 }} />
                                <DecodeText
                                    text={action === 'compose' ? '正在按预览位置合成…' : embedMode === 'ai' ? 'AI 正在生成海报（嵌入素材）…' : 'AI 正在生成海报…'}
                                    style={{ fontSize: 14, color: '#2d3436', fontWeight: 600, marginBottom: 8 }}
                                />
                                {!useExistingBase && (
                                    <div style={{ textAlign: 'left', fontSize: 12, color: '#636e72', lineHeight: 1.8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                                            <span style={stepStyle(step1)}>1</span>
                                            <span style={{ fontSize: 12, color: step1 === 'running' ? '#8b5cf6' : undefined, fontWeight: step1 === 'running' ? 600 : 400 }}>生成海报底图</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                                            <span style={stepStyle(step2)}>2</span>
                                            <span style={{ fontSize: 12, color: step2 === 'running' ? '#8b5cf6' : undefined, fontWeight: step2 === 'running' ? 600 : 400 }}>合成素材</span>
                                        </div>
                                    </div>
                                )}
                                <div className="ui-skeleton" style={{ width: 160, height: 8, borderRadius: 999, marginTop: 12 }} />
                            </div>
                        )}

                        {editLoading && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, borderRadius: 10, padding: 20 }}>
                                <div className="ui-spinner" style={{ width: 40, height: 40, border: '3px solid rgba(139,92,246,0.15)', borderTopColor: '#8b5cf6', marginBottom: 14 }} />
                                <DecodeText text="正在按提示词修改海报…" style={{ fontSize: 14, color: '#2d3436', fontWeight: 600, marginBottom: 12 }} />
                                <div className="ui-skeleton" style={{ width: 160, height: 8, borderRadius: 999 }} />
                            </div>
                        )}
                    </div>

                    {/* 已选择底图后可返回重新选择 */}
                    {!useExistingBase && baseOptions.length > 0 && selectedBaseIdx !== null && (
                        <div style={{ marginTop: 8, textAlign: 'center' }}>
                            <button
                                onClick={handleReselectBase}
                                style={{ border: 'none', background: 'transparent', color: '#8b5cf6', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 10px' }}
                            >
                                🔄 返回重新选择底图
                            </button>
                        </div>
                    )}

                    {/* 底图生成后强制选择是否保存到图片库（内嵌选择栏） */}
                    {savePending && (
                        <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3436', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                💾 是否将本次 AI 生成的底图保存到图片库？
                            </div>
                            <p style={{ fontSize: 11, color: '#636e72', lineHeight: 1.7, marginBottom: 12 }}>
                                保存后可长期用于「使用现有底图」；不保存仍可在本次生成中合成海报，但不会进入图片库。
                            </p>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 12, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>分类（可选，选择已有或新增）</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <select
                                        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                                        className="ui-input"
                                        value={saveLabelMode === 'new' ? '__new__' : saveLabel}
                                        onChange={(e) => {
                                            if (e.target.value === '__new__') {
                                                setSaveLabelMode('new');
                                                setSaveLabel('');
                                            } else {
                                                setSaveLabelMode('select');
                                                setSaveLabel(e.target.value);
                                            }
                                        }}
                                    >
                                        <option value="">未分类</option>
                                        {posterLabels.map((l) => (
                                            <option key={l} value={l}>{l}</option>
                                        ))}
                                        <option value="__new__">＋ 新增分类…</option>
                                    </select>
                                    {saveLabelMode === 'new' && (
                                        <input
                                            autoFocus
                                            className="ui-input"
                                            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                                            placeholder="输入新分类名称"
                                            value={saveLabelNew}
                                            onChange={(e) => setSaveLabelNew(e.target.value)}
                                        />
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={handleSkipSaveBase}
                                    disabled={saving}
                                    className="ui-btn-ghost"
                                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    不保存
                                </button>
                                <button
                                    onClick={handleConfirmSaveBase}
                                    disabled={saving}
                                    className="ui-btn-primary"
                                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: saving ? '#b0bec5' : '#8b5cf6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                                >
                                    {saving ? '保存中…' : '保存到图片库'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#636e72', marginTop: 10, padding: '0 4px', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {baseMode === 'edit'
                                ? (editResult ? `✅ 修改完成 · 耗时${editResult.elapsed}s · 520×1150` : `准备就绪${lastEditElapsed > 0 ? ` · ⏱️ 上次耗时${lastEditElapsed}s` : ''}`)
                                : (preview ? `✅ 生成完成 · 耗时${elapsed}s · 520×1150` : `准备就绪${elapsed > 0 ? ` · ⏱️ 上次耗时${elapsed}s` : ''}`)}
                            <TokenUsage usage={baseMode === 'edit' ? (editResult?.usage ?? null) : lastUsage} accent="#8b5cf6" />
                        </span>
                        {baseMode === 'edit' && editResult ? (
                            <a href={authedFileUrl(editResult.download_url)} download style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8, background: '#8b5cf6', color: '#fff', textDecoration: 'none' }}>
                                ⬇ 下载修改后海报
                            </a>
                        ) : downloadUrl && (
                            <a href={authedFileUrl(downloadUrl)} download style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8, background: '#8b5cf6', color: '#fff', textDecoration: 'none' }}>
                                ⬇ 下载海报
                            </a>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
