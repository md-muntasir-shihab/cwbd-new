import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
    settingsRbac,
    detectModifiedSections,
    containsSensitiveChanges,
    detectPrivilegeEscalation,
    SETTINGS_PERMISSION_MATRIX,
} from '../middlewares/settingsRbac';
import type { UserRole } from '../models/User';

/**
 * Unit tests for Settings RBAC middleware
 * Validates: Requirements 12.1, 12.2, 12.3, 12.5
 */

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockReq(overrides: Partial<Request> = {}): Request {
    return {
        body: {},
        headers: {},
        user: undefined,
        ...overrides,
    } as unknown as Request;
}

function mockRes(): Response {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
}

function mockNext(): NextFunction {
    return vi.fn();
}

// ─── Pure helper tests ───────────────────────────────────────────────────────

describe('detectModifiedSections', () => {
    it('maps body keys to the correct settings sections', () => {
        const sections = detectModifiedSections({
            dailySmsLimit: 100,
            frequencyCap: { dailyCap: 5 },
            budgetGuardrails: { softLimitPercent: 80 },
            providerRouting: {},
            approvalPolicy: {},
            experiment: {},
            contentLint: {},
            observability: {},
            dataGovernance: {},
        });

        expect(sections.has('General')).toBe(true);
        expect(sections.has('Caps')).toBe(true);
        expect(sections.has('Budget')).toBe(true);
        expect(sections.has('Routing')).toBe(true);
        expect(sections.has('Approval')).toBe(true);
        expect(sections.has('Experiment')).toBe(true);
        expect(sections.has('Compliance')).toBe(true);
        expect(sections.has('Observability')).toBe(true);
    });

    it('returns empty set for unknown keys', () => {
        const sections = detectModifiedSections({ unknownField: 'value' });
        expect(sections.size).toBe(0);
    });

    it('returns empty set for empty body', () => {
        const sections = detectModifiedSections({});
        expect(sections.size).toBe(0);
    });
});


describe('SETTINGS_PERMISSION_MATRIX', () => {
    it('allows superadmin access to every section', () => {
        for (const [section, roles] of Object.entries(SETTINGS_PERMISSION_MATRIX)) {
            expect(roles).toContain('superadmin');
        }
    });

    it('allows admin access to every section', () => {
        for (const [section, roles] of Object.entries(SETTINGS_PERMISSION_MATRIX)) {
            expect(roles).toContain('admin');
        }
    });

    it('allows moderator access to General, Caps, Experiment, Observability only', () => {
        const moderatorSections = Object.entries(SETTINGS_PERMISSION_MATRIX)
            .filter(([, roles]) => roles.includes('moderator'))
            .map(([section]) => section)
            .sort();

        expect(moderatorSections).toEqual(['Caps', 'Experiment', 'General', 'Observability']);
    });

    it('does not allow viewer or student roles to any section', () => {
        for (const [, roles] of Object.entries(SETTINGS_PERMISSION_MATRIX)) {
            expect(roles).not.toContain('viewer');
            expect(roles).not.toContain('student');
        }
    });
});

describe('containsSensitiveChanges', () => {
    it('returns true when budgetGuardrails key is present', () => {
        expect(containsSensitiveChanges({ budgetGuardrails: { softLimitPercent: 90 } })).toBe(true);
    });

    it('returns true when approvalPolicy key is present', () => {
        expect(containsSensitiveChanges({ approvalPolicy: { audienceSizeThreshold: 1000 } })).toBe(true);
    });

    it('returns false for non-sensitive changes', () => {
        expect(containsSensitiveChanges({ dailySmsLimit: 500 })).toBe(false);
        expect(containsSensitiveChanges({ frequencyCap: { dailyCap: 10 } })).toBe(false);
        expect(containsSensitiveChanges({ observability: {} })).toBe(false);
    });

    it('returns false for empty body', () => {
        expect(containsSensitiveChanges({})).toBe(false);
    });
});

describe('detectPrivilegeEscalation', () => {
    it('catches role escalation in dataGovernance.exportPermissionRoles', () => {
        const body = {
            dataGovernance: {
                exportPermissionRoles: ['superadmin'],
            },
        };
        const result = detectPrivilegeEscalation(body, 'admin');
        expect(result).not.toBeNull();
        expect(result).toContain('superadmin');
        expect(result).toContain('higher privilege');
    });

    it('returns null when exportPermissionRoles contains same or lower privilege roles', () => {
        const body = {
            dataGovernance: {
                exportPermissionRoles: ['moderator', 'editor'],
            },
        };
        const result = detectPrivilegeEscalation(body, 'admin');
        expect(result).toBeNull();
    });

    it('returns null for changes with no escalation', () => {
        const body = { dailySmsLimit: 100 };
        const result = detectPrivilegeEscalation(body, 'superadmin');
        expect(result).toBeNull();
    });

    it('returns error when user role lacks section permission', () => {
        // moderator cannot modify Budget section
        const body = { budgetGuardrails: { softLimitPercent: 80 } };
        const result = detectPrivilegeEscalation(body, 'moderator');
        expect(result).not.toBeNull();
        expect(result).toContain('Budget');
    });
});


// ─── Middleware integration tests (mock req/res/next) ────────────────────────

describe('settingsRbac middleware', () => {
    let res: Response;
    let next: NextFunction;

    beforeEach(() => {
        res = mockRes();
        next = mockNext();
    });

    it('returns 401 when no user on request', () => {
        const req = mockReq({ user: undefined, body: { dailySmsLimit: 100 } });
        settingsRbac(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Authentication required' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when user role lacks permission for a section', () => {
        const req = mockReq({
            user: { role: 'moderator' } as any,
            body: { budgetGuardrails: { softLimitPercent: 80 } },
            headers: {},
        });
        settingsRbac(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ errorCode: 'FORBIDDEN' }),
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 with ELEVATED_CONFIRMATION_REQUIRED when sensitive fields modified without header', () => {
        const req = mockReq({
            user: { role: 'admin' } as any,
            body: { budgetGuardrails: { softLimitPercent: 90 } },
            headers: {},
        });
        settingsRbac(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ errorCode: 'ELEVATED_CONFIRMATION_REQUIRED' }),
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when all checks pass (non-sensitive change, authorized role)', () => {
        const req = mockReq({
            user: { role: 'admin' } as any,
            body: { dailySmsLimit: 200 },
            headers: {},
        });
        settingsRbac(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when sensitive fields modified WITH x-elevated-confirmation header', () => {
        const req = mockReq({
            user: { role: 'admin' } as any,
            body: { budgetGuardrails: { softLimitPercent: 90 } },
            headers: { 'x-elevated-confirmation': 'confirmed' },
        });
        settingsRbac(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});
