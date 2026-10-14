import { http } from './api';
import type {
    ImageItem,
    ImagesResponse,
    ImageLabelsResponse,
    ImageCategory,
    Orientation,
} from '../types';

export async function fetchImages(params?: {
    category?: ImageCategory;
    orientation?: Orientation;
    label?: string;
    keyword?: string;
}): Promise<ImagesResponse> {
    const { data } = await http.get('/api/images', { params });
    return data;
}

/** 获取图片库已有的自定义分类列表 */
export async function fetchImageLabels(category?: ImageCategory): Promise<ImageLabelsResponse> {
    const { data } = await http.get('/api/image-labels', { params: category ? { category } : {} });
    return data;
}

export async function uploadImageToLibrary(
    file: File,
    category: ImageCategory,
    orientation: string,
    label: string,
    name: string
): Promise<{ success: boolean; image: ImageItem }> {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    form.append('orientation', orientation);
    form.append('label', label);
    form.append('name', name);
    const { data } = await http.post('/api/images', form);
    return data;
}

export async function renameLibraryImage(
    id: number,
    payload: { name?: string; orientation?: Orientation; label?: string }
): Promise<{ success: boolean; image: ImageItem }> {
    const { data } = await http.put(`/api/images/${id}`, payload);
    return data;
}

export async function deleteLibraryImage(id: number): Promise<{ success: boolean }> {
    const { data } = await http.delete(`/api/images/${id}`);
    return data;
}

export async function savePosterBase(
    file: Blob,
    name: string,
    label: string
): Promise<{ success: boolean; image: ImageItem }> {
    const form = new FormData();
    form.append('file', file, 'poster_base.png');
    form.append('name', name);
    form.append('label', label);
    const { data } = await http.post('/api/poster-bases', form);
    return data;
}
