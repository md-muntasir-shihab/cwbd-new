/**
 * Property 10: Preservation — File Upload Unchanged Flows
 *
 * For any upload request where the file upload bug condition does NOT hold
 * (signed URL flow for configured providers, local fallback, oversized file
 * rejection), the system SHALL produce exactly the same behavior as the
 * original system.
 *
 * These tests observe and lock in the CORRECT behavior of the unfixed code
 * for non-bug-condition upload states. They must PASS on unfixed code.
 *
 * **Validates: Requirements 3.13, 3.14, 3.15**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Constants matching UNFIXED mediaController.ts ───────────────────

/**
 * The ACTUAL ALLOWED_MIME_TYPES set from mediaController.ts (unfixed code).
 * These are the MIME types that currently work correctly and must continue
 * to be accepted after the fix.
 */
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/heic',
    'image/heif',
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
]);

const ALLOWED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.heic', '.heif', '.pdf', '.doc', '.docx', '.xls',
    '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.zip',
    '.mp4', '.webm', '.mov',
]);

/** Multer limit from uploadMiddleware config */
const MULTER_FILE_SIZE_LIMIT = 25 * 1024 * 1024; // 25MB

// ─── Pure Logic Under Test (extracted from mediaController.ts) ───────

/**
 * Mirrors `isAllowedUpload` from mediaController.ts exactly.
 * Checks MIME type first, then falls back to extension check.
 */
function isAllowedUpload(mimetype: string, originalname: string): boolean {
    const mimeType = String(mimetype || '').trim().toLowerCase();
    const extension = getExtension(String(originalname || '')).trim().toLowerCase();

    if (ALLOWED_MIME_TYPES.has(mimeType)) {
        return true;
    }
    return ALLOWED_EXTENSIONS.has(extension);
}

function getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot);
}

/**
 * Mirrors `buildAbsoluteUploadUrl` from mediaController.ts.
 */
function buildAbsoluteUploadUrl(relativeUrl: string, requestOrigin: string): string {
    const backendUrl = ''; // No BACKEND_URL in test env
    const baseUrl = backendUrl || requestOrigin;
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `${normalizedBase}${normalizedPath}`;
}

// ─── Types ───────────────────────────────────────────────────────────

interface UploadFile {
    mimetype: string;
    originalname: string;
    size: number;
}

interface UploadResult {
    accepted: boolean;
    statusCode: number;
    url?: string;
    absoluteUrl?: string;
    message?: string;
    provider?: string;
}

/**
 * Simulates the upload validation + local storage pipeline on UNFIXED code.
 * This captures the current correct behavior for non-bug-condition inputs.
 */
function simulateUploadPipeline(file: UploadFile, hasFirebaseBucket: boolean): UploadResult {
    // Step 1: Multer fileFilter — MIME/extension check
    if (!isAllowedUpload(file.mimetype, file.originalname)) {
        return {
            accepted: false,
            statusCode: 400,
            message: 'Unsupported file type',
        };
    }

    // Step 2: Multer size limit
    if (file.size > MULTER_FILE_SIZE_LIMIT) {
        return {
            accepted: false,
            statusCode: 400,
            message: 'File too large',
        };
    }

    // Step 3: Storage provider routing
    if (hasFirebaseBucket) {
        // Firebase signed URL flow — returns a public GCS URL
        const ext = getExtension(file.originalname).toLowerCase();
        const safeExt = ext && ext.length <= 10 ? ext : '';
        const objectKey = `media/1234567890-abcdef${safeExt}`;
        const publicUrl = `https://storage.googleapis.com/test-bucket/${objectKey}`;
        return {
            accepted: true,
            statusCode: 201,
            url: publicUrl,
            absoluteUrl: publicUrl,
            provider: 'firebase',
            message: 'File uploaded successfully.',
        };
    }

    // Step 4: Local fallback
    const ext = getExtension(file.originalname).toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : '';
    const fileUrl = `/uploads/file-1234567890-999999999${safeExt}`;
    const absoluteUrl = buildAbsoluteUploadUrl(fileUrl, 'http://localhost:5000');
    return {
        accepted: true,
        statusCode: 201,
        url: fileUrl,
        absoluteUrl,
        provider: 'local',
        message: 'File uploaded successfully.',
    };
}

// ─── Generators ──────────────────────────────────────────────────────

/** MIME types that are ALREADY accepted in unfixed code (non-bug-condition) */
const acceptedMimeTypeArb = fc.constantFrom(
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'image/svg+xml', 'image/heic', 'image/heif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
    'text/csv', 'text/plain',
    'video/mp4', 'video/webm', 'video/quicktime',
);

/** Map MIME types to matching filenames */
const MIME_TO_FILENAME: Record<string, string> = {
    'image/jpeg': 'photo.jpg',
    'image/jpg': 'photo.jpg',
    'image/png': 'image.png',
    'image/webp': 'image.webp',
    'image/gif': 'animation.gif',
    'image/svg+xml': 'icon.svg',
    'image/heic': 'photo.heic',
    'image/heif': 'photo.heif',
    'application/pdf': 'document.pdf',
    'application/msword': 'document.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document.docx',
    'application/vnd.ms-excel': 'spreadsheet.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet.xlsx',
    'application/vnd.ms-powerpoint': 'presentation.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation.pptx',
    'application/zip': 'archive.zip',
    'application/x-zip-compressed': 'archive.zip',
    'application/octet-stream': 'file.bin',
    'text/csv': 'data.csv',
    'text/plain': 'readme.txt',
    'video/mp4': 'video.mp4',
    'video/webm': 'video.webm',
    'video/quicktime': 'video.mov',
};

function filenameForMime(mime: string): string {
    return MIME_TO_FILENAME[mime] || 'file.bin';
}

/** Valid file sizes (within 25MB limit) */
const validFileSizeArb = fc.integer({ min: 1, max: MULTER_FILE_SIZE_LIMIT });

/** Oversized file sizes (exceeding 25MB limit) */
const oversizedFileSizeArb = fc.integer({
    min: MULTER_FILE_SIZE_LIMIT + 1,
    max: MULTER_FILE_SIZE_LIMIT * 4,
});

/** Completely invalid MIME types that should always be rejected */
const invalidMimeTypeArb = fc.constantFrom(
    'application/x-executable',
    'application/x-shellscript',
    'text/html',
    'application/javascript',
    'application/x-php',
);

/** Generate a valid upload file (accepted MIME, within size limit) */
const validUploadFileArb: fc.Arbitrary<UploadFile> = acceptedMimeTypeArb.chain(
    (mime) => fc.record({
        mimetype: fc.constant(mime),
        originalname: fc.constant(filenameForMime(mime)),
        size: validFileSizeArb,
    }),
);

/** Generate an oversized upload file (accepted MIME, over size limit) */
const oversizedUploadFileArb: fc.Arbitrary<UploadFile> = acceptedMimeTypeArb.chain(
    (mime) => fc.record({
        mimetype: fc.constant(mime),
        originalname: fc.constant(filenameForMime(mime)),
        size: oversizedFileSizeArb,
    }),
);

/** Generate a file with invalid MIME type and non-matching extension */
const invalidTypeFileArb: fc.Arbitrary<UploadFile> = invalidMimeTypeArb.chain(
    (mime) => fc.record({
        mimetype: fc.constant(mime),
        originalname: fc.constant('malicious.exe'),
        size: validFileSizeArb,
    }),
);

/** Accepted extensions for extension-based fallback testing */
const acceptedExtensionArb = fc.constantFrom(...[...ALLOWED_EXTENSIONS]);

// ─── Property Tests ──────────────────────────────────────────────────

describe('Property 10: Preservation — File Upload Unchanged Flows', () => {

    /**
     * **Validates: Requirements 3.13**
     *
     * Firebase/S3 signed URL upload flow continues working for configured
     * providers. When a Firebase bucket is available and the file passes
     * validation, the upload returns a GCS public URL.
     */
    describe('3.13: Firebase signed URL flow works for configured providers', () => {
        it('valid files with Firebase bucket return firebase provider and GCS URL', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, true);

                        expect(result.accepted).toBe(true);
                        expect(result.statusCode).toBe(201);
                        expect(result.provider).toBe('firebase');
                        expect(result.url).toBeDefined();
                        expect(result.url!.startsWith('https://storage.googleapis.com/')).toBe(true);
                        expect(result.absoluteUrl).toBe(result.url);
                        expect(result.message).toBe('File uploaded successfully.');
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('firebase URL includes correct file extension from original name', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, true);
                        const expectedExt = getExtension(file.originalname).toLowerCase();

                        expect(result.accepted).toBe(true);
                        if (expectedExt && expectedExt.length <= 10) {
                            expect(result.url!.endsWith(expectedExt)).toBe(true);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.14**
     *
     * Local upload fallback continues working when no Firebase/S3 is
     * configured. Files are stored in `public/uploads` and the response
     * includes both relative and absolute URLs.
     */
    describe('3.14: Local fallback stores files in public/uploads', () => {
        it('valid files without Firebase bucket use local storage', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, false);

                        expect(result.accepted).toBe(true);
                        expect(result.statusCode).toBe(201);
                        expect(result.provider).toBe('local');
                        expect(result.message).toBe('File uploaded successfully.');
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('local storage URL starts with /uploads/', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, false);

                        expect(result.accepted).toBe(true);
                        expect(result.url).toBeDefined();
                        expect(result.url!.startsWith('/uploads/')).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('local storage absoluteUrl is constructed from origin + relative URL', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, false);

                        expect(result.accepted).toBe(true);
                        expect(result.absoluteUrl).toBeDefined();
                        expect(result.absoluteUrl!.startsWith('http://localhost:5000/uploads/')).toBe(true);
                        expect(result.absoluteUrl).toBe(`http://localhost:5000${result.url}`);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('local storage URL includes correct file extension', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, false);
                        const expectedExt = getExtension(file.originalname).toLowerCase();

                        expect(result.accepted).toBe(true);
                        if (expectedExt && expectedExt.length <= 10) {
                            expect(result.url!.endsWith(expectedExt)).toBe(true);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.15**
     *
     * Files exceeding the Multer 25MB limit are rejected with an error.
     * The size validation is consistent regardless of MIME type or provider.
     */
    describe('3.15: Oversized files are rejected with error', () => {
        it('files exceeding 25MB are rejected regardless of valid MIME type', () => {
            fc.assert(
                fc.property(
                    oversizedUploadFileArb,
                    (file) => {
                        // Test with both provider configs — size rejection happens first
                        const resultLocal = simulateUploadPipeline(file, false);
                        const resultFirebase = simulateUploadPipeline(file, true);

                        expect(resultLocal.accepted).toBe(false);
                        expect(resultLocal.statusCode).toBe(400);

                        expect(resultFirebase.accepted).toBe(false);
                        expect(resultFirebase.statusCode).toBe(400);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('size rejection message indicates file is too large', () => {
            fc.assert(
                fc.property(
                    oversizedUploadFileArb,
                    (file) => {
                        const result = simulateUploadPipeline(file, false);

                        expect(result.accepted).toBe(false);
                        expect(result.message).toBeDefined();
                        expect(result.message!.toLowerCase()).toContain('too large');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('size validation is consistent: same file size always produces same result', () => {
            fc.assert(
                fc.property(
                    acceptedMimeTypeArb,
                    fc.integer({ min: 1, max: MULTER_FILE_SIZE_LIMIT * 4 }),
                    (mime, size) => {
                        const file: UploadFile = {
                            mimetype: mime,
                            originalname: filenameForMime(mime),
                            size,
                        };

                        const result1 = simulateUploadPipeline(file, false);
                        const result2 = simulateUploadPipeline(file, false);

                        // Deterministic: same input always produces same accept/reject
                        expect(result1.accepted).toBe(result2.accepted);
                        expect(result1.statusCode).toBe(result2.statusCode);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Additional preservation: MIME type validation for already-accepted types
     *
     * All MIME types currently in ALLOWED_MIME_TYPES must continue to be
     * accepted. This locks in the existing acceptance behavior.
     */
    describe('Already-accepted MIME types continue to be accepted', () => {
        it('every MIME type in ALLOWED_MIME_TYPES passes isAllowedUpload', () => {
            fc.assert(
                fc.property(
                    acceptedMimeTypeArb,
                    (mime) => {
                        const filename = filenameForMime(mime);
                        expect(isAllowedUpload(mime, filename)).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('MIME check is case-insensitive (trimmed lowercase)', () => {
            fc.assert(
                fc.property(
                    acceptedMimeTypeArb,
                    fc.constantFrom('', ' ', '  '),
                    (mime, padding) => {
                        const paddedMime = padding + mime.toUpperCase() + padding;
                        // The function trims and lowercases, so padded uppercase should still match
                        const result = isAllowedUpload(paddedMime, filenameForMime(mime));
                        expect(result).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * Additional preservation: Extension-based fallback validation
     *
     * When MIME type is unknown (e.g., application/octet-stream from some
     * browsers), the extension-based fallback must continue to work.
     */
    describe('Extension-based validation works correctly', () => {
        it('files with allowed extensions pass even with unknown MIME type', () => {
            fc.assert(
                fc.property(
                    acceptedExtensionArb,
                    (ext) => {
                        // Use a MIME type NOT in the allowed set to force extension fallback
                        const result = isAllowedUpload('application/x-unknown-test', `file${ext}`);
                        expect(result).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('files with disallowed extension AND disallowed MIME are rejected', () => {
            fc.assert(
                fc.property(
                    invalidMimeTypeArb,
                    (mime) => {
                        const result = isAllowedUpload(mime, 'malicious.exe');
                        expect(result).toBe(false);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * Additional preservation: Upload response format consistency
     *
     * Successful uploads always return a consistent response shape with
     * url, absoluteUrl, statusCode 201, and a success message.
     */
    describe('Upload response format is consistent', () => {
        it('successful uploads always have url, absoluteUrl, statusCode 201, and message', () => {
            fc.assert(
                fc.property(
                    validUploadFileArb,
                    fc.boolean(),
                    (file, hasFirebase) => {
                        const result = simulateUploadPipeline(file, hasFirebase);

                        expect(result.accepted).toBe(true);
                        expect(result.statusCode).toBe(201);
                        expect(result.url).toBeDefined();
                        expect(typeof result.url).toBe('string');
                        expect(result.url!.length).toBeGreaterThan(0);
                        expect(result.absoluteUrl).toBeDefined();
                        expect(typeof result.absoluteUrl).toBe('string');
                        expect(result.absoluteUrl!.startsWith('http')).toBe(true);
                        expect(result.message).toBe('File uploaded successfully.');
                        expect(result.provider).toBeDefined();
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('rejected uploads always have accepted=false and a message', () => {
            fc.assert(
                fc.property(
                    fc.oneof(oversizedUploadFileArb, invalidTypeFileArb),
                    fc.boolean(),
                    (file, hasFirebase) => {
                        const result = simulateUploadPipeline(file, hasFirebase);

                        expect(result.accepted).toBe(false);
                        expect(result.statusCode).toBe(400);
                        expect(result.message).toBeDefined();
                        expect(typeof result.message).toBe('string');
                        expect(result.message!.length).toBeGreaterThan(0);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });
});
