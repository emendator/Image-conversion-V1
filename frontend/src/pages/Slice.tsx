import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import UploadZone from '../components/UploadZone';
import DecodeText from '../components/DecodeText';
import { setLoadingFavicon, applyPageTheme } from '../ui-meta';
import { useToast } from '../components/Toast';
import { usePageLeave } from '../hooks/usePageLeave';
import { authedFileUrl } from '../api/api';
import {
    fetchSliceTemplates,
    uploadImage,
    uploadMultipleProducts,
    uploadSliceResult,
} from '../api/api';
import type { TemplateItem, TextLine } from '../types';
import '../ui-details.css';

let blockIdGen = 0;

interface ProductImage {
    path: string;
    preview: string;
}

export default function Slice() {
    const { leaving } = usePageLeave();
    const { showToast } = useToast();
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<ProductImage[]>([]);
    // 校验失败时轻摇生成按钮（motion-24：disarmed click 需回应）
    const [shake, setShake] = useState(false);

    // 生成中：浏览器标签页图标变为加载环（detail.design #101 Dynamic Favicon）
    useEffect(() => {
        if (loading) setLoadingFavicon(true, '#f97316');
        else applyPageTheme('/slice');
    }, [loading]);
    const [qr, setQr] = useState<{ path: string; preview: string } | null>(null);
    const [downloadUrl, setDownloadUrl] = useState('');

    // Panel collapse state
    const [sliceTemplateOpen, setSliceTemplateOpen] = useState(false);
    const [sliceTextOpen, setSliceTextOpen] = useState(false);
    const [subPanelOpen, setSubPanelOpen] = useState<Record<string, boolean>>({});
    const [infoText, setInfoText] = useState('准备就绪');

    // Text blocks
    const [textBlocks, setTextBlocks] = useState<TextLine[]>([]);
    const [activeBlockIdx, setActiveBlockIdx] = useState(-1);

    const canvasDisplaySize = useRef({ w: 500, h: 300 });

    const canvasRef = useRef<HTMLDivElement>(null);

    const canvasW = orientation === 'horizontal' ? 1920 : 1080;
    const canvasH = orientation === 'horizontal' ? 1080 : 1920;

    const loadTemplates = (orient: string) => {
        fetchSliceTemplates(orient).then((res) => {
            setTemplates(res.templates);
            if (res.templates.length > 0) {
                const tpl = res.templates.find((t) => t.name.endsWith('/1.png')) || res.templates[0];
                setSelectedTemplate(tpl.name);
            }
        });
    };

    useEffect(() => {
        loadTemplates(orientation);
    }, []);

    useEffect(() => {
        initDefaultTextBlocks();
        loadTemplates(orientation);
    }, [orientation]);

    const initDefaultTextBlocks = () => {
        setTextBlocks([]);
        blockIdGen = 0;
        if (orientation === 'horizontal') {
            const defaults: TextLine[] = [
                // brand × 4
                ...[145, 620, 1095, 1570].map((x) => ({ id: `b${++blockIdGen}`, text: 'ANKER安克', color: '#ffffff', fontSize: 35, xPct: x / 1920 * 100, yPct: 335 / 1080 * 100, section: 'brand' })),
                // name × 4
                ...['二合一充电宝', '三合一能量棒', '磁吸充电宝', '苹果快充充电器'].map((t, i) => ({ id: `b${++blockIdGen}`, text: t, color: '#000000', fontSize: 30, xPct: [130, 605, 1105, 1535][i] / 1920 * 100, yPct: 695 / 1080 * 100, section: 'name' })),
                // feature × 4
                ...[
                    '9600mAh  65W\n充电宝+充电器；\n5000mAh应急充电，\n随时自充，2.5h可充满',
                    '5000mAh  30W\n充电宝+充电器+自带线；\n极简出行，应急续航；\n自带LED屏显',
                    '10000mAh\n无线15W/C口30Wmax\n自带折叠支架，强力磁吸充电\n自带弯头线',
                    '20W  PD快充\nMini体积，大功率闪充\n3插脚可折叠\n兼容苹果&安卓',
                ].map((t, i) => ({ id: `b${++blockIdGen}`, text: t, color: '#a2a4a4', fontSize: 30, xPct: [55, 525, 1000, 1475][i] / 1920 * 100, yPct: 775 / 1080 * 100, section: 'feature' })),
                // model × 4
                ...['A1339', 'A1636', 'A1685', 'A2149'].map((t, i) => ({ id: `b${++blockIdGen}`, text: t, color: '#bbbbc6', fontSize: 24, xPct: [340, 815, 1290, 1765][i] / 1920 * 100, yPct: 645 / 1080 * 100, section: 'model' })),
                // jdprice × 4
                ...[35, 510, 985, 1460].map((x) => ({ id: `b${++blockIdGen}`, text: '京东价  ￥100', color: '#444648', fontSize: 25, xPct: x / 1920 * 100, yPct: 1000 / 1080 * 100, section: 'jdprice' })),
                // supplyprice labels × 4
                ...[210, 685, 1160, 1635].map((x) => ({ id: `b${++blockIdGen}`, text: '供货价', color: '#c9caca', fontSize: 30, xPct: x / 1920 * 100, yPct: 995 / 1080 * 100, section: 'supplyprice' })),
                // supplyprice values × 4
                ...[295, 780, 1255, 1730].map((x) => ({ id: `b${++blockIdGen}`, text: '￥80', color: '#de5c5c', fontSize: 65, xPct: x / 1920 * 100, yPct: 975 / 1080 * 100, section: 'supplyprice' })),
            ];
            setTextBlocks(defaults);
        } else {
            // vertical 1080×1920
            const defaults: TextLine[] = [
                // brand × 4 (2列×2行)
                ...[150, 700, 150, 700].map((x, i) => ({ id: `b${++blockIdGen}`, text: 'ANKER安克', color: '#ffffff', fontSize: 35, xPct: x / 1080 * 100, yPct: [440, 440, 1180, 1180][i] / 1920 * 100, section: 'brand' })),
                // name × 4
                ...['二合一充电宝', '二合一充电宝', '二合一充电宝', '二合一充电宝'].map((t, i) => ({ id: `b${++blockIdGen}`, text: t, color: '#000000', fontSize: 35, xPct: [130, 675, 130, 675][i] / 1080 * 100, yPct: [800, 800, 1540, 1540][i] / 1920 * 100, section: 'name' })),
                // feature × 4
                ...[
                    '9600mAh  65W\n充电宝+充电器；\n5000mAh应急充电，\n随时自充，2.5h可充满',
                    '5000mAh  30W\n充电宝+充电器+自带线；\n极简出行，应急续航；\n自带LED屏显',
                    '10000mAh\n无线15W/C口30Wmax\n自带折叠支架，强力磁吸充电\n自带弯头线',
                    '20W  PD快充\nMini体积，大功率闪充\n3插脚可折叠\n兼容苹果&安卓',
                ].map((t, i) => ({ id: `b${++blockIdGen}`, text: t, color: '#a2a4a4', fontSize: 30, xPct: [60, 600, 60, 600][i] / 1080 * 100, yPct: [880, 880, 1630, 1630][i] / 1920 * 100, section: 'feature' })),
                // jdprice × 4
                ...[50, 585, 50, 585].map((x, i) => ({ id: `b${++blockIdGen}`, text: '京东价  ￥100', color: '#909090', fontSize: 25, xPct: x / 1080 * 100, yPct: [1090, 1090, 1840, 1840][i] / 1920 * 100, section: 'jdprice' })),
                // supplyprice labels × 4
                ...[290, 815, 290, 815].map((x, i) => ({ id: `b${++blockIdGen}`, text: '供货价', color: '#cacaca', fontSize: 30, xPct: x / 1080 * 100, yPct: [1090, 1090, 1830, 1830][i] / 1920 * 100, section: 'supplyprice' })),
                // supplyprice values × 4
                ...[370, 900, 370, 900].map((x, i) => ({ id: `b${++blockIdGen}`, text: '￥80', color: '#de5c5c', fontSize: 65, xPct: x / 1080 * 100, yPct: [1065, 1065, 1815, 1815][i] / 1920 * 100, section: 'supplyprice' })),
            ];
            setTextBlocks(defaults);
        }
    };

    const handleProductsUpload = async (files: File[]) => {
        try {
            const data = await uploadMultipleProducts(files);
            setProducts((prev) => [...prev, ...data.products]);
            showToast(`已上传 ${data.count} 张`);
        } catch {
            showToast('上传失败', 'error');
        }
    };

    const handleQrUpload = async (files: File[]) => {
        try {
            const data = await uploadImage(files[0], 'upload-qr');
            setQr(data);
            showToast('二维码上传成功');
        } catch {
            showToast('上传失败', 'error');
        }
    };

    const removeProduct = (idx: number) => {
        setProducts((prev) => prev.filter((_, i) => i !== idx));
    };

    const addTextLine = (section: string) => {
        const sizes: Record<string, number> = { brand: 35, name: 30, feature: 30, model: 24, jdprice: 25, supplyprice: 30 };
        const colors: Record<string, string> = { brand: '#ffffff', name: '#000000', feature: '#a2a4a4', model: '#bbbbc6', jdprice: '#444648', supplyprice: '#c9caca' };
        setTextBlocks((prev) => [
            ...prev,
            { id: `b${++blockIdGen}`, text: '新文字', color: colors[section] || '#ffffff', fontSize: sizes[section] || 12, xPct: 10, yPct: 50, section },
        ]);
    };

    const removeTextBlock = (idx: number) => {
        setTextBlocks((prev) => prev.filter((_, i) => i !== idx));
        setActiveBlockIdx(-1);
    };

    const updateBlock = (idx: number, updates: Partial<TextLine>) => {
        setTextBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...updates } : b)));
    };

    const handleGenerate = async () => {
        if (products.length === 0) {
            setShake(true); // 校验未通过：轻摇提示「此路不通」
            showToast('请至少上传一张商品图', 'error');
            return;
        }
        setLoading(true);

        try {
            // Create off-screen canvas
            const offCanvas = document.createElement('canvas');
            offCanvas.width = canvasW;
            offCanvas.height = canvasH;
            const ctx = offCanvas.getContext('2d')!;

            // Draw template
            const bgImg = document.getElementById('slice-canvas-bg') as HTMLImageElement;
            if (bgImg?.complete && bgImg.naturalWidth) {
                ctx.drawImage(bgImg, 0, 0, canvasW, canvasH);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvasW, canvasH);
            }

            // Draw products (从 style 读取像素位置)
            const canvasEl = canvasRef.current;
            const scaleX = canvasW / (canvasEl?.offsetWidth || canvasW);
            const scaleY = canvasH / (canvasEl?.offsetHeight || canvasH);

            const prodOverlays = document.querySelectorAll('.slice-product-overlay');
            prodOverlays.forEach((el) => {
                const imgEl = el.querySelector('img');
                if (!imgEl?.src || !imgEl.complete) return;
                const lx = Math.round((parseFloat((el as HTMLElement).style.left) || 0) * scaleX);
                const ly = Math.round((parseFloat((el as HTMLElement).style.top) || 0) * scaleY);
                const lw = Math.round((el as HTMLElement).offsetWidth * scaleX);
                const lh = Math.round((el as HTMLElement).offsetHeight * scaleY);
                const ratio = Math.min(lw / imgEl.naturalWidth, lh / imgEl.naturalHeight);
                const dw = Math.round(imgEl.naturalWidth * ratio);
                const dh = Math.round(imgEl.naturalHeight * ratio);
                ctx.drawImage(imgEl, lx + Math.round((lw - dw) / 2), ly + Math.round((lh - dh) / 2), dw, dh);
            });

            // Draw QR
            const qrOverlay = document.querySelector('.slice-qr-overlay') as HTMLElement;
            if (qrOverlay) {
                const qrImg = qrOverlay.querySelector('img') as HTMLImageElement;
                if (qrImg?.src && qrImg.complete) {
                    const qrx = Math.round((parseFloat(qrOverlay.style.left) || 0) * scaleX);
                    const qry = Math.round((parseFloat(qrOverlay.style.top) || 0) * scaleY);
                    const qrw = Math.round(qrOverlay.offsetWidth * scaleX);
                    const qrh = Math.round(qrOverlay.offsetHeight * scaleY);
                    ctx.drawImage(qrImg, qrx, qry, qrw, qrh);
                }
            }

            // Draw text
            textBlocks.forEach((b) => {
                const lx = Math.round((b.xPct / 100) * canvasW);
                const ly = Math.round((b.yPct / 100) * canvasH);
                const fs = Math.round(b.fontSize);
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
                offCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片导出失败'))), 'image/png');
            });
            const res = await uploadSliceResult(blob);
            setDownloadUrl(res.download_url);
            showToast('切片生成成功！');
        } catch (err: any) {
            showToast('生成失败: ' + (err.message || '未知错误'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const sectionConfig: Record<string, { label: string; color: string }> = {
        brand: { label: '🏷️ 品牌名称', color: '#4f6ef7' },
        name: { label: '📦 产品名称', color: '#4f6ef7' },
        feature: { label: '✨ 产品卖点', color: '#4f6ef7' },
        model: { label: '📐 产品型号', color: '#4f6ef7' },
        jdprice: { label: '💰 京东价', color: '#4f6ef7' },
        supplyprice: { label: '💵 供货价', color: '#4f6ef7' },
    };
    const sections = ['brand', 'name', 'feature', 'model', 'jdprice', 'supplyprice'];

    const selectedTpl = templates.find((t) => t.name === selectedTemplate);

    return (
        <div className={`ui-page ui-page-orange ${leaving ? 'ui-leave' : 'ui-reveal'}`} style={{ minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
            <Header />
            <div style={{ maxWidth: 1300, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '38% 62%', gap: 24 }}>
                {/* LEFT */}
                <div>
                    {/* Upload */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><span className="ui-step">01</span><span>📷 商品图片 & 二维码</span></div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <UploadZone
                                label="上传多张商品图"
                                hint="JPG/PNG，可多选"
                                hasImage={false}
                                preview=""
                                onFiles={handleProductsUpload}
                                multiple
                                style={{ flex: 1, padding: 28 }}
                            />
                            <UploadZone
                                label="上传二维码"
                                hint="JPG/PNG"
                                hasImage={!!qr}
                                preview={qr?.preview || ''}
                                onFiles={handleQrUpload}
                                style={{ flex: 1, padding: qr ? 6 : 20 }}
                            />
                        </div>
                        {products.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 10 }}>
                                {products.map((p, idx) => (
                                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e3eb', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                                        <img src={p.preview} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                                        <button
                                            onClick={() => removeProduct(idx)}
                                            style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(231,76,60,0.9)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            X
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ background: '#fff8f0', border: '1px solid #ffedd5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#636e72', marginTop: 8, lineHeight: 1.6 }}>
                            💡 {products.length === 0
                                ? '上传商品图后自动排版：1 张居中、2 张上下、4 张两列、更多三列。'
                                : <>已上传 <strong>{products.length}</strong> 张，自动 <strong>{products.length === 1 ? '居中' : products.length === 2 ? '上下' : products.length <= 4 ? '2列' : '3列'}</strong> 排版</>}
                        </div>
                    </div>

                    {/* Template (collapsible) */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.06s' } as React.CSSProperties}>
                        <div
                            onClick={() => setSliceTemplateOpen(!sliceTemplateOpen)}
                            style={{ fontSize: 14, fontWeight: 600, marginBottom: sliceTemplateOpen ? 14 : 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', justifyContent: 'space-between' }}
                        >
                            <span className="ui-step">02</span><span>🎨 选择模板</span>
                            <span className="ui-chevron" style={{ fontSize: 12, transform: sliceTemplateOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                        </div>
                        <div className={`ui-acc${sliceTemplateOpen ? ' ui-acc-open' : ''}`}>
                            <div className="ui-acc-inner">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                    <div
                                        onClick={() => setSelectedTemplate('')}
                                        className="ui-tpl"
                                        style={{
                                            border: `2px solid ${selectedTemplate === '' ? '#f97316' : '#e0e3eb'}`,
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            borderStyle: 'dashed',
                                            boxShadow: selectedTemplate === '' ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
                                        }}
                                    >
                                        <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 24 }}>⊗</div>
                                        <div style={{ fontSize: 10, color: '#636e72', textAlign: 'center', padding: '3px 0' }}>不使用模板</div>
                                    </div>
                                    {templates.map((tpl) => {
                                        const isActive = tpl.name === selectedTemplate;
                                        return (
                                            <div
                                                key={tpl.name}
                                                className="ui-tpl"
                                                style={{
                                                    border: `2px solid ${isActive ? '#f97316' : '#e0e3eb'}`,
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    boxShadow: isActive ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
                                                }}
                                            >
                                                {isActive && (
                                                    <div style={{ position: 'absolute', top: 4, right: 6, background: '#f97316', color: '#fff', width: 20, height: 20, borderRadius: '50%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✓</div>
                                                )}
                                                <img
                                                    src={tpl.thumbnail || (tpl.file_url ? authedFileUrl(tpl.file_url) : '')}
                                                    alt={tpl.name}
                                                    onClick={() => setSelectedTemplate(tpl.name)}
                                                    style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }}
                                                />
                                                <div style={{ fontSize: 10, color: '#636e72', textAlign: 'center', padding: '3px 0' }}>
                                                    <span>{tpl.name.replace(/^.*\//, '')}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Text Editor (collapsible) */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.12s' } as React.CSSProperties}>
                        <div
                            onClick={() => setSliceTextOpen(!sliceTextOpen)}
                            style={{ fontSize: 14, fontWeight: 600, marginBottom: sliceTextOpen ? 14 : 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', justifyContent: 'space-between' }}
                        >
                            <span className="ui-step">03</span><span>💬 文字叠加</span>
                            <span className="ui-chevron" style={{ fontSize: 12, transform: sliceTextOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                        </div>
                        <div className={`ui-acc${sliceTextOpen ? ' ui-acc-open' : ''}`}>
                            <div className="ui-acc-inner">
                                {sections.map((sec) => (
                                    <div key={sec} style={{ marginBottom: 6 }}>
                                        <div
                                            onClick={() => setSubPanelOpen((prev) => ({ ...prev, [sec]: !prev[sec] }))}
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #e0e3eb', cursor: 'pointer' }}
                                        >
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#f97316' }}>{sectionConfig[sec]?.label || sec}</span>
                                            <span className="ui-chevron" style={{ fontSize: 11, transform: subPanelOpen[sec] ? 'rotate(90deg)' : 'none' }}>
                                                ▶ <button onClick={(e) => { e.stopPropagation(); addTextLine(sec); }} className="ui-btn-ghost" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fdd', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#f97316', fontWeight: 500, marginLeft: 6 }}>+</button>
                                            </span>
                                        </div>
                                        <div className={`ui-acc${subPanelOpen[sec] ? ' ui-acc-open' : ''}`}>
                                            <div className="ui-acc-inner">
                                                {textBlocks.map((b, idx) =>
                                                    b.section === sec ? (
                                                        <div
                                                            key={b.id}
                                                            onClick={() => setActiveBlockIdx(idx)}
                                                            style={{
                                                                display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8,
                                                                background: idx === activeBlockIdx ? '#fff8f0' : '#fafbfc',
                                                                borderRadius: 8, border: `1px solid ${idx === activeBlockIdx ? '#f97316' : '#e0e3eb'}`,
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
                                                                min={8} max={200}
                                                            />
                                                            <input
                                                                type="color"
                                                                value={b.color}
                                                                onChange={(e) => updateBlock(idx, { color: e.target.value })}
                                                                style={{ width: 30, height: 28, padding: 2, cursor: 'pointer', borderRadius: 4 }}
                                                            />
                                                            <button onClick={() => removeTextBlock(idx)} className="ui-btn-ghost" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fdd', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#e74c3c' }}>X</button>
                                                        </div>
                                                    ) : null
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Size */}
                    <div className="ui-scroll-reveal" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', padding: 20, marginBottom: 20, '--reveal-delay': '0.18s' } as React.CSSProperties}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><span className="ui-step">04</span><span>📐 输出分辨率</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <select
                                value={orientation}
                                onChange={(e) => setOrientation(e.target.value as 'horizontal' | 'vertical')}
                                className="ui-input"
                                style={{ padding: '6px 10px', border: '1px solid #e0e3eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', background: '#fff', outline: 'none' }}
                            >
                                <option value="vertical">📏 竖版 1080×1920</option>
                                <option value="horizontal">📐 横版 1920×1080</option>
                            </select>
                            <span style={{ fontSize: 11, color: '#636e72' }}>默认模板：{orientation === 'vertical' ? '3.png' : '1.png'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff8f0', borderRadius: 8, border: '1px solid #ffedd5', fontSize: 13, color: '#636e72' }}>
                            <span>当前尺寸：</span>
                            <span style={{ fontWeight: 600, color: '#f97316', fontSize: 15 }}>{orientation === 'vertical' ? '1080 × 1920' : '1920 × 1080'}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11 }}>{orientation === 'vertical' ? '竖版' : '横版'}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className={`${shake ? 'ui-btn-primary ui-shake' : 'ui-btn-primary'} ui-btn-shimmer ui-scroll-reveal`}
                        onAnimationEnd={() => setShake(false)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'inherit',
                            width: '100%', background: loading ? '#b0bec5' : '#f97316', color: '#fff',
                            '--reveal-delay': '0.24s',
                        } as React.CSSProperties}
                    >
                        {loading ? '⏳ 合成中...' : '🚀 生成营销切片'}
                    </button>
                </div>

                {/* RIGHT */}
                <div style={{ position: 'sticky', top: 24 }}>
                    <div
                        className="ui-canvas-bg"
                        style={{
                            borderRadius: 10,
                            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)',
                            overflow: 'auto',
                            position: 'relative',
                            minHeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <SliceCanvas
                            ref={canvasRef}
                            canvasDisplaySize={canvasDisplaySize}
                            selectedTpl={selectedTpl}
                            products={products}
                            qr={qr}
                            textBlocks={textBlocks}
                            activeBlockIdx={activeBlockIdx}
                            setActiveBlockIdx={setActiveBlockIdx}
                            updateBlock={updateBlock}
                            loading={loading}
                            orientation={orientation}
                            canvasW={canvasW}
                            canvasH={canvasH}
                            onInfoChange={setInfoText}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#636e72', marginTop: 10, padding: '0 4px' }}>
                        <span>{infoText}</span>
                        {downloadUrl && (
                            <a href={authedFileUrl(downloadUrl)} download style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8, background: '#f97316', color: '#fff', textDecoration: 'none' }}>
                                ⬇ 下载切片
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========== SliceCanvas: 自适应尺寸 + 百分比定位 ==========

const SliceCanvas = React.forwardRef<HTMLDivElement, {
    canvasDisplaySize: React.MutableRefObject<{ w: number; h: number }>;
    selectedTpl: TemplateItem | undefined;
    products: ProductImage[];
    qr: { path: string; preview: string } | null;
    textBlocks: TextLine[];
    activeBlockIdx: number;
    setActiveBlockIdx: (idx: number) => void;
    updateBlock: (idx: number, updates: Partial<TextLine>) => void;
    loading: boolean;
    orientation: string;
    canvasW: number;
    canvasH: number;
    onInfoChange?: (text: string) => void;
}>((props, ref) => {
    const {
        canvasDisplaySize, selectedTpl, products, qr,
        textBlocks, activeBlockIdx, setActiveBlockIdx, updateBlock, loading,
        orientation, canvasW, canvasH, onInfoChange,
    } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const [displaySize, setDisplaySize] = useState({ w: 500, h: 300 });

    const ratio = canvasW / canvasH;

    useEffect(() => {
        const updateSize = () => {
            const el = containerRef.current;
            if (!el) return;
            const parent = el.parentElement;
            if (!parent) return;
            const pw = parent.clientWidth - 4;
            const ph = parent.clientHeight - 4;
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
        const observer = new ResizeObserver(updateSize);
        if (containerRef.current?.parentElement) {
            observer.observe(containerRef.current.parentElement);
        }
        return () => observer.disconnect();
    }, [canvasDisplaySize, ratio, canvasW, canvasH]);

    return (
        <div
            ref={(el) => {
                (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                if (typeof ref === 'function') ref(el);
                else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            id="slice-canvas"
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
            {selectedTpl ? (
                <img
                    id="slice-canvas-bg"
                    src={selectedTpl.file_url ? authedFileUrl(selectedTpl.file_url) : ''}
                    alt="template"
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                />
            ) : (
                <div style={{ width: '100%', height: '100%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    请选择模板
                </div>
            )}

            {/* 商品 overlays（像素定位，与原版行为一致） */}
            {products.map((p, idx) => {
                const defaultPos = getDefaultProductPos(idx, displaySize);
                return (
                    <PixelOverlay
                        key={idx}
                        className="slice-product-overlay"
                        defaultPos={defaultPos}
                        onInfoChange={onInfoChange}
                    >
                        <img src={p.preview} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4, pointerEvents: 'none' }} />
                    </PixelOverlay>
                );
            })}

            {/* QR overlay */}
            {qr && (
                <PixelOverlay
                    className="slice-qr-overlay"
                    defaultPos={getQrDefaultPos(displaySize)}
                    onInfoChange={onInfoChange}
                >
                    <img src={qr.preview} alt="QR" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4, pointerEvents: 'none' }} />
                </PixelOverlay>
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
                        const onMove = (ev: MouseEvent) => {
                            const pctX = Math.max(0, Math.min(100, ((ev.clientX - pRect.left - dx) / pRect.width) * 100));
                            const pctY = Math.max(0, Math.min(100, ((ev.clientY - pRect.top - dy) / pRect.height) * 100));
                            updateBlock(idx, { xPct: pctX, yPct: pctY });
                            if (onInfoChange) {
                                const px = Math.round(pctX / 100 * canvasW);
                                const py = Math.round(pctY / 100 * canvasH);
                                onInfoChange(`文字 "${b.text}" 坐标(${px},${py}) 字号${b.fontSize}`);
                            }
                        };
                        const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                        if (onInfoChange) {
                            const px = Math.round(b.xPct / 100 * canvasW);
                            const py = Math.round(b.yPct / 100 * canvasH);
                            onInfoChange(`文字 "${b.text}" 坐标(${px},${py}) 字号${b.fontSize}`);
                        }
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
                        fontSize: Math.round(b.fontSize / (orientation === 'horizontal' ? 1920 : 1080) * displaySize.w),
                        outline: idx === activeBlockIdx ? '2px solid #f97316' : 'none',
                        outlineOffset: 2,
                        zIndex: idx === activeBlockIdx ? 6 : 4,
                    }}
                >
                    {b.text}
                </div>
            ))}

            {loading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, borderRadius: 10 }}>
                    <div className="ui-spinner" style={{ width: 40, height: 40, border: '3px solid rgba(249,115,22,0.15)', borderTopColor: '#f97316', marginBottom: 14 }} />
                    <DecodeText text="正在合成切片..." style={{ fontSize: 13, color: '#636e72', marginBottom: 14 }} />
                    <div className="ui-skeleton" style={{ width: 150, height: 8, borderRadius: 999 }} />
                </div>
            )}
        </div>
    );
});

// ========== 像素坐标辅助函数 ==========

/** 获取商品默认像素位置（与原版一致） */
function getDefaultProductPos(idx: number, displaySize: { w: number; h: number }) {
    const isVertical = displaySize.h > displaySize.w;
    if (isVertical) {
        const fixed = [
            { x: 40, y: 152, w: 83, h: 96 },
            { x: 217, y: 154, w: 67, h: 95 },
            { x: 45, y: 384, w: 80, h: 93 },
            { x: 214, y: 372, w: 76, h: 108 },
        ];
        if (idx < fixed.length) return { ...fixed[idx] };
        return { x: 10, y: 10 + idx * 30, w: 80, h: 80 };
    }
    const fixed = [
        { x: 50, y: 155, w: 100, h: 116 },
        { x: 250, y: 155, w: 82, h: 116 },
        { x: 435, y: 155, w: 99, h: 118 },
        { x: 615, y: 155, w: 120, h: 117 },
    ];
    if (idx < fixed.length) {
        return { ...fixed[idx] };
    }
    return { x: 10, y: 10 + idx * 30, w: 80, h: 80 };
}

/** 获取二维码默认像素位置 */
function getQrDefaultPos(displaySize: { w: number; h: number }) {
    const isVertical = displaySize.h > displaySize.w;
    if (isVertical) {
        return { x: 272, y: 25, w: 55, h: 55 };
    }
    return { x: 678, y: 12, w: 92, h: 92 };
}

// ========== PixelOverlay: 基于像素坐标的可拖拽覆盖层 ==========

function PixelOverlay({
    className,
    defaultPos,
    children,
    onInfoChange,
}: {
    className?: string;
    defaultPos: { x: number; y: number; w: number; h: number };
    children: React.ReactNode;
    onInfoChange?: (text: string) => void;
}) {
    const [pos, setPos] = useState(defaultPos);
    const dragging = useRef(false);
    const resizing = useRef(false);
    const start = useRef({ x: 0, y: 0, l: 0, t: 0, w: 0, h: 0 });
    const aspectRatio = defaultPos.w / defaultPos.h;

    const updateInfo = (p: typeof pos) => {
        if (onInfoChange) {
            const label = className?.includes('qr') ? '二维码' : '图片';
            onInfoChange(`${label} 坐标(${Math.round(p.x)},${Math.round(p.y)}) ${Math.round(p.w)}x${Math.round(p.h)}`);
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        // 缩放手柄
        if ((e.target as HTMLElement).classList.contains('resize-handle')) {
            e.preventDefault();
            e.stopPropagation();
            resizing.current = true;
            start.current = { x: e.clientX, y: e.clientY, l: 0, t: 0, w: pos.w, h: pos.h };
            const onMove = (ev: MouseEvent) => {
                if (!resizing.current) return;
                const dw = ev.clientX - start.current.x;
                const newW = Math.max(10, start.current.w + dw);
                const newPos = { ...pos, w: newW, h: newW / aspectRatio };
                setPos(newPos);
                updateInfo(newPos);
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
        start.current = { x: e.clientX, y: e.clientY, l: pos.x, t: pos.y, w: 0, h: 0 };
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            const newPos = {
                ...pos,
                x: Math.max(0, start.current.l + ev.clientX - start.current.x),
                y: Math.max(0, start.current.t + ev.clientY - start.current.y),
            };
            setPos(newPos);
            updateInfo(newPos);
        };
        const onUp = () => {
            dragging.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        updateInfo(pos);
    };

    return (
        <div
            className={className}
            onMouseDown={onMouseDown}
            style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: pos.w,
                height: pos.h,
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
                    background: '#f97316',
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
