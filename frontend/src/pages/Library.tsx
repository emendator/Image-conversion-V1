import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { authedFileUrl } from '../api/api';
import {
    fetchImages,
    fetchImageLabels,
    uploadImageToLibrary,
    renameLibraryImage,
    deleteLibraryImage,
} from '../api/library';
import type { ImageItem, ImageCategory, Orientation } from '../types';
import { flipLayout } from '../motion';
import '../ui-details.css';

const CATEGORY_TABS: { key: ImageCategory; label: string; icon: string }[] = [
    { key: 'ecommerce', label: '🛒 电商模板', icon: '🛒' },
    { key: 'slice', label: '📦 切片模板', icon: '📦' },
    { key: 'poster_base', label: '🎨 海报底图', icon: '🎨' },
];

const ROLE_LABEL: Record<string, string> = {
    super_admin: '最高级管理员',
    admin: '管理员',
    user: '用户',
};

function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return iso;
    }
}

// 网格视图（显示图片）卡片尺寸：宽 / 高宽比
const GRID_SIZES: Record<'large' | 'medium' | 'small', { width: number; ratio: string }> = {
    large: { width: 250, ratio: '3 / 4' },
    medium: { width: 190, ratio: '1 / 1' },
    small: { width: 140, ratio: '1 / 1' },
};

export default function Library() {
    const { showToast } = useToast();
    const { user } = useAuth();

    // 筛选状态与 URL 同步（detail.design #107 Keep State in URL：可分享、可返回、可继续）
    const [searchParams, setSearchParams] = useSearchParams();
    const [category, setCategory] = useState<ImageCategory>((searchParams.get('cat') as ImageCategory) || 'ecommerce');
    const [orientation, setOrientation] = useState(searchParams.get('orient') || ''); // 全部 / horizontal / vertical
    const [keyword, setKeyword] = useState(searchParams.get('q') || '');
    const [images, setImages] = useState<ImageItem[]>([]);
    const [loading, setLoading] = useState(false);

    // 显示模式：grid=显示图片 / table=显示信息
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    // 网格图标尺寸
    const [iconSize, setIconSize] = useState<'large' | 'medium' | 'small'>('medium');
    // 自定义分类筛选 + 已有分类列表
    const [labelFilter, setLabelFilter] = useState('');
    const [labels, setLabels] = useState<string[]>([]);

    // 筛选状态 → URL（replace，避免历史栈污染；detail.design #107 Keep State in URL）
    useEffect(() => {
        const params = new URLSearchParams();
        if (category !== 'ecommerce') params.set('cat', category);
        if (orientation) params.set('orient', orientation);
        if (labelFilter) params.set('label', labelFilter);
        if (keyword.trim()) params.set('q', keyword.trim());
        const next = params.toString();
        if (searchParams.toString() !== next) {
            setSearchParams(params, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, orientation, labelFilter, keyword]);

    // 上传弹窗
    const [showUpload, setShowUpload] = useState(false);
    const [upFile, setUpFile] = useState<File | null>(null);
    const [upName, setUpName] = useState('');
    const [upOrientation, setUpOrientation] = useState('');
    const [upLabel, setUpLabel] = useState('');
    const [upLabelMode, setUpLabelMode] = useState<'select' | 'new'>('select'); // 选择已有分类 / 新增分类
    const [upLabelNew, setUpLabelNew] = useState('');
    const [uploading, setUploading] = useState(false);

    // 编辑弹窗（名称 / 版型 / 分类）
    const [editImg, setEditImg] = useState<ImageItem | null>(null);
    const [editName, setEditName] = useState('');
    const [editOrientation, setEditOrientation] = useState('');
    const [editLabel, setEditLabel] = useState('');
    const [editLabelMode, setEditLabelMode] = useState<'select' | 'new'>('select'); // 选择已有分类 / 新增分类
    const [editLabelNew, setEditLabelNew] = useState('');
    const [editing, setEditing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 批量删除：勾选集合（默认模板也可选可删）
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleting, setDeleting] = useState(false);
    const selectable = images;
    const allSelected = selectable.length > 0 && selectable.every((i) => selectedIds.includes(i.id));

    // 网格容器（FLIP 动画目标）
    const gridRef = useRef<HTMLDivElement>(null);

    // FLIP：切换网格图标尺寸时，卡片布局变化平滑过渡
    useEffect(() => {
        if (viewMode !== 'grid' || !gridRef.current) return;
        flipLayout(gridRef.current);
    }, [iconSize, viewMode]);

    const toggleSelect = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleSelectAll = () => {
        if (allSelected) setSelectedIds([]);
        else setSelectedIds(selectable.map((i) => i.id));
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0 || deleting) return;
        if (!window.confirm(`确定删除选中的 ${selectedIds.length} 张图片吗？删除后不可恢复。`)) return;
        setDeleting(true);
        let ok = 0;
        let fail = 0;
        for (const id of selectedIds) {
            try {
                await deleteLibraryImage(id);
                ok += 1;
            } catch {
                fail += 1;
            }
        }
        setSelectedIds([]);
        setDeleting(false);
        load();
        if (fail === 0) showToast(`已删除 ${ok} 张图片`);
        else showToast(`删除完成：成功 ${ok} 张，失败 ${fail} 张`, 'error');
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchImages({
                category,
                orientation: (orientation || undefined) as 'horizontal' | 'vertical' | undefined,
                label: labelFilter.trim() || undefined,
                keyword: keyword.trim() || undefined,
            });
            setImages(res.images);
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '加载图片库失败', 'error');
        } finally {
            setLoading(false);
        }
    }, [category, orientation, labelFilter, keyword, showToast]);

    useEffect(() => {
        load();
    }, [load]);

    // 加载可选分类列表（随分类 Tab 变化刷新）
    useEffect(() => {
        fetchImageLabels(category).then((res) => setLabels(res.labels)).catch(() => { });
    }, [category]);

    const handleUpload = async () => {
        if (!upFile) {
            showToast('请选择图片文件', 'error');
            return;
        }
        if (!upName.trim()) {
            showToast('请输入图片名称', 'error');
            return;
        }
        if (category === 'slice' && !upOrientation) {
            showToast('切片模板请选择版型（横版/竖版）', 'error');
            return;
        }
        setUploading(true);
        try {
            const finalLabel = upLabelMode === 'new' ? upLabelNew.trim() : upLabel.trim();
            await uploadImageToLibrary(upFile, category, upOrientation, finalLabel, upName.trim());
            showToast('上传成功');
            setShowUpload(false);
            setUpFile(null);
            setUpName('');
            setUpOrientation('');
            setUpLabel('');
            setUpLabelMode('select');
            setUpLabelNew('');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '上传失败', 'error');
        } finally {
            setUploading(false);
        }
    };

    // 打开编辑弹窗（名称 / 版型 / 分类）
    const openEdit = (img: ImageItem) => {
        setEditImg(img);
        setEditName(img.name);
        setEditOrientation(img.orientation || '');
        setEditLabel(img.label || '');
        setEditLabelMode('select');
        setEditLabelNew('');
    };

    // 保存编辑（名称 / 版型 / 分类）
    const handleEditSave = async () => {
        if (!editImg) return;
        const name = editName.trim();
        if (!name) {
            showToast('请输入图片名称', 'error');
            return;
        }
        setEditing(true);
        try {
            const label = editLabelMode === 'new' ? editLabelNew.trim() : editLabel.trim();
            await renameLibraryImage(editImg.id, {
                name,
                orientation: (editOrientation || undefined) as Orientation | undefined,
                label,
            });
            showToast('修改成功');
            setEditImg(null);
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '修改失败', 'error');
        } finally {
            setEditing(false);
        }
    };

    const handleDelete = async (img: ImageItem) => {
        const tip = img.is_default ? '⚠️ 这是系统默认模板（所有公司共用），删除后其他公司也将不可见。\n\n' : '';
        if (!window.confirm(`${tip}确定删除图片「${img.name}」吗？删除后不可恢复。`)) return;
        try {
            await deleteLibraryImage(img.id);
            showToast('删除成功');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.detail || '删除失败', 'error');
        }
    };

    const handleFileChange = (files: FileList | null) => {
        if (!files || !files[0]) return;
        const f = files[0];
        setUpFile(f);
        if (!upName.trim()) {
            setUpName(f.name.replace(/\.[^.]+$/, ''));
        }
    };

    const showUploadModal = () => {
        setUpFile(null);
        setUpName('');
        setUpOrientation('');
        setUpLabel('');
        setUpLabelMode('select');
        setUpLabelNew('');
        setShowUpload(true);
    };

    const inputStyle: React.CSSProperties = {
        padding: '8px 12px',
        border: '1px solid #e0e3eb',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        background: '#fff',
    };

    return (
        <div className="ui-page ui-page-blue ui-reveal" style={{ minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* 氛围光球（背景层） */}
            <div className="ui-orb" style={{ left: '-8%', top: '-6%', width: 320, height: 320, zIndex: 0, background: 'radial-gradient(circle, rgba(79,110,247,0.4), transparent 65%)', animationDuration: '26s' }} />
            <div className="ui-orb" style={{ right: '-10%', bottom: '-8%', width: 360, height: 360, zIndex: 0, background: 'radial-gradient(circle, rgba(139,92,246,0.32), transparent 65%)', animationDuration: '32s', animationDelay: '-12s' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
                <Header />
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2d3436', display: 'flex', alignItems: 'center', gap: 8 }}>
                            🗂️ 图片库
                        </h2>
                        <p style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>
                            当前公司：<b style={{ color: '#4f6ef7' }}>{user?.company_name}</b> · 同公司账号共用此图片库
                        </p>
                    </div>
                    <button
                        onClick={showUploadModal}
                        className="ui-btn-primary ui-btn-shimmer ui-ripple"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '9px 20px', borderRadius: 10, border: 'none',
                            background: '#4f6ef7', color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        ＋ 上传图片
                    </button>
                </div>

                {/* 工具条：分类 Tab + 显示模式/图标大小 + 筛选搜索（合并一行，窄屏自动换行） */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 分类 Tab */}
                    {CATEGORY_TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => { setCategory(t.key); setOrientation(''); setLabelFilter(''); setSelectedIds([]); }}
                            className="ui-nav-btn"
                            style={{
                                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                                border: `1.5px solid ${category === t.key ? '#4f6ef7' : '#e0e3eb'}`,
                                background: category === t.key ? '#eef1ff' : '#fff',
                                color: category === t.key ? '#4f6ef7' : '#636e72',
                                fontSize: 12, fontWeight: category === t.key ? 600 : 400, fontFamily: 'inherit',
                                whiteSpace: 'nowrap', transition: 'all 0.2s',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}

                    <span style={{ width: 1, height: 20, background: '#e0e3eb', flexShrink: 0 }} />

                    {/* 显示模式 */}
                    <div style={{ display: 'flex', background: '#eef0f5', borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
                        {([
                            { key: 'grid', label: '🖼️ 显示图片' },
                            { key: 'table', label: '📋 显示信息' },
                        ] as { key: 'grid' | 'table'; label: string }[]).map((m) => (
                            <button
                                key={m.key}
                                onClick={() => setViewMode(m.key)}
                                style={{
                                    padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                    background: viewMode === m.key ? '#4f6ef7' : 'transparent',
                                    color: viewMode === m.key ? '#fff' : '#636e72',
                                    fontSize: 12, fontWeight: viewMode === m.key ? 600 : 400,
                                    fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.2s',
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    {viewMode === 'grid' && (
                        <div
                            title="图标大小"
                            style={{ display: 'flex', background: '#eef0f5', borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}
                        >
                            {([
                                { key: 'large', label: '大' },
                                { key: 'medium', label: '中' },
                                { key: 'small', label: '小' },
                            ] as { key: 'large' | 'medium' | 'small'; label: string }[]).map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setIconSize(s.key)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                        background: iconSize === s.key ? '#4f6ef7' : 'transparent',
                                        color: iconSize === s.key ? '#fff' : '#636e72',
                                        fontSize: 12, fontWeight: iconSize === s.key ? 600 : 400,
                                        fontFamily: 'inherit', transition: 'all 0.2s',
                                    }}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <span style={{ width: 1, height: 20, background: '#e0e3eb', flexShrink: 0 }} />

                    {/* 版型筛选 */}
                    {category === 'slice' && (
                        <select className="ui-input" style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                            <option value="">全部版型</option>
                            <option value="horizontal">横版</option>
                            <option value="vertical">竖版</option>
                        </select>
                    )}
                    {category === 'ecommerce' && (
                        <select className="ui-input" style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                            <option value="">全部版型</option>
                            <option value="vertical">竖版</option>
                            <option value="horizontal">横版</option>
                        </select>
                    )}
                    {/* 分类筛选 */}
                    <select className="ui-input" style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} title="按分类筛选">
                        <option value="">全部分类</option>
                        {labels.map((l) => (
                            <option key={l} value={l}>{l}</option>
                        ))}
                    </select>
                    {/* 搜索 */}
                    <input
                        className="ui-input"
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: 12, width: 160 }}
                        placeholder="搜索图片名称…"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && load()}
                    />
                    <button onClick={load} className="ui-btn-ghost" style={{ ...inputStyle, padding: '6px 14px', fontSize: 12, cursor: 'pointer', background: '#f0f2f5', whiteSpace: 'nowrap' }}>搜索</button>
                </div>

                {/* 批量操作栏 */}
                {images.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 14px', background: '#f8f9ff', borderRadius: 8, fontSize: 12, color: '#636e72', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input type="checkbox" checked={allSelected} onChange={handleSelectAll} disabled={selectable.length === 0} />
                            全选
                        </label>
                        <span>
                            已选 <b style={{ color: '#4f6ef7' }}>{selectedIds.length}</b> 项
                        </span>
                        <button
                            onClick={handleBatchDelete}
                            disabled={selectedIds.length === 0 || deleting}
                            className="ui-nav-btn"
                            style={{
                                padding: '5px 14px', borderRadius: 6, border: '1px solid #ffcdd2',
                                background: selectedIds.length > 0 ? '#fff5f5' : '#fafafa',
                                color: selectedIds.length > 0 ? '#c62828' : '#bbb',
                                fontSize: 12, cursor: selectedIds.length > 0 && !deleting ? 'pointer' : 'not-allowed',
                                fontFamily: 'inherit',
                            }}
                        >
                            {deleting ? '删除中…' : `🗑️ 批量删除${selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}`}
                        </button>
                        <span style={{ marginLeft: 'auto', color: '#aaa' }}>默认模板为系统内置、所有公司共用；删除后不可恢复</span>
                    </div>
                )}

                {/* 内容区：显示图片（网格）/ 显示信息（表格） */}
                <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_SIZES[iconSize].width}px, 1fr))`, gap: 14, padding: 16 }}>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} style={{ border: '1px solid #eef0f4', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                    <div className="ui-skeleton" style={{ aspectRatio: GRID_SIZES[iconSize].ratio, borderRadius: 0 }} />
                                    <div style={{ padding: '8px 10px' }}>
                                        <div className="ui-skeleton" style={{ height: 12, width: '70%' }} />
                                        <div className="ui-skeleton" style={{ height: 10, width: '45%', marginTop: 6 }} />
                                        <div className="ui-skeleton" style={{ height: 22, width: '100%', marginTop: 10, borderRadius: 6 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : images.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#999', fontSize: 13 }}>
                            <div className="ui-empty-icon ui-float">🖼️</div>
                            <p style={{ color: '#2d3436', fontWeight: 600, fontSize: 14 }}>图片库还是空的</p>
                            <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>点击右上角「上传图片」，把第一个模板带回家</p>
                        </div>
                    ) : viewMode === 'table' ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8f9ff', color: '#636e72' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, width: 44 }}>
                                        <input type="checkbox" checked={allSelected} onChange={handleSelectAll} disabled={selectable.length === 0} title="全选" />
                                    </th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>图片</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>图片名</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>版型</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>分类</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>上传时间</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {images.map((img) => (
                                    <tr key={img.id} style={{ borderTop: '1px solid #f0f2f5', transition: 'background 0.15s' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbff')} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                                        <td style={{ padding: '10px 16px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(img.id)}
                                                onChange={() => toggleSelect(img.id)}
                                                title="选择"
                                            />
                                        </td>
                                        <td style={{ padding: '10px 16px' }}>
                                            {img.thumbnail ? (
                                                <img src={img.thumbnail} alt={img.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #eef0f4', display: 'block' }} />
                                            ) : (
                                                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>无</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <span style={{ fontWeight: 500, color: '#2d3436', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {img.name}
                                                {img.is_default && (
                                                    <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: '#eef1ff', color: '#4f6ef7', fontWeight: 500 }}>默认</span>
                                                )}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 16px', color: '#636e72' }}>
                                            {img.orientation === 'horizontal' ? '横版' : img.orientation === 'vertical' ? '竖版' : '—'}
                                        </td>
                                        <td style={{ padding: '10px 16px', color: '#636e72' }}>
                                            {img.label ? <span style={{ color: '#4f6ef7' }}>{img.label}</span> : <span style={{ color: '#bbb' }}>未分类</span>}
                                        </td>
                                        <td style={{ padding: '10px 16px', color: '#999' }}>{formatTime(img.created_at)}</td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <a
                                                    href={authedFileUrl(img.file_url)}
                                                    download={img.name}
                                                    style={{ padding: '4px 12px', borderRadius: 6, background: '#eef1ff', color: '#4f6ef7', fontSize: 12, textDecoration: 'none' }}
                                                >
                                                    下载
                                                </a>
                                                <button
                                                    onClick={() => openEdit(img)}
                                                    className="ui-nav-btn"
                                                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                                                >
                                                    编辑
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(img)}
                                                    className="ui-nav-btn"
                                                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div
                            ref={gridRef}
                            style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_SIZES[iconSize].width}px, 1fr))`, gap: 14, padding: 16, perspective: 900 }}
                        >
                            {images.map((img, i) => (
                                <div
                                    key={img.id}
                                    data-flip
                                    className="ui-tilt ui-grid-item"
                                    data-tilt-max="6"
                                    style={{
                                        border: '1px solid #eef0f4',
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                        background: '#fff',
                                        position: 'relative',
                                        '--reveal-delay': `${Math.min(i * 0.05, 0.6)}s`,
                                    } as React.CSSProperties}
                                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.14)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
                                >
                                    <div className="ui-tilt-glare" />
                                    <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, background: 'rgba(255,255,255,0.88)', borderRadius: 4, padding: 2 }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(img.id)}
                                            onChange={() => toggleSelect(img.id)}
                                            title="选择"
                                        />
                                    </div>
                                    <div style={{ aspectRatio: GRID_SIZES[iconSize].ratio, background: '#f5f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        {img.file_url ? (
                                            <img src={authedFileUrl(img.file_url)} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        ) : (
                                            <div style={{ color: '#bbb', fontSize: 28 }}>🖼️</div>
                                        )}
                                    </div>
                                    <div style={{ padding: '8px 10px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#2d3436', display: 'flex', alignItems: 'center', gap: 4, minHeight: 18 }}>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {img.name}
                                                {img.is_default && (
                                                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#eef1ff', color: '#4f6ef7', fontWeight: 500, marginLeft: 4 }}>默认</span>
                                                )}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#999', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {img.label ? `分类：${img.label}` : '未分类'} · {img.orientation === 'horizontal' ? '横版' : img.orientation === 'vertical' ? '竖版' : '—'}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                                            <a
                                                href={authedFileUrl(img.file_url)}
                                                download={img.name}
                                                style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 6, background: '#eef1ff', color: '#4f6ef7', fontSize: 11, textDecoration: 'none' }}
                                            >
                                                下载
                                            </a>
                                            <button
                                                onClick={() => openEdit(img)}
                                                className="ui-nav-btn"
                                                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                                            >
                                                编辑
                                            </button>
                                            <button
                                                onClick={() => handleDelete(img)}
                                                className="ui-nav-btn"
                                                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <p style={{ fontSize: 11, color: '#aaa', marginTop: 12 }}>
                    权限说明：图片库按公司隔离（{ROLE_LABEL[user?.role || '']}），同公司账号共享；「默认」模板为系统内置、所有公司共用，支持修改与删除；电商模板 / 切片模板 / 海报底图分开管理。
                    {user?.role === 'guest' && (
                        <span style={{ color: '#e65100' }}> 游客模式下所有数据（上传的图片等）不保留，退出后自动清除。</span>
                    )}
                </p>
            </div>
            </div>

            {/* 上传弹窗 */}
            {showUpload && (
                <div
                    onClick={() => setShowUpload(false)}
                    className="ui-overlay"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} /* 图层约定：全局弹窗遮罩统一 1000 */
                >
                    <div onClick={(e) => e.stopPropagation()} className="ui-modal" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 16px 64px rgba(0,0,0,0.2)', width: '100%', maxWidth: 460, padding: 24, fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <span style={{ fontSize: 20 }}>🖼️</span>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#2d3436', flex: 1 }}>
                                上传图片 · {CATEGORY_TABS.find((t) => t.key === category)?.label}
                            </h3>
                            <span onClick={() => setShowUpload(false)} className="ui-close-btn" style={{ cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', background: '#f0f2f5', color: '#636e72', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</span>
                        </div>

                        {/* 文件选择 */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="ui-upload"
                            style={{
                                border: '1.5px dashed #c5cbd8', borderRadius: 10, padding: '22px 16px',
                                textAlign: 'center', cursor: 'pointer', background: '#fafbff', marginBottom: 14,
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/bmp"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileChange(e.target.files)}
                            />
                            {upFile ? (
                                <span style={{ fontSize: 13, color: '#4f6ef7', fontWeight: 500 }}>✅ {upFile.name}</span>
                            ) : (
                                <span style={{ fontSize: 13, color: '#636e72' }}>📁 点击选择图片文件（PNG / JPG / WEBP / BMP）</span>
                            )}
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>图片名称</label>
                            <input className="ui-input" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="填写图片名称" />
                        </div>

                        {(category === 'ecommerce' || category === 'slice') && (
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>版型</label>
                                <select
                                    className="ui-input"
                                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                                    value={upOrientation}
                                    onChange={(e) => setUpOrientation(e.target.value)}
                                >
                                    <option value="">请选择版型</option>
                                    <option value="vertical">竖版</option>
                                    <option value="horizontal">横版</option>
                                </select>
                            </div>
                        )}

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>分类（可选，选择已有或新增）</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <select
                                    className="ui-input"
                                    style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
                                    value={upLabelMode === 'new' ? '__new__' : upLabel}
                                    onChange={(e) => {
                                        if (e.target.value === '__new__') {
                                            setUpLabelMode('new');
                                            setUpLabel('');
                                        } else {
                                            setUpLabelMode('select');
                                            setUpLabel(e.target.value);
                                        }
                                    }}
                                >
                                    <option value="">未分类</option>
                                    {labels.map((l) => (
                                        <option key={l} value={l}>{l}</option>
                                    ))}
                                    <option value="__new__">＋ 新增分类…</option>
                                </select>
                                {upLabelMode === 'new' && (
                                    <input
                                        autoFocus
                                        className="ui-input"
                                        style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
                                        placeholder="输入新分类名称"
                                        value={upLabelNew}
                                        onChange={(e) => setUpLabelNew(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="ui-btn-primary"
                            style={{
                                width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
                                background: uploading ? '#b0bec5' : '#4f6ef7', color: '#fff',
                                fontSize: 14, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            {uploading ? '上传中…' : '确认上传'}
                        </button>
                    </div>
                </div>
            )}

            {/* 编辑弹窗（名称 / 版型 / 分类） */}
            {editImg && (
                <div
                    onClick={() => setEditImg(null)}
                    className="ui-overlay"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} /* 图层约定：全局弹窗遮罩统一 1000 */
                >
                    <div onClick={(e) => e.stopPropagation()} className="ui-modal" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 16px 64px rgba(0,0,0,0.2)', width: '100%', maxWidth: 460, padding: 24, fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <span style={{ fontSize: 20 }}>✏️</span>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#2d3436', flex: 1 }}>编辑图片</h3>
                            <span onClick={() => setEditImg(null)} className="ui-close-btn" style={{ cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', background: '#f0f2f5', color: '#636e72', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</span>
                        </div>

                        {editImg.file_url && (
                            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
                                <img src={authedFileUrl(editImg.file_url)} alt={editImg.name} style={{ maxWidth: 140, maxHeight: 140, borderRadius: 8, border: '1px solid #eef0f4', objectFit: 'contain' }} />
                            </div>
                        )}

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>图片名称</label>
                            <input className="ui-input" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="填写图片名称" />
                        </div>

                        {(editImg.category === 'ecommerce' || editImg.category === 'slice') && (
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>版型</label>
                                <select
                                    className="ui-input"
                                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                                    value={editOrientation}
                                    onChange={(e) => setEditOrientation(e.target.value)}
                                >
                                    <option value="">未设置</option>
                                    <option value="vertical">竖版</option>
                                    <option value="horizontal">横版</option>
                                </select>
                            </div>
                        )}

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 13, color: '#2d3436', fontWeight: 500, marginBottom: 6, display: 'block' }}>分类（选择已有或新增）</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <select
                                    className="ui-input"
                                    style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
                                    value={editLabelMode === 'new' ? '__new__' : editLabel}
                                    onChange={(e) => {
                                        if (e.target.value === '__new__') {
                                            setEditLabelMode('new');
                                            setEditLabel('');
                                        } else {
                                            setEditLabelMode('select');
                                            setEditLabel(e.target.value);
                                        }
                                    }}
                                >
                                    <option value="">未分类</option>
                                    {labels.map((l) => (
                                        <option key={l} value={l}>{l}</option>
                                    ))}
                                    <option value="__new__">＋ 新增分类…</option>
                                </select>
                                {editLabelMode === 'new' && (
                                    <input
                                        autoFocus
                                        className="ui-input"
                                        style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
                                        placeholder="输入新分类名称"
                                        value={editLabelNew}
                                        onChange={(e) => setEditLabelNew(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setEditImg(null)}
                                disabled={editing}
                                className="ui-btn-ghost"
                                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #e0e3eb', background: '#fff', color: '#636e72', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleEditSave}
                                disabled={editing}
                                className="ui-btn-primary"
                                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: editing ? '#b0bec5' : '#4f6ef7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: editing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                            >
                                {editing ? '保存中…' : '保存修改'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
