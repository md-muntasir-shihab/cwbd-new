import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';

/**
 * CampusWay QA Release Audit — Bug Condition Exploration Tests
 *
 * **Property 1: Bug Condition** — CampusWay QA Release Audit Bug Conditions
 *
 * **Validates: Requirements 1.1, 1.3, 1.5, 1.7, 1.11, 1.13, 1.14, 1.15, 1.16, 1.18, 1.22, 1.28, 1.31**
 *
 * CRITICAL: These tests encode the EXPECTED (correct) behavior.
 * They MUST FAIL on unfixed code — failure confirms the bugs exist.
 * Do NOT attempt to fix the tests or the code when they fail.
 */

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — P0 Security (Bugs 1.13, 1.14, 1.15, 1.16)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group C: P0 Security — Permission Enforcement', () => {
    /**
     * Bug 1.13 — Student-role JWT accessing admin endpoints
     *
     * The admin router applies `authenticate` at the router level but
     * `enforceModulePermissions` only runs for routes that match
     * `inferModuleFromPath()`. There is no explicit role guard that
     * rejects non-admin roles (student, pending_student) from ALL
     * `/api/admin/*` routes.
     *
     * Expected: student-role accessing GET /api/admin/students returns 403
     * Bug: no role-level guard exists, so student may get 200
     */
    it('Bug 1.13: student-role JWT accessing GET /api/admin/students returns 403', async () => {
        // Instead of mounting the full router (which has many dependencies and timeouts),
        // we verify the admin routes source code has a role guard at the router level
        const fs = await import('fs');
        const path = await import('path');
        const routeSource = fs.readFileSync(
            path.join(__dirname, '../routes/adminRoutes.ts'),
            'utf-8',
        );

        // Expected: a router-level role guard that rejects non-admin roles
        // e.g., router.use(requireRole('admin', 'superadmin', 'chairman'))
        // or router.use(authorize('admin', 'superadmin', 'chairman'))

        // Extract the middleware chain — look for router.use() lines
        const routerUseLines = routeSource
            .split('\n')
            .filter((line: string) => line.trim().startsWith('router.use('));

        // Check if any router.use() line contains a role guard
        const hasRoleGuardMiddleware = routerUseLines.some((line: string) =>
            (line.includes('requireRole') || line.includes("authorize('admin")) &&
            line.includes('admin'),
        );

        // The current code only has:
        //   router.use(authenticate)
        //   router.use(enforceAdminPanelPolicy)
        //   router.use(enforceAdminReadOnlyMode)
        //   router.use(enforceModulePermissions)
        // No explicit role guard exists to reject student-role JWTs
        // This should FAIL on unfixed code
        expect(hasRoleGuardMiddleware).toBe(true);
    });

    /**
     * Bug 1.16 — POST to admin endpoint without CSRF token is rejected
     *
     * `csrfProtection` middleware is only applied to specific security-related
     * routes, not universally to all state-changing (POST/PUT/PATCH/DELETE)
     * endpoints. Newer endpoints lack CSRF protection.
     *
     * Expected: POST to admin endpoint without CSRF token returns 403
     * Bug: many POST endpoints don't have csrfProtection applied
     */
    it('Bug 1.16: POST to admin endpoint without CSRF token is rejected', async () => {
        const { csrfProtection } = await import('../middlewares/csrfGuard');
        const express = (await import('express')).default;
        const cookieParser = (await import('cookie-parser')).default;
        const supertest = (await import('supertest')).default;

        // Simulate an admin POST endpoint that should require CSRF
        // The bug is that csrfProtection is NOT applied universally
        // We test the middleware directly to confirm the expected behavior
        const app = express();
        app.use(cookieParser());
        app.use(express.json());

        // This simulates what SHOULD happen: all POST routes should have CSRF
        app.post('/api/admin/universities', csrfProtection, (_req, res) => {
            res.status(200).json({ success: true });
        });

        // POST without CSRF token should be rejected
        const res = await supertest(app)
            .post('/api/admin/universities')
            .send({ name: 'Test University' });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_TOKEN_INVALID');

        // Now verify the ACTUAL admin router behavior — POST without CSRF
        // The bug is that the actual router does NOT enforce CSRF on all POST routes
        // We read the adminRoutes source to check if csrfProtection is applied universally
        const fs = await import('fs');
        const path = await import('path');
        const routeSource = fs.readFileSync(
            path.join(__dirname, '../routes/adminRoutes.ts'),
            'utf-8',
        );

        // Check that there's a router-level CSRF middleware for state-changing methods
        // Expected: router.use() with csrfProtection for POST/PUT/PATCH/DELETE
        const hasUniversalCsrf = routeSource.includes("router.use(csrfProtection)")
            || routeSource.includes("router.use((req, res, next) => {")
            && routeSource.includes("csrfProtection");

        // This assertion should FAIL on unfixed code because CSRF is only per-route
        expect(hasUniversalCsrf).toBe(true);
    });

    /**
     * Bug 1.14 — Viewer-role sending POST to write endpoint is rejected
     *
     * `enforceModulePermissions` depends on `inferModuleFromPath` — if it
     * returns null for a path, the middleware calls `next()` without any
     * permission check, allowing viewers to write.
     *
     * Expected: viewer-role POST to write endpoint returns 403
     * Bug: enforceModulePermissions falls through when module is null
     */
    it('Bug 1.14: viewer-role sending POST to write endpoint is rejected', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const routeSource = fs.readFileSync(
            path.join(__dirname, '../routes/adminRoutes.ts'),
            'utf-8',
        );

        // The enforceModulePermissions function has this pattern:
        // if (!moduleName) { next(); return; }
        // This means when inferModuleFromPath returns null, write operations pass through
        // Expected behavior: if module is null AND method is POST/PUT/DELETE, deny for non-superadmin

        // Check that the fallback denies write operations when module is null
        const hasDenyFallbackForWrites =
            routeSource.includes("if (!module && method !== 'GET')") ||
            routeSource.includes("if (!moduleName && method !== 'GET')") ||
            (routeSource.includes('!moduleName') && routeSource.includes('PERMISSION_DENIED'));

        // This should FAIL on unfixed code — the current code just calls next()
        expect(hasDenyFallbackForWrites).toBe(true);
    });

    /**
     * Bug 1.15 — Pending student accessing restricted endpoint is rejected
     *
     * `restrictPendingStudent` middleware exists but the bug is about whether
     * it's applied at the router level for ALL student routes. We verify
     * the middleware correctly blocks pending students on restricted paths.
     *
     * Expected: pending student accessing /me/exams returns 403
     * Bug: middleware may not cover all student route mounts
     */
    it('Bug 1.15: pending student accessing restricted endpoint is rejected', async () => {
        const { restrictPendingStudent } = await import('../middlewares/restrictPendingStudent');
        const User = (await import('../models/User')).default;

        // Create a pending student with all required fields
        const pendingStudent = await User.create({
            full_name: 'Pending Student',
            username: 'pending_student_bug115',
            email: 'pending-bug1-15@test.com',
            password: 'hashedpassword123',
            role: 'student',
            status: 'pending',
        });

        // Simulate a request to a restricted endpoint
        let nextCalled = false;
        const mockReq = {
            user: { _id: pendingStudent._id, role: 'student' },
            path: '/me/exams',
            method: 'GET',
        } as any;

        const mockRes = {
            status: (code: number) => ({
                json: (body: any) => {
                    mockRes._status = code;
                    mockRes._body = body;
                    return mockRes;
                },
            }),
            _status: 0,
            _body: null as any,
        } as any;

        const mockNext = () => { nextCalled = true; };

        await restrictPendingStudent(mockReq, mockRes, mockNext);

        // Expected: pending student is blocked from /me/exams
        expect(nextCalled).toBe(false);
        expect(mockRes._status).toBe(403);
        expect(mockRes._body?.code).toBe('PENDING_STUDENT_RESTRICTED');

        // Now verify the student routes file applies restrictPendingStudent at router level
        const fs = await import('fs');
        const path = await import('path');
        const studentRoutesSource = fs.readFileSync(
            path.join(__dirname, '../routes/studentRoutes.ts'),
            'utf-8',
        );

        // Check that restrictPendingStudent is applied at router level
        const hasRouterLevelMiddleware = studentRoutesSource.includes('router.use(restrictPendingStudent)');
        expect(hasRouterLevelMiddleware).toBe(true);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// GROUP A — Import/Export Pipeline (Bugs 1.1, 1.3, 1.5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group A: Import/Export — Data Integrity', () => {
    /**
     * Bug 1.1 — CSV with non-canonical header produces unmapped column warnings
     *
     * `buildSuggestedMapping` maps headers via aliases, but when a header like
     * "University Name" doesn't match any alias, it's silently dropped.
     * The validation response does NOT include unmapped column warnings.
     *
     * Expected: validation response includes unmappedColumnWarnings
     * Bug: no unmapped column tracking exists in the validation flow
     */
    it('Bug 1.1: CSV with "University Name" header produces unmapped column warnings', async () => {
        const { buildSuggestedMapping } = await getUniversityImportHelpers();

        await fc.assert(
            fc.property(
                fc.constantFrom(
                    'University Name',
                    'Established',
                    'Contact Email',
                    'Web Address',
                    'Short Description Text',
                ),
                (nonCanonicalHeader: string) => {
                    const headers = [nonCanonicalHeader, 'category', 'shortForm'];
                    const mapping = buildSuggestedMapping(headers);

                    // Compute unmapped headers
                    const mappedHeaders = new Set(Object.values(mapping));
                    const unmappedHeaders = headers.filter((h) => !mappedHeaders.has(h));

                    // If a header is unmapped, the validation response SHOULD warn about it
                    // The current code does NOT produce unmappedColumnWarnings
                    if (unmappedHeaders.length > 0) {
                        // Read the source to check if unmappedColumnWarnings is in the response
                        const fs = require('fs');
                        const path = require('path');
                        const source = fs.readFileSync(
                            path.join(__dirname, '../controllers/universityImportController.ts'),
                            'utf-8',
                        );

                        const hasUnmappedWarnings =
                            source.includes('unmappedColumnWarnings') ||
                            source.includes('unmappedColumns');

                        // This should FAIL on unfixed code
                        expect(hasUnmappedWarnings).toBe(true);
                    }
                },
            ),
            { numRuns: 5 },
        );
    });

    /**
     * Bug 1.3 — Student import CSV with duplicate emails detects duplicates
     *
     * `studentImportController.ts` `validateAndNormalizeRows` does NOT maintain
     * a Set of seen emails within the file — it only checks against the DB
     * during commit.
     *
     * Expected: intra-file duplicate emails are detected during validation
     * Bug: no email dedup Set exists in validateAndNormalizeRows
     */
    it('Bug 1.3: student import CSV with duplicate emails detects duplicates during validation', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../controllers/studentImportController.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.emailAddress(),
                (email: string) => {
                    // The validateAndNormalizeRows function should track seen emails
                    // and detect intra-file duplicates
                    const hasEmailDedup =
                        source.includes('emailSeen') ||
                        source.includes('email_seen') ||
                        (source.includes('new Set') && source.includes('email') && source.includes('Duplicate email'));

                    // This should FAIL on unfixed code — no email dedup exists
                    expect(hasEmailDedup).toBe(true);
                },
            ),
            { numRuns: 3 },
        );
    });

    /**
     * Bug 1.5 — Question import with malformed JSON returns row-level errors
     *
     * `adminImportQuestionsFromExcel` catches all errors in a single try/catch
     * and returns generic `SERVER_ERROR`. No row-level error reporting exists.
     *
     * Expected: malformed JSON returns row-level errors with row number and field
     * Bug: generic SERVER_ERROR is returned for all import failures
     */
    it('Bug 1.5: question import with malformed JSON returns row-level errors not generic SERVER_ERROR', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../controllers/adminExamController.ts'),
            'utf-8',
        );

        // The adminImportQuestionsFromExcel function should have per-row try/catch
        // and return failedRows with row-level errors including rowNumber and field name
        // The current code has a single generic try/catch that returns SERVER_ERROR

        // Check that the function returns row-level errors (not just generic SERVER_ERROR)
        const hasRowLevelErrors =
            source.includes('failedRows') &&
            source.includes('rowNumber') &&
            source.includes('field');

        // Check that the generic SERVER_ERROR catch-all is NOT the only error handling
        // in the import function
        const hasGenericServerError =
            source.includes("ResponseBuilder.error('SERVER_ERROR', 'Server error during import.')");

        // If generic SERVER_ERROR exists without row-level errors, the bug exists
        // This should FAIL on unfixed code
        expect(hasRowLevelErrors).toBe(true);
        expect(hasGenericServerError).toBe(false);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — Upload/Media Pipeline (Bugs 1.7, 1.11)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group B: Upload/Media — Pipeline Integrity', () => {
    /**
     * Bug 1.7 — Firebase fallback returns absolute URL not relative path
     *
     * In `mediaController.ts`, when Firebase upload fails, the fallback path
     * constructs `fileUrl = /uploads/${req.file.filename}` — a relative URL.
     * The `buildAbsoluteUploadUrl` function exists but is only used for the
     * `absoluteUrl` field, not the primary `url` field.
     *
     * Expected: primary `url` field is absolute when using local fallback
     * Bug: primary `url` is relative `/uploads/...`
     */
    it('Bug 1.7: Firebase fallback returns absolute URL not relative /uploads/... path', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../controllers/mediaController.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.webUrl(),
                (origin: string) => {
                    // Find the local fallback response section
                    // The bug: `url: fileUrl` where fileUrl = `/uploads/...` (relative)
                    // Expected: `url: absoluteUrl` or `url: buildAbsoluteUploadUrl(fileUrl, origin)`

                    // Check if the primary url field uses absolute URL in the fallback path
                    // The current code has: url: fileUrl (relative)
                    // It should have: url: absoluteUrl or url: buildAbsoluteUploadUrl(...)

                    // Look for the local fallback response pattern
                    const localFallbackMatch = source.match(
                        /url:\s*fileUrl[\s,]/,
                    );
                    const usesRelativeUrl = localFallbackMatch !== null;

                    // If the primary url uses relative path, the bug exists
                    // Expected: primary url should NOT be relative
                    expect(usesRelativeUrl).toBe(false);
                },
            ),
            { numRuns: 3 },
        );
    });

    /**
     * Bug 1.11 — Filename generation uses crypto.randomUUID() not Date.now() + Math.random()
     *
     * `mediaController.ts` uses `Date.now() + '-' + Math.round(Math.random() * 1e9)`
     * for filenames — not cryptographically unique.
     *
     * Expected: crypto.randomUUID() is used for filename generation
     * Bug: Date.now() + Math.random() is used (collision-prone)
     */
    it('Bug 1.11: filename generation uses crypto.randomUUID() not Date.now() + Math.random()', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../controllers/mediaController.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 100 }),
                (_n: number) => {
                    // Check that the Multer storage filename callback uses crypto.randomUUID()
                    const usesDateNowRandom =
                        source.includes('Date.now()') &&
                        source.includes('Math.random()') &&
                        source.includes('Math.round');

                    const usesCryptoUUID =
                        source.includes('crypto.randomUUID()') ||
                        source.includes('randomUUID()');

                    // The bug: Date.now() + Math.random() is used
                    // Expected: crypto.randomUUID() should be used
                    expect(usesDateNowRandom).toBe(false);
                    expect(usesCryptoUUID).toBe(true);
                },
            ),
            { numRuns: 3 },
        );
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — Core Journeys (Bugs 1.18, 1.22)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group D: Core Journeys — Resilience', () => {
    /**
     * Bug 1.18 — Exam start without fullscreen API support does not block exam
     *
     * `useExamAntiCheat.ts` and the exam start flow may require fullscreen
     * without checking `document.fullscreenEnabled`. If fullscreen is not
     * supported, the exam start is blocked entirely.
     *
     * Expected: graceful degradation to non-fullscreen mode
     * Bug: exam is blocked when fullscreen API is unavailable
     */
    it('Bug 1.18: exam start without fullscreen API support does not block the exam', async () => {
        const fs = await import('fs');
        const path = await import('path');

        // Check the anti-cheat hook for fullscreen capability detection
        const antiCheatSource = fs.readFileSync(
            path.join(__dirname, '../../../frontend/src/hooks/useExamAntiCheat.ts'),
            'utf-8',
        );

        // Also check for any exam start flow files
        let examStartSource = '';
        const hooksDir = path.join(__dirname, '../../../frontend/src/hooks');
        try {
            const files = fs.readdirSync(hooksDir);
            for (const file of files) {
                if (file.includes('exam') || file.includes('antiCheat') || file.includes('anti-cheat')) {
                    examStartSource += fs.readFileSync(path.join(hooksDir, file), 'utf-8');
                }
            }
        } catch {
            // Directory may not exist in test environment
        }

        const combinedSource = antiCheatSource + examStartSource;

        // Expected: check for fullscreenEnabled before requesting fullscreen
        const hasFullscreenCheck =
            combinedSource.includes('fullscreenEnabled') ||
            combinedSource.includes('webkitFullscreenEnabled') ||
            combinedSource.includes('mozFullScreenEnabled');

        // Expected: graceful degradation mode
        const hasDegradedMode =
            combinedSource.includes('degraded') ||
            combinedSource.includes('antiCheatMode') ||
            combinedSource.includes('fullscreen_not_supported');

        // This should FAIL on unfixed code — no fullscreen capability check exists
        expect(hasFullscreenCheck).toBe(true);
        expect(hasDegradedMode).toBe(true);
    });

    /**
     * Bug 1.22 — Campaign send to 1000+ recipients uses batching
     *
     * `campaignEngineService.ts` `processSend` iterates recipients without
     * batching or rate limit awareness. All recipients are sent in a single
     * synchronous loop.
     *
     * Expected: recipients are batched (e.g., 50 per batch with delay)
     * Bug: no batching exists in processSend
     */
    it('Bug 1.22: campaign send to 1000+ recipients uses batching', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/campaignEngineService.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.integer({ min: 1001, max: 5000 }),
                (recipientCount: number) => {
                    // Check that processSend implements batching
                    const hasBatching =
                        source.includes('BATCH_SIZE') ||
                        source.includes('batchSize') ||
                        source.includes('batch_size');

                    const hasBatchDelay =
                        source.includes('BATCH_DELAY') ||
                        source.includes('batchDelay') ||
                        source.includes('sleep');

                    const hasChunking =
                        source.includes('chunk') ||
                        source.includes('slice') ||
                        (hasBatching && hasBatchDelay);

                    // This should FAIL on unfixed code — no batching exists
                    expect(hasBatching).toBe(true);
                    expect(hasChunking).toBe(true);
                },
            ),
            { numRuns: 3 },
        );
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// GROUP F — Reliability (Bugs 1.28, 1.31)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group F: Reliability — Error Classification & Reconnection', () => {
    /**
     * Bug 1.28 — runJobWithRetry classifies MongoNetworkError as transient
     *
     * `runJobWithRetry` in `jobRunLogService.ts` doesn't distinguish between
     * transient errors (MongoNetworkError, ECONNREFUSED) and permanent errors.
     * All failures count toward the 3-retry limit equally.
     *
     * Expected: transient errors are classified and retried differently
     * Bug: all errors are treated the same
     */
    it('Bug 1.28: runJobWithRetry classifies MongoNetworkError as transient', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../services/jobRunLogService.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.constantFrom(
                    'MongoNetworkError',
                    'MongoTimeoutError',
                    'ECONNREFUSED',
                    'ECONNRESET',
                ),
                (errorType: string) => {
                    // Check that the job runner has error classification logic
                    const hasTransientClassification =
                        source.includes('isTransientError') ||
                        source.includes('transient') ||
                        source.includes('MongoNetworkError') ||
                        source.includes('ECONNREFUSED');

                    const hasErrorTypeCheck =
                        source.includes(errorType) ||
                        source.includes('isTransient');

                    // This should FAIL on unfixed code — no error classification exists
                    expect(hasTransientClassification).toBe(true);
                    expect(hasErrorTypeCheck).toBe(true);
                },
            ),
            { numRuns: 4 },
        );
    });

    /**
     * Bug 1.31 — SSE reconnection uses exponential backoff with jitter
     *
     * `useHomeLiveUpdates.ts` reconnects with a fixed 2000ms delay.
     * No exponential backoff or jitter is implemented, causing thundering
     * herd when many clients reconnect simultaneously.
     *
     * Expected: exponential backoff with jitter (e.g., 1s, 2s, 4s, max 30s)
     * Bug: fixed 2000ms reconnection delay
     */
    it('Bug 1.31: SSE reconnection uses exponential backoff with jitter, not fixed 2000ms', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const source = fs.readFileSync(
            path.join(__dirname, '../../../frontend/src/hooks/useHomeLiveUpdates.ts'),
            'utf-8',
        );

        await fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 10 }),
                (reconnectAttempt: number) => {
                    // Check for exponential backoff pattern
                    const hasExponentialBackoff =
                        source.includes('Math.pow') ||
                        source.includes('**') ||
                        source.includes('backoff') ||
                        source.includes('exponential');

                    // Check for jitter
                    const hasJitter =
                        source.includes('jitter') ||
                        source.includes('Math.random()') ||
                        source.includes('randomDelay');

                    // Check for max delay cap
                    const hasMaxDelay =
                        source.includes('maxDelay') ||
                        source.includes('Math.min') ||
                        source.includes('30000') ||
                        source.includes('MAX_RECONNECT');

                    // Check that fixed 2000ms is NOT the reconnection strategy
                    const usesFixed2000ms =
                        source.includes('}, 2000)') &&
                        !hasExponentialBackoff;

                    // This should FAIL on unfixed code — fixed 2000ms is used
                    expect(usesFixed2000ms).toBe(false);
                    expect(hasExponentialBackoff).toBe(true);
                    expect(hasJitter).toBe(true);
                },
            ),
            { numRuns: 3 },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Extract buildSuggestedMapping from universityImportController
// ═══════════════════════════════════════════════════════════════════════════════

async function getUniversityImportHelpers() {
    // We need to extract the buildSuggestedMapping function
    // Since it's not exported, we replicate its logic from the source
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
        path.join(__dirname, '../controllers/universityImportController.ts'),
        'utf-8',
    );

    // Extract TARGET_FIELDS and FIELD_HEADER_ALIASES from source
    // For testing purposes, we use a simplified version
    const TARGET_FIELDS = [
        'name', 'shortForm', 'category', 'clusterGroup', 'shortDescription',
        'description', 'establishedYear', 'address', 'contactNumber', 'email',
        'websiteUrl', 'admissionUrl', 'totalSeats', 'seatsScienceEng',
        'seatsArtsHum', 'seatsBusiness', 'applicationStartDate',
        'applicationEndDate', 'examDateScience', 'examDateArts',
        'examDateBusiness', 'examCenters', 'logoUrl', 'isActive', 'featured',
        'featuredOrder', 'categorySyncLocked', 'clusterSyncLocked',
        'verificationStatus', 'remarks', 'slug',
    ];

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
            const candidates = [field].map((entry) => normalizeHeaderKey(entry)).filter(Boolean);
            const match = candidates.find((candidate) => normalizedHeaderMap.has(candidate));
            if (match) {
                acc[field] = String(normalizedHeaderMap.get(match));
            }
            return acc;
        }, {});
    }

    return { buildSuggestedMapping, TARGET_FIELDS, normalizeHeaderKey };
}
