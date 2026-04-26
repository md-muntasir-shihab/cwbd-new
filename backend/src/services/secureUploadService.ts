import crypto from 'crypto';
import type { Express } from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import SecureUpload, { ISecureUpload, SecureUploadCategory, SecureUploadVisibility } from '../models/SecureUpload';

type RegisterSecureUploadInput = {
    file: Express.Multer.File;
    category: SecureUploadCategory;
    visibility: SecureUploadVisibility;
    ownerUserId?: string | mongoose.Types.ObjectId | null;
    ownerRole?: string | null;
    uploadedBy?: string | mongoose.Types.ObjectId | null;
    accessRoles?: string[];
};

type EnsureSecureUploadUrlInput = {
    url: string;
    category: SecureUploadCategory;
    visibility: SecureUploadVisibility;
    ownerUserId?: string | mongoose.Types.ObjectId | null;
    ownerRole?: string | null;
    uploadedBy?: string | mongoose.Types.ObjectId | null;
    accessRoles?: string[];
};

function toObjectId(value: string | mongoose.Types.ObjectId | null | undefined): mongoose.Types.ObjectId | null {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function normalizeExtension(fileName: string): string {
    return path.extname(String(fileName || ''))
        .replace(/^\./, '')
        .trim()
        .toLowerCase();
}

function normalizeAccessRoles(accessRoles?: string[]): string[] {
    return Array.from(
        new Set(
            (Array.isArray(accessRoles) ? accessRoles : [])
                .map((role) => String(role || '').trim().toLowerCase())
                .filter(Boolean),
        ),
    );
}

function guessMimeType(fileName: string): string {
    const extension = normalizeExtension(fileName);
    switch (extension) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        case 'gif':
            return 'image/gif';
        case 'svg':
            return 'image/svg+xml';
        case 'pdf':
            return 'application/pdf';
        case 'doc':
            return 'application/msword';
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'xls':
            return 'application/vnd.ms-excel';
        case 'xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'csv':
            return 'text/csv';
        case 'txt':
            return 'text/plain';
        default:
            return 'application/octet-stream';
    }
}

export function buildSecureUploadUrl(storedName: string): string {
    return `/uploads/${encodeURIComponent(storedName)}`;
}

export async function registerSecureUpload(input: RegisterSecureUploadInput): Promise<ISecureUpload> {
    const fileBuffer = await fs.promises.readFile(input.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const storedName = String(input.file.filename || '').trim();
    const accessRoles = normalizeAccessRoles(input.accessRoles);

    return SecureUpload.create({
        ownerUserId: toObjectId(input.ownerUserId),
        ownerRole: input.ownerRole ? String(input.ownerRole).trim().toLowerCase() : null,
        category: input.category,
        visibility: input.visibility,
        originalName: String(input.file.originalname || storedName).trim(),
        storedName,
        storagePath: path.resolve(input.file.path),
        mimeType: String(input.file.mimetype || 'application/octet-stream').trim().toLowerCase(),
        extension: normalizeExtension(input.file.originalname || storedName),
        sizeBytes: Number(input.file.size || 0),
        fileHash,
        uploadedBy: toObjectId(input.uploadedBy),
        accessRoles,
    });
}

/**
 * Bug 1.10 fix: Revoke all uploads for a user by setting deletedAt.
 * Called during account deactivation/deletion to prevent orphaned file access.
 */
export async function revokeUploadsForUser(userId: string): Promise<number> {
    const result = await SecureUpload.updateMany(
        { ownerUserId: toObjectId(userId), deletedAt: null },
        { $set: { deletedAt: new Date() } },
    );
    return result.modifiedCount;
}

export async function ensureSecureUploadUrl(input: EnsureSecureUploadUrlInput): Promise<string> {
    const rawUrl = String(input.url || '').trim();
    if (!rawUrl) return '';
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

    const sanitizedUrl = rawUrl.split('#')[0]?.split('?')[0] || rawUrl;
    if (!sanitizedUrl.startsWith('/uploads/')) return rawUrl;

    const storedName = decodeURIComponent(sanitizedUrl.replace(/^\/uploads\//, '').trim());
    if (!storedName) return rawUrl;

    const existing = await SecureUpload.findOne({ storedName, deletedAt: null }).lean();
    if (existing) {
        return buildSecureUploadUrl(existing.storedName);
    }

    const storagePath = path.resolve(__dirname, '../../public/uploads', storedName);
    const fileExists = await fs.promises.stat(storagePath).then((stats) => stats.isFile()).catch(() => false);
    if (!fileExists) return rawUrl;

    try {
        const fileBuffer = await fs.promises.readFile(storagePath);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const stats = await fs.promises.stat(storagePath);

        await SecureUpload.create({
            ownerUserId: toObjectId(input.ownerUserId),
            ownerRole: input.ownerRole ? String(input.ownerRole).trim().toLowerCase() : null,
            category: input.category,
            visibility: input.visibility,
            originalName: storedName,
            storedName,
            storagePath,
            mimeType: guessMimeType(storedName),
            extension: normalizeExtension(storedName),
            sizeBytes: Number(stats.size || 0),
            fileHash,
            uploadedBy: toObjectId(input.uploadedBy),
            accessRoles: normalizeAccessRoles(input.accessRoles),
        });
    } catch (error: any) {
        if (error?.code !== 11000) {
            throw error;
        }
    }

    return buildSecureUploadUrl(storedName);
}
