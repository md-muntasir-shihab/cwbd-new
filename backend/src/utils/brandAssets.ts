import { promises as fs } from 'fs';
import path from 'path';

export const PUBLIC_BRAND_ASSETS = {
    logo: '/logo.png',
    favicon: '/favicon.ico',
} as const;

export type BrandAssetKind = keyof typeof PUBLIC_BRAND_ASSETS;

const RETIRED_BRAND_ASSET_PATHS = new Set<string>([
    '',
    '/uploads/logo-1773555868748-118876447.webp',
    '/uploads/favicon-1773555868749-501330119.webp',
]);

function normalizeAssetValue(value: unknown): string {
    return String(value || '').trim();
}

function getUploadAssetPath(value: string): string | null {
    if (!value.startsWith('/uploads/')) return null;
    return path.resolve(__dirname, '../../public', value.replace(/^\/+/, ''));
}

export function normalizeStoredBrandAsset(value: unknown, kind: BrandAssetKind): string {
    const normalized = normalizeAssetValue(value);
    if (!normalized || RETIRED_BRAND_ASSET_PATHS.has(normalized)) {
        return PUBLIC_BRAND_ASSETS[kind];
    }
    return normalized;
}

export async function resolveStoredBrandAsset(value: unknown, kind: BrandAssetKind): Promise<string> {
    const normalized = normalizeStoredBrandAsset(value, kind);
    if (!normalized.startsWith('/uploads/')) {
        return normalized;
    }

    const uploadPath = getUploadAssetPath(normalized);
    if (!uploadPath) {
        return normalized;
    }

    try {
        await fs.access(uploadPath);
        return normalized;
    } catch {
        return PUBLIC_BRAND_ASSETS[kind];
    }
}
