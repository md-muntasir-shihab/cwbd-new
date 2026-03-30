export function pickText(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isUsableDate(date: Date): boolean {
    const year = date.getUTCFullYear();
    return Number.isFinite(date.getTime()) && year >= 1900 && year <= 2100;
}

function parseExcelSerialDate(value: number): Date | null {
    if (!Number.isFinite(value) || value < 20_000 || value > 80_000) return null;
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpochUtc + Math.round(value) * 24 * 60 * 60 * 1000);
    return isUsableDate(date) ? date : null;
}

function parseEpochDate(value: number): Date | null {
    if (!Number.isFinite(value)) return null;
    let numeric = value;
    while (numeric > 1e13) numeric = Math.floor(numeric / 10);
    const date = new Date(numeric < 1e11 ? numeric * 1000 : numeric);
    return isUsableDate(date) ? date : null;
}

export function parseUniversityDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return isUsableDate(value) ? value : null;

    if (typeof value === 'number') {
        return parseExcelSerialDate(value) || parseEpochDate(value);
    }

    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d+(\.\d+)?$/.test(raw)) {
        const numeric = Number(raw);
        return parseExcelSerialDate(numeric) || parseEpochDate(numeric);
    }

    const date = new Date(raw);
    return isUsableDate(date) ? date : null;
}

export function formatUniversityDate(
    value: unknown,
    locale = 'en-GB',
    options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
    const date = parseUniversityDate(value);
    return date ? date.toLocaleDateString(locale, options) : 'N/A';
}

export function toUniversityIsoDate(value: unknown): string {
    const date = parseUniversityDate(value);
    return date ? date.toISOString() : '';
}

export function daysUntilUniversityDate(value: unknown, base = new Date()): number | null {
    const date = parseUniversityDate(value);
    if (!date) return null;
    const baseStart = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
    const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.floor((targetStart - baseStart) / (24 * 60 * 60 * 1000));
}

export function toUniversitySlug(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function buildUniversityLogoFallback(name: string, shortForm = ''): string {
    const short = pickText(shortForm);
    if (short && short.toLowerCase() !== 'n/a') {
        const normalizedShort = short.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
        if (normalizedShort && normalizedShort !== 'NA') {
            return normalizedShort;
        }
    }
    return (
        pickText(name)
            .split(' ')
            .filter((word) => !['of', 'the', 'and', 'for'].includes(word.toLowerCase()))
            .map((word) => word[0])
            .join('')
            .slice(0, 3)
            .toUpperCase()
        || 'UNI'
    );
}

export function getUniversityFallbackTextSizeClass(text: string): string {
    const length = pickText(text).length;
    if (length >= 12) return 'text-[0.42rem] sm:text-[0.48rem]';
    if (length >= 10) return 'text-[0.5rem] sm:text-[0.58rem]';
    if (length >= 8) return 'text-[0.58rem] sm:text-[0.66rem]';
    if (length >= 6) return 'text-[0.7rem] sm:text-[0.82rem]';
    if (length >= 4) return 'text-[0.9rem] sm:text-[1rem]';
    return 'text-xl sm:text-2xl';
}

export function getUniversityNameSizeClass(name: string): string {
    const length = pickText(name).replace(/\s+/g, ' ').length;
    if (length >= 60) return 'text-[0.95rem] sm:text-[1rem]';
    if (length >= 46) return 'text-sm sm:text-[0.95rem]';
    if (length >= 34) return 'text-base sm:text-[1.05rem]';
    return 'text-lg';
}

export function getUniversityShortFormClass(shortForm: string): string {
    const length = pickText(shortForm).length;
    if (length >= 9) return 'text-[10px] sm:text-[11px]';
    if (length >= 6) return 'text-[11px] sm:text-xs';
    return 'text-xs';
}

export function normalizeUniversitySeat(value: unknown): string {
    const text = pickText(value);
    if (!text || text.toLowerCase() === 'n/a') return 'N/A';
    const numericText = text.replace(/[^\d]/g, '');
    if (!numericText) return 'N/A';
    const numeric = Number(numericText);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
    return numeric.toLocaleString();
}

export function shortenUniversityAddress(address: string, maxLength = 44): string {
    const normalized = pickText(address);
    if (!normalized) return 'N/A';
    const segments = normalized.split(',').map((segment) => segment.trim()).filter(Boolean);
    if (segments.length >= 2) return `${segments[0]}, ${segments[1]}`;
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}

export function pickUniversityExamDates(item: Record<string, unknown>): string[] {
    return [
        item.scienceExamDate,
        item.examDateScience,
        item.artsExamDate,
        item.examDateArts,
        item.businessExamDate,
        item.examDateBusiness,
    ]
        .map((value) => toUniversityIsoDate(value))
        .filter(Boolean);
}

export function pickNearestUniversityExamDate(item: Record<string, unknown>): string {
    const timestamps = pickUniversityExamDates(item)
        .map((value) => parseUniversityDate(value))
        .filter((value): value is Date => Boolean(value))
        .map((value) => value.getTime())
        .sort((left, right) => left - right);
    return timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : '';
}
