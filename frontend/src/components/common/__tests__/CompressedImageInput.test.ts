import { describe, it, expect } from 'vitest';
import { extractUploadUrl, extractUploadError } from '../CompressedImageInput';

describe('extractUploadUrl', () => {
    it('returns flat url field', () => {
        expect(extractUploadUrl({ url: '/uploads/img.png', filename: 'img.png' })).toBe('/uploads/img.png');
    });

    it('returns flat absoluteUrl when url is missing', () => {
        expect(extractUploadUrl({ absoluteUrl: 'https://cdn.example.com/img.png' })).toBe('https://cdn.example.com/img.png');
    });

    it('returns nested item.url from news media response', () => {
        expect(extractUploadUrl({ item: { url: '/media/photo.jpg', absoluteUrl: 'https://cdn.example.com/photo.jpg' }, message: 'ok' }))
            .toBe('/media/photo.jpg');
    });

    it('returns nested item.absoluteUrl when item.url is empty', () => {
        expect(extractUploadUrl({ item: { url: '', absoluteUrl: 'https://cdn.example.com/photo.jpg' } }))
            .toBe('https://cdn.example.com/photo.jpg');
    });

    it('prefers item.url over flat url', () => {
        expect(extractUploadUrl({ url: '/flat.png', item: { url: '/nested.png' } })).toBe('/nested.png');
    });

    it('returns empty string for null/undefined', () => {
        expect(extractUploadUrl(null)).toBe('');
        expect(extractUploadUrl(undefined)).toBe('');
    });

    it('returns empty string for empty object', () => {
        expect(extractUploadUrl({})).toBe('');
    });

    it('trims whitespace from URLs', () => {
        expect(extractUploadUrl({ url: '  /uploads/img.png  ' })).toBe('/uploads/img.png');
    });

    it('handles both url and absoluteUrl present at flat level', () => {
        expect(extractUploadUrl({ url: '/relative.png', absoluteUrl: 'https://cdn.example.com/absolute.png' }))
            .toBe('/relative.png');
    });
});

describe('extractUploadError', () => {
    it('extracts message from axios error response', () => {
        const axiosError = {
            response: { data: { message: 'Unsupported file type: image/tiff' } },
            message: 'Request failed with status code 400',
        };
        expect(extractUploadError(axiosError)).toBe('Unsupported file type: image/tiff');
    });

    it('falls back to Error.message when no response data', () => {
        expect(extractUploadError(new Error('Network Error'))).toBe('Network Error');
    });

    it('returns custom fallback when no message available', () => {
        expect(extractUploadError({}, 'Custom fallback')).toBe('Custom fallback');
    });

    it('returns default fallback for null/undefined', () => {
        expect(extractUploadError(null)).toBe('Upload failed');
        expect(extractUploadError(undefined)).toBe('Upload failed');
    });

    it('ignores empty response message and falls back to Error.message', () => {
        const error = {
            response: { data: { message: '  ' } },
            message: 'Something went wrong',
        };
        expect(extractUploadError(error)).toBe('Something went wrong');
    });
});
