import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import UploadZone from '../components/UploadZone';
import TokenUsage from '../components/TokenUsage';
import DecodeText from '../components/DecodeText';
import { setLoadingFavicon, applyPageTheme } from '../ui-meta';
import { useToast } from '../components/Toast';
import { useApiConfig } from '../context/ApiConfigContext';
import { usePageLeave } from '../hooks/usePageLeave';
import { authedFileUrl } from '../api/api';
import {
    fetchTemplates,
    uploadImage,
    generateEcommerceFinal,
} from '../api/api';
import type { TemplateItem, TextLine, UsageInfo } from '../types';
import '../ui-details.css';

const horizontalDefaults: TextLine[] = [
    { id: '', text: '528', color: '#ffffff', fontSize: 100, xPct: 4.125, yPct: 81.5, section: 'weight' },
    { id: '', text: 'g', color: '#ffffff', fontSize: 50, xPct: 27.625, yPct: 87.125, section: 'weight' },
    { id: '', text: '味滋源 丹麦风味曲奇饼干', color: '#ffffff', fontSize: 40, xPct: 37.5, yPct: 87.5, section: 'name' },
    { id: '', text: '香甜酥脆 奶香浓郁 经典风味', color: '#000000', fontSize: 25, xPct: 38.75, yPct: 80, section: 'slogan' },
];

const verticalDefaults: TextLine[] = [
    { id: '', text: '东北大米', color: '#000000', fontSize: 65, xPct: 6.25, yPct: 25.6, section: 'name' },
    { id: '', text: '5', color: '#ffffff', fontSize: 110, xPct: 8.75, yPct: 85, section: 'weight' },
    { id: '', text: 'KG', color: '#ffffff', fontSize: 30, xPct: 18.125, yPct: 92.5, section: 'weight' },
    { id: '', text: '邻家饭香、有凤来仪', color: '#ffdd00', fontSize: 45, xPct: 35, yPct: 90.6, section: 'slogan' },
    { id: '', text: '黑土种植', color: '#edec70', fontSize: 40, xPct: 17.5, yPct: 39.4, section: 'tag' },
    { id: '', text: '一年一季', color: '#edec70', fontSize: 40, xPct: 17.5, yPct: 51.9, section: 'tag' },
    { id: '', text: '鸭稻共生', color: '#edec70', fontSize: 40, xPct: 17.5, yPct: 64.4, section: 'tag' },
];

let blockIdGen = 0;



// ========== EcommerceCanvas ==========
const EcommerceCanvas = React.forwardRef<HTMLDivElement, {
    canvasDisplaySize: React.MutableRefObject<{ w: number; h: number }>;
    selectedTpl: TemplateItem | undefined;
    product: { path: string; preview: string } | null;
    logo: { path: string; preview: string } | null;
    textBlocks: TextLine[];
    activeBlockIdx: number;
    setActiveBlockIdx: (idx: number) => void;
    updateBlock: (idx: number, updates: Partial<TextLine>) => void;
    loading: boolean;
    orientation: 'vertical' | 'horizontal';
    onInfoChange?: (text: string) => void;
}>((props, ref) => {
    const {
        canvasDisplaySize, selectedTpl, product, logo,
        onInfoChange, orientation,
        textBlocks, activeBlockIdx, setActiveBlockIdx, updateBlock, loading,
    } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const [displaySize, setDisplaySize] = useState({ w: 500, h: 500 });
    const [productRatio, setProductRatio] = useState<number | null>(null);
    const [logoRatio, setLogoRatio] = useState<number | null>(null);

    // 百分比默认位置（相对于 800×800 输出尺寸）
    const getDefaultProductPct = () => {
        if (orientation === 'vertical') {
            return { xPct: 48.125, yPct: 1.625, wPct: 48.25, hPct: 85.625 };
        }
        return { xPct: 5.625, yPct: 13.625, wPct: 87.625, hPct: 63.875 };
    };
    const getDefaultLogoPct = () => {
        if (orientation === 'vertical') {
            return { xPct: 1.875, yPct: 2.375, wPct: 35.5, hPct: 12.375 };
        }
        return { xPct: 5.375, yPct: 2.875, wPct: 27.375, hPct: 13.5 };
    };

    // 使用 ref 保持 Image 引用，防止被 GC 回收导致 onload 不触发
    const imgRef = useRef<HTMLImageElement | null>(null);
    useEffect(() => {
        if (!product?.preview) return;
        const img = new Image();
        imgRef.current = img;
        img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) setProductRatio(img.naturalWidth / img.naturalHeight);
        };
        img.onerror = () => { };
        img.src = product.preview;
        return () => { imgRef.current = null; };
    }, [product?.preview]);
    useEffect(() => {
        if (!logo?.preview) return;
        const img = new Image();
        imgRef.current = img;
        img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) setLogoRatio(img.naturalWidth / img.naturalHeight);
        };
        img.onerror = () => { };
        img.src = logo.preview;
        return () => { imgRef.current = null; };
    }, [logo?.preview]);

    // logo 位置：保持宽度，按比例调整高度
    const logoPct = (() => {
        const base = getDefaultLogoPct();
        if (!logoRatio) return base;
        return { ...base, hPct: base.wPct / logoRatio };
    })();

    // product 位置：保持宽度，按比例调整高度
    const productPct = (() => {
        const base = getDefaultProductPct();
        if (!productRatio) return base;
        return { ...base, hPct: base.wPct / productRatio };
    })();

    // 自适应容器尺寸
    useEffect(() => {
        const updateSize = () => {
            const el = containerRef.current;
            if (!el) return;
            const parent = el.parentElement;
            if (!parent) return;
            const pw = parent.clientWidth - 4;
            const ph = parent.clientHeight - 4;
            const ratio = 1;
            let w: number, h: number;
            if (pw / ph > ratio) {
                h = ph;
                w = h * ratio;
            } else {
                w = pw;
                h = w / ratio;
            }
            const newSize = { w: Math.round(w), h: Math.round(h) };
            setDisplaySize(newSize);
            canvasDisplaySize.current = newSize;
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        const observer = new ResizeObserver(updateSize);
        if (containerRef.current?.parentElement) {
            observer.observe(containerRef.current.parentElement);
        }
        return () => {
            window.removeEventListener('resize', updateSize);
            observer.disconnect();
        };
    }, [canvasDisplaySize]);

    return (
        <div
            ref={(el) => {
                (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                if (typeof ref === 'function') ref(el);
                else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            id="ecommerce-canvas"
            style={{
                position: 'relative',
                lineHeight: 0,
                userSelect: 'none',
                flexShrink: 0,
                width: displaySize.w,
                height: displaySize.h,
                overflow: 'hidden',
            }}
        >
            {/* 模板底图 */}
            {selectedTpl ? (
                <img
                    id="ecommerce-canvas-bg"
                    src={selectedTpl.file_url ? authedFileUrl(selectedTpl.file_url) : ''}
                    alt="template"
                    style={{ display: 'block', width: '100%', height: '100%', borderRadius: 4, objectFit: 'cover' }}
                />
            ) : (
                <div style={{ width: '100%', height: '100%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    请选择模板
                </div>
            )}

            {/* 商品 overlay（自适应图片比例） */}
            {product && (
                <PercentOverlay
                    key={`product-${productRatio || '0'}`}
                    id="ecommerce-product-overlay"
                    defaultPct={productPct}
                    containerSize={displaySize}
                    aspectRatio={productRatio ?? undefined}
                    onInfoChange={onInfoChange}
                >
                    <img
                        src={product.preview}
                        alt="product"
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4, pointerEvents: 'none' }}
                    />
                </PercentOverlay>
            )}

            {/* Logo overlay（自适应图片比例，key 变化时强制重建） */}
            {logo && (
                <PercentOverlay
                    key={`logo-${logoRatio || '0'}`}
                    id="ecommerce-logo-overlay"
                    defaultPct={logoPct}
                    containerSize={displaySize}
                    aspectRatio={logoRatio ?? undefined}
                    onInfoChange={onInfoChange}
                >
                    <img
                        src={logo.preview}
                        alt="logo"
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4, pointerEvents: 'none' }}
                    />
                </PercentOverlay>
            )}

            {/* 文字块 */}
            {textBlocks.map((b, idx) => (
                <div
                    key={b.id}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setActiveBlockIdx(idx);
                        const el = e.currentTarget;
                        const dx = e.clientX - el.getBoundingClientRect().left;
                        const dy = e.clientY - el.getBoundingClientRect().top;
                        const parent = el.parentElement!;
                        const pRect = parent.getBoundingClientRect();
                        const updateTextInfo = (px: number, py: number) => {
                            if (onInfoChange) {
                                onInfoChange(`文字 "${b.text}" 坐标(${px},${py}) 字号${b.fontSize}`);
                            }
                        };
                        const onMove = (ev: MouseEvent) => {
                            const pctX = Math.max(0, Math.min(100, ((ev.clientX - pRect.left - dx) / pRect.width) * 100));
                            const pctY = Math.max(0, Math.min(100, ((ev.clientY - pRect.top - dy) / pRect.height) * 100));
                            updateBlock(idx, { xPct: pctX, yPct: pctY });
                            const sz = 800;
                            updateTextInfo(Math.round(pctX / 100 * sz), Math.round(pctY / 100 * sz));
                        };
                        const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                        const sz = 800;
                        updateTextInfo(Math.round(b.xPct / 100 * sz), Math.round(b.yPct / 100 * sz));
                    }}
                    style={{
                        position: 'absolute',
                        left: `${b.xPct}%`,
                        top: `${b.yPct}%`,
                        cursor: 'move',
                        whiteSpace: 'pre-wrap',
                        fontWeight: 700,
                        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        lineHeight: 1.2,
                        color: b.color,
                        fontSize: Math.max(14, Math.round(b.fontSize / 800 * displaySize.w)),
                        outline: idx === activeBlockIdx ? '2px solid #4f6ef7' : 'none',
                        outlineOffset: 2,
                        zIndex: idx === activeBlockIdx ? 5 : 4,
                    }}
                >
                    {b.text}
                </div>
            ))}

            {loading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, borderRadius: 10 }}>
                    <div className="ui-spinner" style={{ width: 40, height: 40, border: '3px solid rgba(79,110,247,0.15)', borderTopColor: '#4f6ef7', marginBottom: 14 }} />
                    <DecodeText text="AI 正在生成中，请稍候…" style={{ fontSize: 13, color: '#636e72', marginBottom: 14 }} />
                    <div className="ui-skeleton" style={{ width: 150, height: 8, borderRadius: 999 }} />
                </div>
            )}
        </div>
    );
});

// ========== PercentOverlay: 基于百分比定位的可拖拽覆盖层 ==========

function PercentOverlay({
    id,
    defaultPct,
    containerSize,
    children,
    aspectRatio: dynamicAspect,
    onInfoChange,
}: {
    id: string;
    defaultPct: { xPct: number; yPct: number; wPct: number; hPct: number };
    containerSize: { w: number; h: number };
    children: React.ReactNode;
    aspectRatio?: number;
    onInfoChange?: (text: string) => void;
}) {
    const [pct, setPct] = useState(defaultPct);
    const dragging = useRef(false);
    const resizing = useRef(false);
    const start = useRef({ x: 0, y: 0, lPct: 0, tPct: 0, wPct: 0, hPct: 0 });
    const aspectRatio = dynamicAspect || (defaultPct.wPct / defaultPct.hPct);

    const updateInfo = (p: typeof pct) => {
        if (onInfoChange) {
            const label = id?.includes('logo') ? 'Logo' : '商品图';
            const sz = 800;
            const px = Math.round(p.xPct / 100 * sz);
            const py = Math.round(p.yPct / 100 * sz);
            const pw = Math.round(p.wPct / 100 * sz);
            const ph = Math.round(p.hPct / 100 * sz);
            onInfoChange(`${label} 坐标(${px},${py}) ${pw}×${ph}`);
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        // 缩放手柄
        if ((e.target as HTMLElement).classList.contains('resize-handle')) {
            e.preventDefault();
            e.stopPropagation();
            resizing.current = true;
            start.current = { x: e.clientX, y: e.clientY, lPct: 0, tPct: 0, wPct: pct.wPct, hPct: pct.hPct };
            const onMove = (ev: MouseEvent) => {
                if (!resizing.current) return;
                const dwPct = (ev.clientX - start.current.x) / containerSize.w * 100;
                const newW = Math.max(3, Math.min(100 - pct.xPct, start.current.wPct + dwPct));
                setPct((p) => { const np = { ...p, wPct: newW, hPct: newW / aspectRatio }; updateInfo(np); return np; });
            };
            const onUp = () => {
                resizing.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            return;
        }

        // 拖拽
        e.preventDefault();
        dragging.current = true;
        start.current = { x: e.clientX, y: e.clientY, lPct: pct.xPct, tPct: pct.yPct, wPct: 0, hPct: 0 };
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            const dxPct = (ev.clientX - start.current.x) / containerSize.w * 100;
            const dyPct = (ev.clientY - start.current.y) / containerSize.h * 100;
            setPct((p) => {
                const np = {
                    ...p,
                    xPct: Math.max(0, Math.min(100 - p.wPct, start.current.lPct + dxPct)),
                    yPct: Math.max(0, Math.min(100 - p.hPct, start.current.tPct + dyPct)),
                };
                updateInfo(np);
                return np;
            });
        };
        const onUp = () => {
            dragging.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        updateInfo(pct);
    };

    return (
        <div
            id={id}
            data-xpct={pct.xPct}
            data-ypct={pct.yPct}
            data-wpct={pct.wPct}
            data-hpct={pct.hPct}
            onMouseDown={onMouseDown}
            style={{
                position: 'absolute',
                left: `${pct.xPct}%`,
                top: `${pct.yPct}%`,
                width: `${pct.wPct}%`,
                height: `${pct.hPct}%`,
                cursor: 'move',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 3,
            }}
        >
            {children}
            <div
                className="resize-handle"
                style={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    width: 14,
                    height: 14,
                    background: '#4f6ef7',
                    border: '2px solid #fff',
                    borderRadius: '50%',
                    cursor: 'nw-resize',
                    zIndex: 7,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}
            />
        </div>
    );
}


export default function Ecommerce() {
    const { leaving } = usePageLeave();
    const { showToast } = useToast();
    const { hasKey, setOpen, recordUsed } = useApiConfig();
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
    const [size, setSize] = useState('800*800');
    const canvasDisplaySize = useRef({ w: 500, h: 500 });
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastUsage, setLastUsage] = useState<UsageInfo | null>(null);
    const [elapsed, setElapsed] = useState(0);
    // 校验失败时轻摇生成按钮（motion-24：disarmed click 需回应）
    const [shake, setShake] = useState(false);

    // 生成中：浏览器标签页图标变为加载环（detail.design #101 Dynamic Favicon）
    useEffect(() => {
        if (loading) setLoadingFavicon(true, '#4f6ef7');
        else applyPageTheme('/ecommerce');
    }, [loading]);

    // Uploads
    const [product, setProduct] = useState<{ path: string; preview: string } | null>(null);
    const [logo, setLogo] = useState<{ path: string; preview: string } | null>(null);

    // Text blocks
    const [textBlocks, setTextBlocks] = useState<TextLine[]>([]);
    const [activeBlockIdx, setActiveBlockIdx] = useState(-1);

    // Panel collapse state
    const [templateOpen, setTemplateOpen] = useState(false);
    const [textOpen, setTextOpen] = useState(false);

    // Result
    const [resultPreview, setResultPreview] = useState('');
    const [downloadUrl, setDownloadUrl] = useState('');
    const [tab, setTab] = useState<'edit' | 'result'>('edit');

    const canvasRef = useRef<HTMLDivElement>(null);
    const [infoText, setInfoText] = useState('准备就绪');

    // 默认选中「1」号模板；找不到则选列表第一个
    const pickDefaultTemplate = (list: TemplateItem[]) => {
        if (list.length === 0) return '';
        const first = list.find(
            (t) => t.name === '1' || t.name === '1.png' || t.name.endsWith('/1.png')
        );
        return (first || list[0]).name;
    };

    const loadEcomTemplates = () => {
        fetchTemplates().then((res) => {
            setTemplates(res.templates);
            // 默认选中 1 号模板
            setSelectedTemplate(pickDefaultTemplate(res.templates));
        });
    };

    useEffect(() => {
        loadEcomTemplates();
    }, []);

    const getDefaultTexts = useCallback(() => {
        return (orientation === 'vertical' ? verticalDefaults : horizontalDefaults).map((d) => ({
            ...d,
            id: `b${++blockIdGen}`,
        }));
    }, [orientation]);

    useEffect(() => {
        setTextBlocks(getDefaultTexts());
        setActiveBlockIdx(-1);
        // 模板加载后默认选中 1 号模板；若用户已手动选择则保留
        setSelectedTemplate((prev) => {
            if (prev && templates.some((t) => t.name === prev)) return prev;
            return pickDefaultTemplate(templates);
        });
    }, [orientation, getDefaultTexts, templates]);

    const handleProductUpload = async (files: File[]) => {
        try {
            const data = await uploadImage(files[0], 'upload-product');
            setProduct(data);
            showToast('商品图上传成功');
        } catch {
            showToast('上传失败', 'error');
        }
    };

    const handleLogoUpload = async (files: File[]) => {
        try {
            const data = await uploadImage(files[0], 'upload-logo');
            setLogo(data);
            showToast('Logo 上传成功');
        } catch {
            showToast('上传失败', 'error');
        }
    };

    const addTextBlock = (section: string) => {
        const colors: Record<string, string> = {
            name: '#000000', weight: '#ffffff', slogan: '#ffdd00', tag: '#edec70',
        };
        const sizes: Record<string, number> = {
            name: 45, weight: 60, slogan: 35, tag: 30,
        };
        const block: TextLine = {
            id: `b${++blockIdGen}`,
            text: '新文字',
            color: colors[section] || '#ffffff',
            fontSize: sizes[section] || 36,
            xPct: 10,
            yPct: 50,
            section,
        };
        setTextBlocks((prev) => [...prev, block]);
    };

    const removeTextBlock = (idx: number) => {
        setTextBlocks((prev) => prev.filter((_, i) => i !== idx));
        setActiveBlockIdx(-1);
    };

    const updateBlock = (idx: number, updates: Partial<TextLine>) => {
        setTextBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...updates } : b)));
    };

    const toggleAi = () => {
        if (!aiEnabled && !hasKey) {
            showToast('请先配置 API Key 再开启 AI 功能', 'error');
            setOpen(true);
            return;
        }
        setAiEnabled(!aiEnabled);
    };

    const handleGenerate = async () => {
        if (!product) {
            setShake(true); // 校验未通过：轻摇提示「此路不通」
            showToast('请先上传商品图', 'error');
            return;
        }
        if (!selectedTemplate) {
            setShake(true);
            showToast('请选择模板', 'error');
            return;
        }
        // AI 颜色修改需要已配置 API Key
        if (aiEnabled && !hasKey) {
            setShake(true);
            showToast('请先配置 API Key 再使用 AI 功能', 'error');
            setOpen(true);
            return;
        }
        setLoading(true);
        setTab('result');

        try {
            // Export canvas to blob
            const canvasEl = canvasRef.current;
            if (!canvasEl) return;
            const offscreen = document.createElement('canvas');
            const sz = parseInt(size.split('*')[0]) || 800;
            offscreen.width = sz;
            offscreen.height = sz;
            const ctx = offscreen.getContext('2d')!;

            // Draw template
            const bgImg = document.getElementById('ecommerce-canvas-bg') as HTMLImageElement;
            if (bgImg?.complete && bgImg.naturalWidth) {
                ctx.drawImage(bgImg, 0, 0, sz, sz);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, sz, sz);
            }

            // Draw product (从百分比位置转为绝对像素)
            const prodOverlay = document.getElementById('ecommerce-product-overlay');
            if (prodOverlay && product) {
                const prodImg = prodOverlay.querySelector('img');
                if (prodImg?.complete) {
                    const lx = Math.round((parseFloat(prodOverlay.dataset.xpct || '0') / 100) * sz);
                    const ly = Math.round((parseFloat(prodOverlay.dataset.ypct || '0') / 100) * sz);
                    const lw = Math.round((parseFloat(prodOverlay.dataset.wpct || '0') / 100) * sz);
                    const lh = Math.round((parseFloat(prodOverlay.dataset.hpct || '0') / 100) * sz);
                    const ratio = Math.min(lw / prodImg.naturalWidth, lh / prodImg.naturalHeight);
                    const dw = Math.round(prodImg.naturalWidth * ratio);
                    const dh = Math.round(prodImg.naturalHeight * ratio);
                    const dx = lx + Math.round((lw - dw) / 2);
                    const dy = ly + Math.round((lh - dh) / 2);
                    ctx.drawImage(prodImg, dx, dy, dw, dh);
                }
            }

            // Draw logo
            const logoOverlay = document.getElementById('ecommerce-logo-overlay');
            if (logoOverlay && logo) {
                const logoImg = logoOverlay.querySelector('img');
                if (logoImg?.complete) {
                    const lx = Math.round((parseFloat(logoOverlay.dataset.xpct || '0') / 100) * sz);
                    const ly = Math.round((parseFloat(logoOverlay.dataset.ypct || '0') / 100) * sz);
                    const lw = Math.round((parseFloat(logoOverlay.dataset.wpct || '0') / 100) * sz);
                    const lh = Math.round((parseFloat(logoOverlay.dataset.hpct || '0') / 100) * sz);
                    const ratio = Math.min(lw / logoImg.naturalWidth, lh / logoImg.naturalHeight);
                    const dw = Math.round(logoImg.naturalWidth * ratio);
                    const dh = Math.round(logoImg.naturalHeight * ratio);
                    ctx.drawImage(logoImg, lx + Math.round((lw - dw) / 2), ly + Math.round((lh - dh) / 2), dw, dh);
                }
            }

            // Draw text blocks
            textBlocks.forEach((b) => {
                const lx = Math.round((b.xPct / 100) * sz);
                const ly = Math.round((b.yPct / 100) * sz);
                const fs = Math.round(b.fontSize / 800 * sz);
                ctx.font = `700 ${fs}px "Microsoft YaHei", sans-serif`;
                ctx.fillStyle = b.color;
                ctx.textBaseline = 'top';
                ctx.textAlign = 'left';
                const lines = b.text.split('\n');
                const lh = Math.round(fs * 1.3);
                lines.forEach((line, i) => {
                    ctx.fillText(line, lx, ly + i * lh);
                });
            });

            const blob = await new Promise<Blob>((resolve, reject) => {
                offscreen.toBlob((b) => (b ? resolve(b) : reject(new Error('图片导出失败'))), 'image/png');
            });
            const res = await generateEcommerceFinal(blob, aiEnabled ? aiPrompt : '', size);
            setResultPreview(res.preview);
            setDownloadUrl(res.download_url);
            setLastUsage(res.usage || null);
            setElapsed(res.elapsed || 0);
            if (res.ai_used) {
                // 刷新累计 Token 消耗
                recordUsed();
                showToast(`生成完成！耗时 ${res.elapsed}s · 本次消耗 ${res.usage?.total_tokens ?? 0} Tokens`);
            } else {
                showToast(`生成完成！耗时 ${res.elapsed}s`);
            }
        } catch (err: any) {
            showToast('生成失败: ' + (err.message || '未知错误'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const sectionNames: Record<string, string> = {
        name: '🏷️ 商品名称', weight: '⚖️ 净含量', slogan: '📢 广告词', tag: '🏷️ 卖点标签',
    };
    const sections = ['name', 'weight', 'slogan', 'tag'];

    const selectedTpl = templates.find((t) => t.name === selectedTemplate);

    return (
        <div className={`ui-page ui-page-blue ${leaving ? 'ui-leave' : 'ui-reveal'}`} style={{ minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
            <Header />
            <div style={{ maxWidth: 1260, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '35% 65%', gap: 24 }}>
                {/* LEFT PANEL */}
                <div>
                    {/* Upload */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                            <span className="ui-step">01</span><span>📷 商品图片 & Logo</span>
                            <select
                                value={orientation}
                                onChange={(e) => setOrientation(e.target.value as 'vertical' | 'horizontal')}
                                className="ui-input"
                                style={{ marginLeft: 'auto', padding: '4px 8px', border: '1px solid #e0e3eb', borderRadius: 6, fontSize: 12, background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}
                            >
                                <option value="vertical">📏 竖版商品</option>
                                <option value="horizontal">📐 横版商品</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <UploadZone
                                label="点击上传商品图"
                                hint="JPG/PNG/WEBP"
                                hasImage={!!product}
                                preview={product?.preview || ''}
                                onFiles={handleProductUpload}
                                style={{ flex: 1, padding: product ? 8 : 30 }}
                            />
                            <UploadZone
                                label="点击上传 Logo"
                                hint="JPG/PNG/WEBP"
                                hasImage={!!logo}
                                preview={logo?.preview || ''}
                                onFiles={handleLogoUpload}
                                style={{ flex: 1, padding: logo ? 8 : 30 }}
                            />
                        </div>
                    </div>

                    {/* Template (collapsible) */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.06s' } as React.CSSProperties}>
                        <div
                            onClick={() => setTemplateOpen(!templateOpen)}
                            style={{ fontSize: 14, fontWeight: 600, marginBottom: templateOpen ? 14 : 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', justifyContent: 'space-between' }}
                        >
                            <span className="ui-step">02</span><span>🎨 选择模板</span>
                            <span className="ui-chevron" style={{ fontSize: 12, transform: templateOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                        </div>
                        <div className={`ui-acc${templateOpen ? ' ui-acc-open' : ''}`}>
                            <div className="ui-acc-inner">
                                {templates.length === 0 ? (
                                    <div style={{ padding: '16px 0', textAlign: 'center' }}>
                                        <div className="ui-empty-icon" style={{ width: 56, height: 56, fontSize: 24, borderRadius: 16 }}>🎨</div>
                                        <p style={{ color: '#636e72', fontSize: 12, lineHeight: 1.8 }}>
                                            暂无模板，请前往 <b style={{ color: '#4f6ef7' }}>图片库</b> 上传电商模板
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                        {templates.map((tpl) => {
                                            const isActive = tpl.name === selectedTemplate;
                                            return (
                                                <div key={tpl.name} className="ui-tpl" style={{ border: `2px solid ${isActive ? '#4f6ef7' : '#e0e3eb'}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', position: 'relative', boxShadow: isActive ? '0 0 0 3px rgba(79,110,247,0.2)' : 'none' }}>
                                                    {isActive && (
                                                        <div style={{ position: 'absolute', top: 4, right: 6, background: '#4f6ef7', color: '#fff', width: 20, height: 20, borderRadius: '50%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✓</div>
                                                    )}
                                                    <img
                                                        src={tpl.thumbnail || (tpl.file_url ? authedFileUrl(tpl.file_url) : '')}
                                                        alt={tpl.name}
                                                        onClick={() => setSelectedTemplate(tpl.name)}
                                                        style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }}
                                                    />
                                                    <div style={{ fontSize: 10, color: '#636e72', textAlign: 'center', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                        <span>{tpl.name}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Text Editor (collapsible) */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.12s' } as React.CSSProperties}>
                        <div
                            onClick={() => setTextOpen(!textOpen)}
                            style={{ fontSize: 14, fontWeight: 600, marginBottom: textOpen ? 14 : 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', justifyContent: 'space-between' }}
                        >
                            <span className="ui-step">03</span><span>💬 文字叠加</span>
                            <span className="ui-chevron" style={{ fontSize: 12, transform: textOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                        </div>
                        <div className={`ui-acc${textOpen ? ' ui-acc-open' : ''}`}>
                            <div className="ui-acc-inner">
                                {sections.map((sec) => (
                                    <div key={sec} style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#4f6ef7' }}>{sectionNames[sec]}</span>
                                            <button
                                                onClick={() => addTextBlock(sec)}
                                                className="ui-btn-ghost"
                                                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #dde', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#4f6ef7', fontWeight: 500 }}
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div>
                                            {textBlocks.map((b, idx) =>
                                                b.section === sec ? (
                                                    <div
                                                        key={b.id}
                                                        onClick={() => { setActiveBlockIdx(idx); }}
                                                        style={{
                                                            display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8,
                                                            background: idx === activeBlockIdx ? '#f0f4ff' : '#fafbfc',
                                                            borderRadius: 8, border: `1px solid ${idx === activeBlockIdx ? '#4f6ef7' : '#e0e3eb'}`,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <textarea
                                                            value={b.text}
                                                            onChange={(e) => updateBlock(idx, { text: e.target.value })}
                                                            className="ui-input"
                                                            style={{ flex: 1, minWidth: 70, padding: '6px 10px', border: '1px solid #e0e3eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 30, outline: 'none' }}
                                                        />
                                                        <input
                                                            type="number"
                                                            value={b.fontSize}
                                                            onChange={(e) => updateBlock(idx, { fontSize: parseInt(e.target.value) || 36 })}
                                                            className="ui-input"
                                                            style={{ width: 50, padding: '6px 10px', border: '1px solid #e0e3eb', borderRadius: 6, fontSize: 12, outline: 'none' }}
                                                            min={8}
                                                            max={200}
                                                        />
                                                        <input
                                                            type="color"
                                                            value={b.color}
                                                            onChange={(e) => updateBlock(idx, { color: e.target.value })}
                                                            style={{ width: 30, height: 28, padding: 2, cursor: 'pointer', borderRadius: 4 }}
                                                        />
                                                        <button
                                                            onClick={() => removeTextBlock(idx)}
                                                            className="ui-btn-ghost"
                                                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fdd', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#e74c3c' }}
                                                        >
                                                            X
                                                        </button>
                                                    </div>
                                                ) : null
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>💡 在右侧预览区 <b>拖拽文字块</b> 调整位置，<b>点击</b> 选中编辑</div>
                            </div>
                        </div>
                    </div>

                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.18s' } as React.CSSProperties}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><span className="ui-step">04</span><span>⚙️ 输出分辨率</span></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {['1024*1024', '800*800'].map((s) => (
                                <div
                                    key={s}
                                    onClick={() => setSize(s)}
                                    style={{
                                        padding: '6px 16px',
                                        border: `1px solid ${s === size ? '#4f6ef7' : '#e0e3eb'}`,
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        background: s === size ? '#4f6ef7' : '#fff',
                                        color: s === size ? '#fff' : '#2d3436',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {s.replace('*', ' × ')}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI Prompt */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.24s' } as React.CSSProperties}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>🤖 AI 提示词（可选）</span>
                            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 400, color: '#636e72' }}>
                                <span>{aiEnabled ? '开启' : '关闭'}</span>
                                <div
                                    onClick={toggleAi}
                                    className="ui-switch-track"
                                    style={{
                                        display: 'inline-block',
                                        width: 36,
                                        height: 20,
                                        background: aiEnabled ? '#4f6ef7' : '#ccc',
                                        borderRadius: 10,
                                        position: 'relative',
                                        verticalAlign: 'middle',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span
                                        className="ui-switch-knob"
                                        style={{
                                            position: 'absolute',
                                            top: 2,
                                            left: aiEnabled ? 18 : 2,
                                            width: 16,
                                            height: 16,
                                            background: '#fff',
                                            borderRadius: '50%',
                                        }}
                                    />
                                </div>
                            </label>
                        </div>
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            disabled={!aiEnabled}
                            className="ui-input ui-caret-rainbow"
                            placeholder="开启 AI 开关后输入提示词，例如：\n将商品图的光影调整为柔和的侧光..."
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e0e3eb',
                                borderRadius: 8,
                                fontSize: 13,
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                minHeight: 60,
                                outline: 'none',
                                opacity: aiEnabled ? 1 : 0.5,
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
                                💡 开启 AI 开关后，输入提示词将调用大模型对导出的预览图进行 AI 优化，完成后显示本次 Token 消耗。
                            </span>
                            <span style={{ fontSize: 10, color: aiPrompt.trim().length > 200 ? '#e65100' : '#aaa', whiteSpace: 'nowrap', marginLeft: 8 }}>{aiPrompt.trim().length} 字</span>
                        </div>
                        {!hasKey && (
                            <div
                                onClick={() => setOpen(true)}
                                style={{
                                    marginTop: 10,
                                    background: '#fff3e0',
                                    border: '1px solid #ffe0b2',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    fontSize: 12,
                                    color: '#e65100',
                                    cursor: 'pointer',
                                    lineHeight: 1.5,
                                }}
                            >
                                ⚠️ 尚未配置 API Key，AI 功能暂不可用。点击前往「API 设置」配置 →
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className={`${shake ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer ui-scroll-reveal`}
                        onAnimationEnd={() => setShake(false)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '10px 24px',
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            border: 'none',
                            fontFamily: 'inherit',
                            width: '100%',
                            background: loading ? '#b0bec5' : '#4f6ef7',
                            color: '#fff',
                            '--reveal-delay': '0.3s',
                        } as React.CSSProperties}
                    >
                        {loading ? '⏳ 生成中...' : '🚀 生成电商主图'}
                    </button>
                </div>

                {/* RIGHT PANEL */}
                <div style={{ position: 'sticky', top: 24 }}>
                    <div style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
                        <button
                            onClick={() => setTab('edit')}
                            style={{
                                padding: '8px 20px',
                                border: '1px solid #e0e3eb',
                                borderBottom: 'none',
                                background: tab === 'edit' ? '#fff' : '#f0f2f5',
                                cursor: 'pointer',
                                fontSize: 13,
                                borderRadius: '8px 8px 0 0',
                                fontFamily: 'inherit',
                                color: tab === 'edit' ? '#4f6ef7' : '#636e72',
                                fontWeight: tab === 'edit' ? 600 : 400,
                            }}
                        >
                            🎯 拖拽排版
                        </button>
                        <button
                            onClick={() => setTab('result')}
                            style={{
                                padding: '8px 20px',
                                border: '1px solid #e0e3eb',
                                borderBottom: 'none',
                                background: tab === 'result' ? '#fff' : '#f0f2f5',
                                cursor: 'pointer',
                                fontSize: 13,
                                borderRadius: '8px 8px 0 0',
                                fontFamily: 'inherit',
                                color: tab === 'result' ? '#4f6ef7' : '#636e72',
                                fontWeight: tab === 'result' ? 600 : 400,
                            }}
                        >
                            🖼️ 生成结果
                        </button>
                    </div>
                    <div
                        key={tab}
                        className="ui-flip-in ui-canvas-bg"
                        style={{
                            borderRadius: '0 10px 10px 10px',
                            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)',
                            overflow: 'auto',
                            position: 'relative',
                            height: 'calc(100vh - 220px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {tab === 'result' ? (
                            <div key={resultPreview || 'empty'} className="ui-pop-in" style={{ padding: 24, textAlign: 'center' }}>
                                {resultPreview ? (
                                    <>
                                        <img src={resultPreview} alt="result" style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 300px)', borderRadius: 6, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)' }} />
                                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <a href={authedFileUrl(downloadUrl)} download style={{ padding: '8px 20px', borderRadius: 8, background: '#4f6ef7', color: '#fff', textDecoration: 'none', fontSize: 13, display: 'inline-block' }}>
                                                ⬇ 下载原图
                                            </a>
                                            <TokenUsage usage={lastUsage} />
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ color: '#636e72', textAlign: 'center' }}>
                                        <div style={{ fontSize: 64, opacity: 0.5, marginBottom: 12 }}>🖼️</div>
                                        <p>点击「生成电商主图」查看结果</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EcommerceCanvas
                                ref={canvasRef}
                                canvasDisplaySize={canvasDisplaySize}
                                selectedTpl={selectedTpl}
                                product={product}
                                logo={logo}
                                textBlocks={textBlocks}
                                activeBlockIdx={activeBlockIdx}
                                setActiveBlockIdx={setActiveBlockIdx}
                                updateBlock={updateBlock}
                                loading={loading}
                                orientation={orientation}
                                onInfoChange={setInfoText}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', fontSize: 11, color: '#636e72', background: '#fff', borderTop: '1px solid #e0e3eb' }}>
                        <span>{infoText}{elapsed > 0 && ` · ⏱️ 上次耗时${elapsed}s`}</span>
                        <span>🖱 拖拽调整位置 · 缩放手柄调整大小</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========== EcommerceCanvas: 使用百分比定位，带自动尺寸适应 ==========

