import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getFirebaseStorageBucket } from '../config/firebaseAdmin';
import { buildSecureUploadUrl, registerSecureUpload } from '../services/secureUploadService';

// Ensure the upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Build absolute URL for uploaded files.
 * Uses environment variable BACKEND_URL if available, otherwise falls back to request origin.
 */
function buildAbsoluteUploadUrl(relativeUrl: string, requestOrigin: string): string {
    const backendUrl = String(process.env.BACKEND_URL || '').trim();
    const baseUrl = backendUrl || requestOrigin;
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `${normalizedBase}${normalizedPath}`;
}

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/heic',
    'image/heif',
    'image/tiff',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'text/csv',
    'text/plain',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
]);

const ALLOWED_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.svg',
    '.heic',
    '.heif',
    '.tiff',
    '.tif',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.csv',
    '.txt',
    '.zip',
    '.mp4',
    '.webm',
    '.mov',
    '.mkv',
]);

function isAllowedUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>): boolean {
    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    const extension = path.extname(String(file.originalname || '')).trim().toLowerCase();

    if (ALLOWED_MIME_TYPES.has(mimeType)) {
        return true;
    }

    return ALLOWED_EXTENSIONS.has(extension);
}
const SECURE_CATEGORIES = new Set(['profile_photo', 'student_document', 'payment_proof', 'support_attachment', 'exam_upload', 'admin_upload']);

// Configure multer storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        // Generate a unique filename: timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Create the upload middleware (limit 25MB)
export const uploadMiddleware = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!isAllowedUpload(file)) {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
            return;
        }
        cb(null, true);
    },
});

/* ─────── UPLOAD MEDIA ─────── */
/**
 * POST /api/admin/media/upload
 * Expects form-data with a 'file' field.
 */
export async function uploadMedia(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded.' });
            return;
        }

        if (!isAllowedUpload(req.file)) {
            res.status(400).json({ message: `Unsupported file type: ${req.file.mimetype}` });
            return;
        }

        const origin = `${req.protocol}://${req.get('host')}`;
        const requestedVisibility = String(req.body?.visibility || req.query.visibility || '').trim().toLowerCase() === 'protected'
            ? 'protected'
            : 'public';
        const requestedCategoryRaw = String(req.body?.category || req.query.category || '').trim().toLowerCase();
        const requestedCategory = SECURE_CATEGORIES.has(requestedCategoryRaw) ? requestedCategoryRaw : 'admin_upload';
        const accessRoles = String(req.body?.accessRoles || req.query.accessRoles || '')
            .split(',')
            .map((role) => role.trim().toLowerCase())
            .filter(Boolean);
        const firebaseBucket = getFirebaseStorageBucket();
        if (firebaseBucket && requestedVisibility !== 'protected') {
            try {
                const ext = path.extname(req.file.originalname || '').toLowerCase() || path.extname(req.file.filename || '');
                const safeExt = ext && ext.length <= 10 ? ext : '';
                const objectKey = `media/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
                const fileRef = firebaseBucket.file(objectKey);
                await fileRef.save(fs.readFileSync(req.file.path), {
                    metadata: {
                        contentType: req.file.mimetype,
                    },
                    resumable: false,
                    public: true,
                });

                const publicUrl = `https://storage.googleapis.com/${firebaseBucket.name}/${objectKey}`;
                fs.unlink(req.file.path, () => { /* ignore */ });
                res.status(201).json({
                    message: 'File uploaded successfully.',
                    url: publicUrl,
                    absoluteUrl: publicUrl,
                    filename: objectKey,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    provider: 'firebase',
                });
                return;
            } catch (firebaseErr) {
                console.warn('[uploadMedia] Firebase upload failed, falling back to local storage:', firebaseErr);
                // Fall through to local storage
            }
        }

        if (requestedVisibility === 'protected') {
            const secureUpload = await registerSecureUpload({
                file: req.file,
                category: requestedCategory as Parameters<typeof registerSecureUpload>[0]['category'],
                visibility: 'protected',
                ownerUserId: req.user?._id || null,
                ownerRole: req.user?.role || null,
                uploadedBy: req.user?._id || null,
                accessRoles,
            });
            const url = buildSecureUploadUrl(secureUpload.storedName);
            res.status(201).json({
                message: 'File uploaded successfully.',
                url,
                absoluteUrl: `${origin}${url}`,
                filename: secureUpload.storedName,
                mimetype: secureUpload.mimeType,
                size: secureUpload.sizeBytes,
                visibility: secureUpload.visibility,
            });
            return;
        }

        // Runtime check: ensure upload directory exists before local storage write
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Construct the public URL for the uploaded file
        // For development, it will be served from the local Node server e.g. /uploads/filename.ext
        const fileUrl = `/uploads/${req.file.filename}`;
        const absoluteUrl = buildAbsoluteUploadUrl(fileUrl, origin);

        res.status(201).json({
            message: 'File uploaded successfully.',
            url: fileUrl,
            absoluteUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            visibility: 'public',
        });
    } catch (err) {
        console.error('[uploadMedia]', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ message: `Server error during file upload: ${errorMessage}` });
    }
}
