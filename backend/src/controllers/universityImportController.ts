import { Request, Response } from 'express';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import slugify from 'slugify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import University from '../models/University';
import UniversityCategory from '../models/UniversityCategory';
import UniversityCluster from '../models/UniversityCluster';
import UniversityImportJob from '../models/UniversityImportJob';
import { broadcastHomeStreamEvent } from '../realtime/homeStream';
import {
    backfillUniversityTaxonomyIfNeeded,
    ensureUniversityCategoryByName,
    ensureUniversityClusterByName,
    normalizeExamCenters,
    normalizeUniversityImportRow,
    reconcileUniversityClusterAssignments,
    syncManualClusterMembership,
} from '../services/universitySyncService';
import { ResponseBuilder } from '../utils/responseBuilder';

const CANONICAL_TARGET_FIELDS = [
    'category',
    'clusterGroup',
    'name',
    'shortForm',
    'shortDescription',
    'description',
    'establishedYear',
    'address',
    'contactNumber',
    'email',
    'websiteUrl',
    'admissionUrl',
    'totalSeats',
    'seatsScienceEng',
    'seatsArtsHum',
    'seatsBusiness',
    'applicationStartDate',
    'applicationEndDate',
    'examDateScience',
    'examDateArts',
    'examDateBusiness',
    'examCenters',
];

const OPTIONAL_TARGET_FIELDS = [
    'logoUrl',
    'isActive',
    'featured',
    'featuredOrder',
    'categorySyncLocked',
    'clusterSyncLocked',
    'verificationStatus',
    'remarks',
    'slug',
] as const;

const TARGET_FIELDS = [...CANONICAL_TARGET_FIELDS, ...OPTIONAL_TARGET_FIELDS] as const;
const TEMPLATE_HEADERS = [...CANONICAL_TARGET_FIELDS];
type TargetField = typeof TARGET_FIELDS[number];

type ValidationResult = {
    normalizedRows: Record<string, unknown>[];
    failedRows: Array<{ rowNumber: number; reason: string; payload?: Record<string, unknown> }>;
    duplicateRows: number[];
};

const FIELD_HEADER_ALIASES: Record<TargetField, string[]> = {
    category: ['category', 'Category'],
    clusterGroup: ['clusterGroup', 'cluster', 'Cluster'],
    name: ['name', 'Name', 'university', 'University Name'],
    shortForm: ['shortForm', 'short form', 'short_name', 'short name', 'Short Form'],
    shortDescription: ['shortDescription', 'short description', 'Short Description'],
    description: ['description', 'Description'],
    establishedYear: ['establishedYear', 'established', 'Established', 'established year'],
    address: ['address', 'Address'],
    contactNumber: ['contactNumber', 'contact', 'Contact', 'phone', 'Phone'],
    email: ['email', 'Email'],
    websiteUrl: ['websiteUrl', 'website', 'Website'],
    admissionUrl: ['admissionUrl', 'admissionWebsite', 'admission site', 'Admission Site', 'Admission Website'],
    totalSeats: ['totalSeats', 'total seats', 'Total Seats'],
    seatsScienceEng: ['seatsScienceEng', 'scienceSeats', 'science seats', 'Science Seats', 'Science'],
    seatsArtsHum: ['seatsArtsHum', 'artsSeats', 'arts seats', 'Arts Seats', 'Arts', 'Humanities'],
    seatsBusiness: ['seatsBusiness', 'businessSeats', 'business seats', 'Business Seats', 'Business', 'Commerce'],
    applicationStartDate: ['applicationStartDate', 'application start date', 'App Start', 'applicationStart', 'start date', 'Online Application Starts'],
    applicationEndDate: ['applicationEndDate', 'application end date', 'App End', 'applicationEnd', 'deadline', 'Online Application Ends'],
    examDateScience: ['examDateScience', 'scienceExamDate', 'Science Exam', 'science exam', 'Exam Date: Science'],
    examDateArts: ['examDateArts', 'artsExamDate', 'Arts Exam', 'arts exam', 'Exam Date: Arts'],
    examDateBusiness: ['examDateBusiness', 'businessExamDate', 'Business Exam', 'business exam', 'commerceExamDate', 'Commerce Exam', 'Exam Date: Business'],
    examCenters: ['examCenters', 'exam centers', 'Exam Centers'],
    logoUrl: ['logoUrl', 'logo', 'Logo'],
    isActive: ['isActive', 'active', 'Active', 'status'],
    featured: ['featured', 'Featured'],
    featuredOrder: ['featuredOrder', 'featured order', 'Featured Order'],
    categorySyncLocked: ['categorySyncLocked', 'category sync locked', 'Category Sync Locked'],
    clusterSyncLocked: ['clusterSyncLocked', 'cluster sync locked', 'Cluster Sync Locked'],
    verificationStatus: ['verificationStatus', 'verification status', 'Verification Status'],
    remarks: ['remarks', 'Remarks', 'notes', 'Notes'],
    slug: ['slug', 'Slug'],
};

function buildSlug(name: string): string {
    const normalized = slugify(name || '', { lower: true, strict: true });
    return normalized || `university-${Date.now()}`;
}

function normalizeHeaderKey(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function buildSuggestedMapping(headers: string[]): Record<string, string> {
    const normalizedHeaderMap = new Map<string, string>();
    headers.forEach((header) => {
        const normalized = normalizeHeaderKey(header);
        if (!normalized || normalizedHeaderMap.has(normalized)) return;
        normalizedHeaderMap.set(normalized, header);
    });

    return TARGET_FIELDS.reduce<Record<string, string>>((acc, field) => {
        const candidates = [field, ...(FIELD_HEADER_ALIASES[field] || [])]
            .map((entry) => normalizeHeaderKey(entry))
            .filter(Boolean);
        const match = candidates.find((candidate) => normalizedHeaderMap.has(candidate));
        if (match) {
            acc[field] = String(normalizedHeaderMap.get(match));
        }
        return acc;
    }, {});
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvEscape(value: unknown): string {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes(',') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function normalizeLooseOptionalText(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const lowered = text.toLowerCase();
    if (['n/a', 'na', 'none', 'null', '-', '--'].includes(lowered)) return '';
    return text;
}

function looksLikeEmail(value: string): boolean {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeUrl(value: string): boolean {
    if (!value) return true;
    try {
        const candidate = value.startsWith('http') ? value : `https://${value}`;
        // eslint-disable-next-line no-new
        new URL(candidate);
        return true;
    } catch {
        return false;
    }
}

function parseDate(raw: unknown): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : raw;
    }
    const numericValue = typeof raw === 'number' ? raw : Number(String(raw));
    if (Number.isFinite(numericValue)) {
        const excelDate = XLSX.SSF.parse_date_code(numericValue);
        if (excelDate) {
            return new Date(
                excelDate.y,
                Math.max(0, excelDate.m - 1),
                excelDate.d,
                excelDate.H || 0,
                excelDate.M || 0,
                Math.floor(excelDate.S || 0),
            );
        }
    }
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function parseAndFormatTextDate(raw: unknown): string {
    const rawStr = String(raw ?? '').trim();
    if (!rawStr) return '';
    const numericValue = typeof raw === 'number' ? raw : Number(rawStr);
    if (Number.isFinite(numericValue) && numericValue > 30000 && numericValue < 100000) {
        const d = parseDate(numericValue);
        if (d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    return rawStr;
}

// Bug 1.12 fix: Download and cache external logo images locally
const logoUploadDir = path.join(__dirname, '../../public/uploads/logos');

async function downloadAndCacheImage(url: string): Promise<string> {
    if (!fs.existsSync(logoUploadDir)) {
        fs.mkdirSync(logoUploadDir, { recursive: true });
    }
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, { timeout: 15000 });
    if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(new URL(url).pathname).toLowerCase() || '.jpg';
    const filename = `logo-${crypto.randomUUID()}${ext}`;
    const filePath = path.join(logoUploadDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return `/uploads/logos/${filename}`;
}

function readImportRows(fileBuffer: Buffer, filename: string): Record<string, unknown>[] {
    const lowerFileName = String(filename || '').toLowerCase();
    const textPayload = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    let workbook: XLSX.WorkBook;

    if (lowerFileName.endsWith('.csv')) {
        workbook = XLSX.read(textPayload, { type: 'string', FS: ',' });
    } else if (lowerFileName.endsWith('.tsv')) {
        workbook = XLSX.read(textPayload, { type: 'string', FS: '\t' });
    } else if (lowerFileName.endsWith('.txt')) {
        const detectedDelimiter = textPayload.includes('\t') ? '\t' : ',';
        workbook = XLSX.read(textPayload, { type: 'string', FS: detectedDelimiter });
    } else {
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function resolveActiveTargetFields(mapping: Record<string, string>, defaults: Record<string, unknown>): Set<TargetField> {
    return new Set(
        TARGET_FIELDS.filter((field) => Boolean(mapping[field]) || defaults[field] !== undefined),
    );
}

function normalizeShortForm(name: string, shortForm: string): string {
    const candidate = shortForm.trim();
    if (candidate) return candidate.toUpperCase();
    return name
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 8);
}

function normalizeValue(rawRow: Record<string, unknown>, mapping: Record<string, string>, defaults: Record<string, unknown>, field: TargetField): unknown {
    const mappedHeader = mapping[field];
    if (mappedHeader && rawRow[mappedHeader] !== undefined && rawRow[mappedHeader] !== null && rawRow[mappedHeader] !== '') return rawRow[mappedHeader];
    if (defaults[field] !== undefined) return defaults[field];
    return '';
}

function validateAndNormalizeRows(rows: Record<string, unknown>[], mapping: Record<string, string>, defaults: Record<string, unknown>): ValidationResult {
    const normalizedRows: Record<string, unknown>[] = [];
    const failedRows: Array<{ rowNumber: number; reason: string; payload?: Record<string, unknown> }> = [];
    const duplicateRows: number[] = [];

    const fileKeySeen = new Set<string>();
    const admissionKeySeen = new Set<string>();

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const rawNormalized = TARGET_FIELDS.reduce<Record<string, unknown>>((acc, field) => {
            acc[field] = normalizeValue(row, mapping, defaults, field);
            return acc;
        }, {});

        const name = String(rawNormalized.name || '').trim();
        const shortFormRaw = String(rawNormalized.shortForm || '').trim();
        const shortForm = normalizeShortForm(name, shortFormRaw);
        const category = String(rawNormalized.category || '').trim();
        const clusterGroup = String(rawNormalized.clusterGroup || '').trim();
        const email = normalizeLooseOptionalText(rawNormalized.email);
        const websiteUrl = normalizeLooseOptionalText(rawNormalized.websiteUrl);
        const admissionUrl = normalizeLooseOptionalText(rawNormalized.admissionUrl);
        const requestedSlug = String(rawNormalized.slug || '').trim();
        const appStartRaw = rawNormalized.applicationStartDate;
        const appEndRaw = rawNormalized.applicationEndDate;
        const appStartDate = parseDate(appStartRaw);
        const appEndDate = parseDate(appEndRaw);

        if (!name) {
            failedRows.push({ rowNumber, reason: 'Name is required.', payload: row });
            return;
        }
        if (!category) {
            failedRows.push({ rowNumber, reason: 'Category is required.', payload: row });
            return;
        }
        if (!looksLikeEmail(email)) {
            failedRows.push({ rowNumber, reason: 'Invalid email format.', payload: row });
            return;
        }
        if (!looksLikeUrl(websiteUrl)) {
            failedRows.push({ rowNumber, reason: 'Invalid website URL.', payload: row });
            return;
        }
        if (!looksLikeUrl(admissionUrl)) {
            failedRows.push({ rowNumber, reason: 'Invalid admission URL.', payload: row });
            return;
        }
        if (appStartRaw && !appStartDate) {
            failedRows.push({ rowNumber, reason: 'Invalid application start date.', payload: row });
            return;
        }
        if (appEndRaw && !appEndDate) {
            failedRows.push({ rowNumber, reason: 'Invalid application end date.', payload: row });
            return;
        }

        const fileKey = `${name.toLowerCase()}::${shortForm.toLowerCase()}`;
        if (fileKeySeen.has(fileKey)) duplicateRows.push(rowNumber);
        fileKeySeen.add(fileKey);
        if (requestedSlug) {
            const slugKey = requestedSlug.toLowerCase();
            if (admissionKeySeen.has(slugKey)) duplicateRows.push(rowNumber);
            admissionKeySeen.add(slugKey);
        }

        normalizedRows.push(normalizeUniversityImportRow({
            ...rawNormalized,
            rowNumber,
            category,
            clusterGroup,
            name,
            shortForm,
            shortDescription: String(rawNormalized.shortDescription || '').trim(),
            description: String(rawNormalized.description || '').trim(),
            establishedYear: Number(rawNormalized.establishedYear || 0) || undefined,
            address: String(rawNormalized.address || '').trim(),
            contactNumber: String(rawNormalized.contactNumber || '').trim(),
            email,
            websiteUrl,
            admissionUrl,
            totalSeats: String(rawNormalized.totalSeats || 'N/A').trim() || 'N/A',
            seatsScienceEng: String(rawNormalized.seatsScienceEng || 'N/A').trim() || 'N/A',
            seatsArtsHum: String(rawNormalized.seatsArtsHum || 'N/A').trim() || 'N/A',
            seatsBusiness: String(rawNormalized.seatsBusiness || 'N/A').trim() || 'N/A',
            applicationStartDate: appStartDate,
            applicationEndDate: appEndDate,
            examDateScience: parseAndFormatTextDate(rawNormalized.examDateScience),
            examDateArts: parseAndFormatTextDate(rawNormalized.examDateArts),
            examDateBusiness: parseAndFormatTextDate(rawNormalized.examDateBusiness),
            examCenters: normalizeExamCenters(rawNormalized.examCenters),
            logoUrl: String(rawNormalized.logoUrl || '').trim(),
            isActive: rawNormalized.isActive,
            featured: rawNormalized.featured,
            featuredOrder: Number(rawNormalized.featuredOrder || 0) || 0,
            categorySyncLocked: rawNormalized.categorySyncLocked,
            clusterSyncLocked: rawNormalized.clusterSyncLocked,
            verificationStatus: String(rawNormalized.verificationStatus || '').trim(),
            remarks: String(rawNormalized.remarks || '').trim(),
            slug: requestedSlug,
        }));
    });

    return { normalizedRows, failedRows, duplicateRows: Array.from(new Set(duplicateRows)).sort((a, b) => a - b) };
}

export async function adminInitUniversityImport(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file) { ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'No file uploaded.')); return; }
        const filename = String(req.file.originalname || 'import').toLowerCase();
        if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.tsv') && !filename.endsWith('.txt')) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Only CSV/XLSX/XLS/TSV/TXT files are supported.'));
            return;
        }
        const rows = readImportRows(req.file.buffer, filename);
        if (rows.length === 0) { ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Import file is empty.')); return; }

        const headers = Object.keys(rows[0] || {});
        const job = await UniversityImportJob.create({
            status: 'initialized',
            sourceFileName: req.file.originalname || 'import',
            mimeType: req.file.mimetype || '',
            createdBy: (req as Request & { user?: { _id?: string } }).user?._id || null,
            headers,
            sampleRows: rows.slice(0, 50),
            rawRows: rows,
            normalizedRows: [],
            mapping: {},
            defaults: {},
            failedRows: [],
        });

        ResponseBuilder.send(res, 201, ResponseBuilder.created({
            importJobId: String(job._id),
            headers,
            sampleRows: rows.slice(0, 20),
            targetFields: CANONICAL_TARGET_FIELDS,
            suggestedMapping: buildSuggestedMapping(headers),
        }));
    } catch (err) {
        console.error('adminInitUniversityImport error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to initialize import.'));
    }
}

export async function adminValidateUniversityImport(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const job = await UniversityImportJob.findById(req.params.jobId);
        if (!job) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.')); return; }

        const mapping = (req.body?.mapping || {}) as Record<string, string>;
        const defaults = (req.body?.defaults || {}) as Record<string, unknown>;

        // Bug 1.1 fix: Compute unmapped columns and warn about them
        const headers = (job.headers || []) as string[];
        const mappedHeaders = new Set(Object.values(mapping));
        const unmappedHeaders = headers.filter((h) => !mappedHeaders.has(h));
        const unmappedColumnWarnings = unmappedHeaders.map((header) => {
            // Try to suggest a field based on alias matching
            const normalizedHeader = normalizeHeaderKey(header);
            let suggestedField: string | undefined;
            for (const field of TARGET_FIELDS) {
                const candidates = [field, ...(FIELD_HEADER_ALIASES[field] || [])]
                    .map((entry) => normalizeHeaderKey(entry))
                    .filter(Boolean);
                if (candidates.includes(normalizedHeader)) {
                    suggestedField = field;
                    break;
                }
            }
            return { header, suggestedField, rowsAffected: (job.rawRows || []).length };
        });

        // If required fields (name, category) are unmapped and have no defaults, add validation errors
        const requiredFields: TargetField[] = ['name', 'category'];
        const unmappedRequiredErrors: Array<{ rowNumber: number; reason: string }> = [];
        for (const field of requiredFields) {
            if (!mapping[field] && defaults[field] === undefined) {
                unmappedRequiredErrors.push({
                    rowNumber: 0,
                    reason: `Required field '${field}' is not mapped to any column and has no default value. Import cannot proceed.`,
                });
            }
        }

        const { normalizedRows, failedRows, duplicateRows } = validateAndNormalizeRows(
            (job.rawRows || []) as Record<string, unknown>[],
            mapping,
            defaults,
        );

        // Merge unmapped required field errors into failedRows
        const allFailedRows = [...unmappedRequiredErrors, ...failedRows];

        const existingUniversities = await University.find({})
            .select('name shortForm slug')
            .lean();
        const existingByNameShort = new Set(
            existingUniversities.map((item) => `${String(item.name || '').trim().toLowerCase()}::${String(item.shortForm || '').trim().toLowerCase()}`),
        );
        const existingBySlug = new Set(
            existingUniversities
                .map((item) => String(item.slug || '').trim().toLowerCase())
                .filter(Boolean),
        );
        const dbDuplicates = normalizedRows
            .filter((row) => {
                const fileKey = `${String(row.name || '').trim().toLowerCase()}::${String(row.shortForm || '').trim().toLowerCase()}`;
                const slugKey = String(row.slug || '').trim().toLowerCase();
                return existingByNameShort.has(fileKey) || Boolean(slugKey && existingBySlug.has(slugKey));
            })
            .map((row) => Number(row.rowNumber || 0));

        job.mapping = mapping;
        job.defaults = defaults;
        job.normalizedRows = normalizedRows;
        job.failedRows = allFailedRows;
        job.validationSummary = {
            totalRows: (job.rawRows || []).length,
            validRows: normalizedRows.length,
            invalidRows: allFailedRows.length,
        };
        job.status = 'validated';
        await job.save();

        const warningMessages: string[] = [];
        if (duplicateRows.length > 0 || dbDuplicates.length > 0) {
            warningMessages.push('Duplicate university rows were detected in the file or existing database records.');
        }
        if (unmappedColumnWarnings.length > 0) {
            warningMessages.push(`${unmappedColumnWarnings.length} column(s) in the file are not mapped to any target field.`);
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            importJobId: String(job._id),
            validationSummary: job.validationSummary,
            failedRows: allFailedRows.slice(0, 200),
            failedRowCount: allFailedRows.length,
            unmappedColumns: unmappedHeaders,
            unmappedColumnWarnings,
            warnings: warningMessages,
            duplicates: {
                inFile: duplicateRows,
                inDatabase: Array.from(new Set(dbDuplicates)).filter(Boolean).sort((a, b) => a - b),
            },
        }));
    } catch (err) {
        console.error('adminValidateUniversityImport error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to validate import.'));
    }
}

export async function adminCommitUniversityImport(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const job = await UniversityImportJob.findById(req.params.jobId);
        if (!job) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.')); return; }
        if (job.status !== 'validated') { ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Run validation before committing import.')); return; }

        const mode = String(req.body?.mode || 'update-existing').toLowerCase() === 'create-only' ? 'create-only' : 'update-existing';
        const rows = (job.normalizedRows || []) as Array<Record<string, unknown>>;
        const importMapping = (job.mapping || {}) as Record<string, string>;
        const importDefaults = (job.defaults || {}) as Record<string, unknown>;
        const activeTargetFields = resolveActiveTargetFields(importMapping, importDefaults);
        const actorId = (req as Request & { user?: { _id?: string } }).user?._id || null;
        let inserted = 0;
        let updated = 0;
        const failedRows = [...(job.failedRows || [])];
        const warnings = new Set<string>();
        const slugResolutions: Array<{ rowNumber: number; originalSlug: string; resolvedSlug: string }> = [];

        const categoryNames = Array.from(new Set(
            rows.map((row) => String(row.category || '').trim()).filter(Boolean),
        ));
        const clusterNames = Array.from(new Set(
            rows.map((row) => String(row.clusterGroup || '').trim()).filter(Boolean),
        ));

        const existingCategories = await UniversityCategory.find({ name: { $in: categoryNames } }).select('_id name').lean() as Array<{ _id: mongoose.Types.ObjectId; name: string }>;
        const existingClusters = await UniversityCluster.find({ name: { $in: clusterNames } }).select('_id name').lean() as Array<{ _id: mongoose.Types.ObjectId; name: string }>;
        const categoryMap = new Map<string, { _id: mongoose.Types.ObjectId; name: string }>(
            existingCategories.map((item) => [String(item.name || '').trim(), item]),
        );
        const clusterMap = new Map<string, { _id: mongoose.Types.ObjectId; name: string }>(
            existingClusters.map((item) => [String(item.name || '').trim(), item]),
        );
        const createdCategoryNames = new Set<string>();
        const createdClusterNames = new Set<string>();

        for (const categoryName of categoryNames) {
            if (categoryMap.has(categoryName)) continue;
            const created = await ensureUniversityCategoryByName(categoryName);
            categoryMap.set(categoryName, created);
            createdCategoryNames.add(categoryName);
        }
        for (const clusterName of clusterNames) {
            if (clusterMap.has(clusterName)) continue;
            const created = await ensureUniversityClusterByName(clusterName);
            clusterMap.set(clusterName, created);
            createdClusterNames.add(clusterName);
        }

        const existingUniversities = await University.find({})
            .select('_id name shortForm slug')
            .lean();
        const existingByNameShort = new Map<string, { _id: mongoose.Types.ObjectId; slug?: string }>();
        const existingBySlug = new Map<string, { _id: mongoose.Types.ObjectId; slug?: string }>();
        const slugOwnerMap = new Map<string, string>();

        existingUniversities.forEach((item) => {
            const key = `${String(item.name || '').trim().toLowerCase()}::${String(item.shortForm || '').trim().toLowerCase()}`;
            if (key) existingByNameShort.set(key, { _id: item._id, slug: String(item.slug || '') });
            const slug = String(item.slug || '').trim().toLowerCase();
            if (slug) {
                existingBySlug.set(slug, { _id: item._id, slug: String(item.slug || '') });
                slugOwnerMap.set(slug, String(item._id));
            }
        });

        const clusterAssignments = new Map<string, string[]>();
        const clearClusterAssignments: string[] = [];

        const reserveUniqueSlug = (requested: string, ownerId?: string): string => {
            const seed = requested || `university-${Date.now()}`;
            const normalizedSeed = buildSlug(seed);
            let candidate = normalizedSeed;
            let suffix = 1;
            while (true) {
                const owner = slugOwnerMap.get(candidate.toLowerCase());
                if (!owner || (ownerId && owner === ownerId)) {
                    slugOwnerMap.set(candidate.toLowerCase(), ownerId || '__pending__');
                    return candidate;
                }
                candidate = `${normalizedSeed}-${suffix}`;
                suffix += 1;
            }
        };

        for (const row of rows) {
            try {
                const normalized = normalizeUniversityImportRow(row as Record<string, unknown>);
                const shouldApply = (...fields: TargetField[]): boolean => fields.some((field) => activeTargetFields.has(field));
                const name = String(normalized.name || '').trim();
                const shortForm = String(normalized.shortForm || '').trim();
                const admissionUrl = normalizeLooseOptionalText(normalized.admissionUrl);
                const requestedSlugKey = String(normalized.slug || '').trim().toLowerCase();
                const lookupKey = `${name.toLowerCase()}::${shortForm.toLowerCase()}`;
                const existing = (requestedSlugKey ? existingBySlug.get(requestedSlugKey) : undefined)
                    || existingByNameShort.get(lookupKey);

                if (existing && mode === 'create-only') {
                    failedRows.push({ rowNumber: Number(normalized.rowNumber || 0), reason: 'Duplicate existing row (create-only mode).', payload: row });
                    continue;
                }

                const categoryName = String(normalized.category || '').trim();
                const clusterName = String(normalized.clusterGroup || '').trim();
                const categoryDoc = categoryName ? categoryMap.get(categoryName) : null;
                const clusterDoc = clusterName ? clusterMap.get(clusterName) : null;
                const existingId = existing ? String(existing._id) : '';
                const requestedSlug = String(normalized.slug || '').trim();
                const shouldApplySlug = shouldApply('slug');
                const slug = reserveUniqueSlug(
                    shouldApplySlug ? (requestedSlug || (existing?.slug || buildSlug(name))) : (existing?.slug || buildSlug(name)),
                    existingId || undefined,
                );
                if (requestedSlug && slug !== requestedSlug) {
                    warnings.add(`Some imported slugs were adjusted to keep them unique. Example: ${requestedSlug} -> ${slug}`);
                    slugResolutions.push({
                        rowNumber: Number(normalized.rowNumber || 0),
                        originalSlug: requestedSlug,
                        resolvedSlug: slug,
                    });
                }

                // Bug 1.12 fix: Download and cache external logo URLs
                let logoUrl = String(normalized.logoUrl || '').trim();
                if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
                    try {
                        logoUrl = await downloadAndCacheImage(logoUrl);
                    } catch (downloadErr) {
                        warnings.add(`Failed to cache external logo for row ${Number(normalized.rowNumber || 0)}: ${downloadErr instanceof Error ? downloadErr.message : 'Unknown error'}. Keeping external URL.`);
                    }
                }

                const payload = {
                    name,
                    shortForm,
                    category: categoryName,
                    categoryId: categoryDoc ? categoryDoc._id : null,
                    clusterId: clusterDoc ? clusterDoc._id : null,
                    clusterName: clusterDoc ? clusterDoc.name : '',
                    clusterGroup: clusterDoc ? clusterDoc.name : '',
                    shortDescription: String(normalized.shortDescription || '').trim(),
                    description: String(normalized.description || '').trim(),
                    applicationStartDate: normalized.applicationStartDate || null,
                    applicationEndDate: normalized.applicationEndDate || null,
                    scienceExamDate: String(normalized.examDateScience || normalized.scienceExamDate || '').trim(),
                    examDateScience: String(normalized.examDateScience || normalized.scienceExamDate || '').trim(),
                    artsExamDate: String(normalized.examDateArts || normalized.artsExamDate || '').trim(),
                    examDateArts: String(normalized.examDateArts || normalized.artsExamDate || '').trim(),
                    businessExamDate: String(normalized.examDateBusiness || normalized.businessExamDate || '').trim(),
                    examDateBusiness: String(normalized.examDateBusiness || normalized.businessExamDate || '').trim(),
                    examCenters: normalizeExamCenters(normalized.examCenters),
                    contactNumber: String(normalized.contactNumber || '').trim(),
                    address: String(normalized.address || '').trim(),
                    email: String(normalized.email || '').trim(),
                    website: String(normalized.websiteUrl || '').trim(),
                    websiteUrl: String(normalized.websiteUrl || '').trim(),
                    admissionWebsite: admissionUrl,
                    admissionUrl,
                    established: normalized.establishedYear ? Number(normalized.establishedYear) : undefined,
                    establishedYear: normalized.establishedYear ? Number(normalized.establishedYear) : undefined,
                    totalSeats: String(normalized.totalSeats || 'N/A').trim() || 'N/A',
                    scienceSeats: String(normalized.seatsScienceEng || 'N/A').trim() || 'N/A',
                    seatsScienceEng: String(normalized.seatsScienceEng || 'N/A').trim() || 'N/A',
                    artsSeats: String(normalized.seatsArtsHum || 'N/A').trim() || 'N/A',
                    seatsArtsHum: String(normalized.seatsArtsHum || 'N/A').trim() || 'N/A',
                    businessSeats: String(normalized.seatsBusiness || 'N/A').trim() || 'N/A',
                    seatsBusiness: String(normalized.seatsBusiness || 'N/A').trim() || 'N/A',
                    logoUrl,
                    isActive: Boolean(normalized.isActive !== false),
                    featured: Boolean(normalized.featured),
                    featuredOrder: Number(normalized.featuredOrder || 0) || 0,
                    categorySyncLocked: Boolean(normalized.categorySyncLocked),
                    clusterSyncLocked: Boolean(normalized.clusterSyncLocked),
                    verificationStatus: String(normalized.verificationStatus || 'Pending').trim() || 'Pending',
                    remarks: String(normalized.remarks || '').trim(),
                    slug,
                    isArchived: false,
                    archivedAt: null,
                    archivedBy: null,
                };

                let universityId = existingId;
                if (existing) {
                    const updateSet: Record<string, unknown> = {};
                    if (shouldApply('name')) updateSet.name = payload.name;
                    if (shouldApply('shortForm')) updateSet.shortForm = payload.shortForm;
                    if (shouldApply('category')) {
                        updateSet.category = payload.category;
                        updateSet.categoryId = payload.categoryId;
                    }
                    if (shouldApply('clusterGroup')) {
                        updateSet.clusterId = payload.clusterId;
                        updateSet.clusterName = payload.clusterName;
                        updateSet.clusterGroup = payload.clusterGroup;
                    }
                    if (shouldApply('shortDescription')) updateSet.shortDescription = payload.shortDescription;
                    if (shouldApply('description')) updateSet.description = payload.description;
                    if (shouldApply('applicationStartDate')) updateSet.applicationStartDate = payload.applicationStartDate;
                    if (shouldApply('applicationEndDate')) updateSet.applicationEndDate = payload.applicationEndDate;
                    if (shouldApply('examDateScience')) {
                        updateSet.scienceExamDate = payload.scienceExamDate;
                        updateSet.examDateScience = payload.examDateScience;
                    }
                    if (shouldApply('examDateArts')) {
                        updateSet.artsExamDate = payload.artsExamDate;
                        updateSet.examDateArts = payload.examDateArts;
                    }
                    if (shouldApply('examDateBusiness')) {
                        updateSet.businessExamDate = payload.businessExamDate;
                        updateSet.examDateBusiness = payload.examDateBusiness;
                    }
                    if (shouldApply('examCenters')) updateSet.examCenters = payload.examCenters;
                    if (shouldApply('contactNumber')) updateSet.contactNumber = payload.contactNumber;
                    if (shouldApply('address')) updateSet.address = payload.address;
                    if (shouldApply('email')) updateSet.email = payload.email;
                    if (shouldApply('websiteUrl')) {
                        updateSet.website = payload.website;
                        updateSet.websiteUrl = payload.websiteUrl;
                    }
                    if (shouldApply('admissionUrl')) {
                        updateSet.admissionWebsite = payload.admissionWebsite;
                        updateSet.admissionUrl = payload.admissionUrl;
                    }
                    if (shouldApply('establishedYear')) {
                        updateSet.established = payload.established;
                        updateSet.establishedYear = payload.establishedYear;
                    }
                    if (shouldApply('totalSeats')) updateSet.totalSeats = payload.totalSeats;
                    if (shouldApply('seatsScienceEng')) {
                        updateSet.scienceSeats = payload.scienceSeats;
                        updateSet.seatsScienceEng = payload.seatsScienceEng;
                    }
                    if (shouldApply('seatsArtsHum')) {
                        updateSet.artsSeats = payload.artsSeats;
                        updateSet.seatsArtsHum = payload.seatsArtsHum;
                    }
                    if (shouldApply('seatsBusiness')) {
                        updateSet.businessSeats = payload.businessSeats;
                        updateSet.seatsBusiness = payload.seatsBusiness;
                    }
                    if (shouldApply('logoUrl')) updateSet.logoUrl = payload.logoUrl;
                    if (shouldApply('isActive')) updateSet.isActive = payload.isActive;
                    if (shouldApply('featured')) updateSet.featured = payload.featured;
                    if (shouldApply('featuredOrder')) updateSet.featuredOrder = payload.featuredOrder;
                    if (shouldApply('categorySyncLocked')) updateSet.categorySyncLocked = payload.categorySyncLocked;
                    if (shouldApply('clusterSyncLocked')) updateSet.clusterSyncLocked = payload.clusterSyncLocked;
                    if (shouldApply('verificationStatus')) updateSet.verificationStatus = payload.verificationStatus;
                    if (shouldApply('remarks')) updateSet.remarks = payload.remarks;
                    if (shouldApplySlug) updateSet.slug = payload.slug;

                    if (Object.keys(updateSet).length > 0) {
                        const updateResult = await University.updateOne(
                            { _id: existing._id },
                            { $set: updateSet },
                            { runValidators: true },
                        );
                        if (!updateResult.matchedCount) {
                            failedRows.push({
                                rowNumber: Number(normalized.rowNumber || 0),
                                reason: 'University not found while updating.',
                                payload: row,
                            });
                            continue;
                        }
                    }
                    updated += 1;
                } else {
                    const newId = new mongoose.Types.ObjectId();
                    universityId = String(newId);
                    await University.create({
                        _id: newId,
                        ...payload,
                    });
                    inserted += 1;
                }

                existingByNameShort.set(lookupKey, { _id: new mongoose.Types.ObjectId(universityId), slug });
                if (slug) {
                    existingBySlug.set(slug.toLowerCase(), { _id: new mongoose.Types.ObjectId(universityId), slug });
                }

                if (shouldApply('clusterGroup')) {
                    if (clusterDoc) {
                        const current = clusterAssignments.get(String(clusterDoc._id)) || [];
                        current.push(universityId);
                        clusterAssignments.set(String(clusterDoc._id), current);
                    } else {
                        clearClusterAssignments.push(universityId);
                    }
                }
            } catch (err: unknown) {
                const reason = err instanceof Error ? err.message : 'Unknown commit error';
                failedRows.push({ rowNumber: Number(row.rowNumber || 0), reason, payload: row });
            }
        }

        try {
            if (clearClusterAssignments.length > 0) {
                await syncManualClusterMembership(clearClusterAssignments, null);
            }
            for (const [clusterId, universityIds] of clusterAssignments.entries()) {
                await syncManualClusterMembership(Array.from(new Set(universityIds)), clusterId);
            }
            await reconcileUniversityClusterAssignments(actorId);
        } catch (clusterSyncError: unknown) {
            const message = clusterSyncError instanceof Error ? clusterSyncError.message : 'Unknown cluster sync error';
            warnings.add(`Cluster sync warning: ${message}`);
        }

        job.failedRows = failedRows;
        job.commitSummary = {
            inserted,
            updated,
            failed: failedRows.length,
            createdCategories: createdCategoryNames.size,
            createdClusters: createdClusterNames.size,
            failedRowCount: failedRows.length,
        };
        job.status = failedRows.length > 0 ? 'failed' : 'committed';
        await job.save();

        broadcastHomeStreamEvent({
            type: 'home-updated',
            meta: { source: 'university_import', inserted, updated, failed: failedRows.length },
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            importJobId: String(job._id),
            commitSummary: job.commitSummary,
            createdCategories: createdCategoryNames.size,
            createdClusters: createdClusterNames.size,
            failedRows: failedRows.slice(0, 200),
            failedRowCount: failedRows.length,
            slugResolutions,
            warnings: Array.from(warnings)
        }, `Import completed (${mode}). inserted=${inserted}, updated=${updated}, failed=${failedRows.length}`));
    } catch (err) {
        console.error('adminCommitUniversityImport error:', err);
        const detail = err instanceof Error ? err.message : 'Unknown error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', `Failed to commit import. ${detail}`));
    }
}

export async function adminDownloadUniversityImportTemplate(req: Request, res: Response): Promise<void> {
    try {
        const format = String(req.query.format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
        const sampleRow: Record<string, string | number> = {
            category: 'Science & Technology',
            clusterGroup: 'GST-Science&Tech',
            name: 'Dhaka Example University',
            shortForm: 'DEU',
            shortDescription: 'A sample public university for template preview.',
            description: 'This row demonstrates the full import/export schema for universities.',
            establishedYear: 1995,
            address: 'Dhaka, Bangladesh',
            contactNumber: '01700000000',
            email: 'info@exampleuniversity.edu',
            websiteUrl: 'https://exampleuniversity.edu',
            admissionUrl: 'https://admission.exampleuniversity.edu',
            totalSeats: 2500,
            seatsScienceEng: 1200,
            seatsArtsHum: 700,
            seatsBusiness: 600,
            applicationStartDate: '2026-05-01',
            applicationEndDate: '2026-06-15',
            examDateScience: '2026-07-10',
            examDateArts: '2026-07-11',
            examDateBusiness: '2026-07-12',
            examCenters: 'Dhaka - BUET Campus | Chattogram - CUET Campus',
        };
        // Bug 1.6 fix: Add format hints row
        const formatHintsRow: Record<string, string> = {
            category: 'text (required)',
            clusterGroup: 'text',
            name: 'text (required)',
            shortForm: 'text (auto-generated if empty)',
            shortDescription: 'text',
            description: 'text',
            establishedYear: 'number (e.g. 1995)',
            address: 'text',
            contactNumber: 'text (e.g. 01700000000)',
            email: 'email (e.g. info@example.edu)',
            websiteUrl: 'URL (e.g. https://example.edu)',
            admissionUrl: 'URL (e.g. https://admission.example.edu)',
            totalSeats: 'number',
            seatsScienceEng: 'number',
            seatsArtsHum: 'number',
            seatsBusiness: 'number',
            applicationStartDate: 'YYYY-MM-DD',
            applicationEndDate: 'YYYY-MM-DD',
            examDateScience: 'YYYY-MM-DD',
            examDateArts: 'YYYY-MM-DD',
            examDateBusiness: 'YYYY-MM-DD',
            examCenters: 'pipe-separated (e.g. City - Venue | City - Venue)',
        };
        const blankRow: Record<string, string> = TEMPLATE_HEADERS.reduce((acc, key) => ({ ...acc, [key]: '' }), {});

        if (format === 'csv') {
            const rows = [sampleRow, formatHintsRow, blankRow];
            const lines = rows.map((row) => TEMPLATE_HEADERS.map((header) => csvEscape(row[header])).join(','));
            const csv = `${TEMPLATE_HEADERS.join(',')}\n${lines.join('\n')}`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=university_import_template.csv');
            res.send(csv);
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet([sampleRow, formatHintsRow, blankRow], { header: TEMPLATE_HEADERS });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

        // Bug 1.6 fix: Add README sheet with field descriptions for XLSX
        const readmeData = TEMPLATE_HEADERS.map((field) => ({
            Field: field,
            Description: formatHintsRow[field] || 'text',
            Required: ['name', 'category'].includes(field) ? 'Yes' : 'No',
        }));
        const readmeSheet = XLSX.utils.json_to_sheet(readmeData);
        XLSX.utils.book_append_sheet(workbook, readmeSheet, 'README');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=template.xlsx');
        res.send(buffer);
    } catch (err) {
        console.error('adminDownloadUniversityImportTemplate error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to download template.'));
    }
}

export async function adminGetUniversityImportJob(req: Request, res: Response): Promise<void> {
    try {
        const job = await UniversityImportJob.findById(req.params.jobId).lean();
        if (!job) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            importJobId: String(job._id),
            status: job.status,
            sourceFileName: job.sourceFileName,
            headers: job.headers,
            sampleRows: (job.sampleRows || []).slice(0, 20),
            mapping: job.mapping || {},
            defaults: job.defaults || {},
            validationSummary: job.validationSummary || null,
            commitSummary: job.commitSummary || null,
            failedRows: (job.failedRows || []).slice(0, 200),
            failedRowCount: (job.failedRows || []).length,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        }));
    } catch (err) {
        console.error('adminGetUniversityImportJob error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to get import status.'));
    }
}

export async function adminDownloadUniversityImportErrors(req: Request, res: Response): Promise<void> {
    try {
        const job = await UniversityImportJob.findById(req.params.jobId).lean();
        if (!job) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.')); return; }
        const failedRows = job.failedRows || [];
        const headers = ['rowNumber', 'reason', 'payload'];
        const lines = failedRows.map((item) => [item.rowNumber, item.reason, JSON.stringify(item.payload || {})].map(csvEscape).join(','));
        const csv = `${headers.join(',')}\n${lines.join('\n')}`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=university_import_errors_${String(job._id)}.csv`);
        res.send(csv);
    } catch (err) {
        console.error('adminDownloadUniversityImportErrors error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to download import errors.'));
    }
}
