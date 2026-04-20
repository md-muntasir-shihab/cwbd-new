import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/auth';
import { ROLE_PERMISSION_MATRIX, hasRolePermission } from '../security/permissionsMatrix';
import type { UserRole } from '../models/User';

/**
 * Property 4: Unauthorized roles are denied access to all detail endpoints
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 *
 * For any finance detail endpoint (GET /fc/transactions/:id,
 * GET /fc/invoices/:id, GET /fc/audit-logs/:id) and for any user role
 * that does not have finance_center.view permission, calling the endpoint
 * SHALL return HTTP 403.
 *
 * Feature: finance-detail-view, Property 4: Unauthorized roles are denied access to all detail endpoints
 */

// ─── Derive unauthorized roles from the permission matrix ────────────────────

const ALL_ROLES = Object.keys(ROLE_PERMISSION_MATRIX) as UserRole[];

const UNAUTHORIZED_ROLES = ALL_ROLES.filter(
    (role) => role !== 'superadmin' && !hasRolePermission(role, 'finance_center', 'view'),
);

// The three finance detail endpoints all use requirePermission('finance_center', 'view')
const DETAIL_ENDPOINTS = [
    'GET /fc/transactions/:id',
    'GET /fc/invoices/:id',
    'GET /fc/audit-logs/:id',
] as const;

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const unauthorizedRoleArb = fc.constantFrom(...UNAUTHORIZED_ROLES);
const endpointArb = fc.constantFrom(...DETAIL_ENDPOINTS);

const hexCharArb = fc.constantFrom(...'0123456789abcdef'.split(''));
const objectIdArb = fc
    .array(hexCharArb, { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockReq(role: UserRole, id: string): AuthRequest {
    return {
        params: { id },
        query: {},
        body: {},
        user: {
            _id: 'user123',
            id: 'user123',
            username: 'testuser',
            email: 'test@example.com',
            role,
            fullName: 'Test User',
            permissions: {},
            permissionsV2: undefined,
        },
    } as unknown as AuthRequest;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
    const res: any = {
        _status: 200,
        _json: null,
        status(code: number) {
            res._status = code;
            return res;
        },
        json(body: unknown) {
            res._json = body;
            return res;
        },
    };
    return res;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: finance-detail-view, Property 4: Unauthorized roles are denied access to all detail endpoints', () => {
    it('returns HTTP 403 for any unauthorized role on any finance detail endpoint', async () => {
        const middleware = requirePermission('finance_center', 'view');

        await fc.assert(
            fc.asyncProperty(
                unauthorizedRoleArb,
                endpointArb,
                objectIdArb,
                async (role, _endpoint, id) => {
                    const req = createMockReq(role, id);
                    const res = createMockRes();
                    let nextCalled = false;
                    const next: NextFunction = () => {
                        nextCalled = true;
                    };

                    // The middleware is synchronous (calls res.status().json() or next())
                    middleware(req, res as unknown as Response, next);

                    // Must NOT call next — request should be blocked
                    expect(nextCalled).toBe(false);

                    // Must return 403
                    expect(res._status).toBe(403);

                    // Response body should contain a forbidden message
                    expect(res._json).toBeDefined();
                    expect(res._json).toHaveProperty('message');
                    expect((res._json as any).message).toContain('finance_center');
                },
            ),
            { numRuns: 20 },
        );
    });

    it('confirms the unauthorized roles list is non-empty and excludes authorized roles', () => {
        // Sanity check: we have unauthorized roles to test
        expect(UNAUTHORIZED_ROLES.length).toBeGreaterThan(0);

        // Verify known unauthorized roles are in the list
        expect(UNAUTHORIZED_ROLES).toContain('student');
        expect(UNAUTHORIZED_ROLES).toContain('editor');

        // Verify known authorized roles are NOT in the list
        expect(UNAUTHORIZED_ROLES).not.toContain('superadmin');
        expect(UNAUTHORIZED_ROLES).not.toContain('admin');
        expect(UNAUTHORIZED_ROLES).not.toContain('finance_agent');
    });
});
