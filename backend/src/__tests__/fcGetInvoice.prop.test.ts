import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';

/**
 * Property 2: Invoice detail endpoint returns correct document for valid IDs
 *
 * Validates: Requirements 3.1
 *
 * For any valid invoice document stored in the database, calling
 * GET /fc/invoices/:id with that document's ID SHALL return a response
 * with ok: true and a data object whose _id and invoiceNo match the
 * stored document.
 *
 * Feature: finance-detail-view, Property 2: Invoice detail endpoint returns correct document for valid IDs
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../models/FinanceInvoice', () => {
    const findById = vi.fn();
    return { default: { findById } };
});

import FinanceInvoice from '../models/FinanceInvoice';
import { fcGetInvoice } from '../controllers/financeCenterController';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const hexCharArb = fc.constantFrom(...'0123456789abcdef'.split(''));
const objectIdArb = fc.array(hexCharArb, { minLength: 24, maxLength: 24 }).map((chars) => chars.join(''));

const digitCharArb = fc.constantFrom(...'0123456789'.split(''));
const invoiceNoArb = fc
    .array(digitCharArb, { minLength: 4, maxLength: 8 })
    .map((digits) => `INV-${digits.join('')}`);

const purposeArb = fc.constantFrom('subscription', 'exam', 'service', 'custom');
const statusArb = fc.constantFrom('unpaid', 'partial', 'paid', 'cancelled', 'overdue');

const invoiceDocArb = fc.record({
    _id: objectIdArb,
    invoiceNo: invoiceNoArb,
    purpose: purposeArb,
    amountBDT: fc.integer({ min: 1, max: 1_000_000 }),
    paidAmountBDT: fc.integer({ min: 0, max: 1_000_000 }),
    status: statusArb,
    issuedAtUTC: fc.constant(new Date().toISOString()),
    notes: fc.string({ maxLength: 200 }),
    isDeleted: fc.boolean(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockReq(id: string): AuthRequest {
    return {
        params: { id },
        query: {},
        body: {},
        user: { _id: 'admin123', role: 'superadmin' },
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

function setupFindByIdMock(returnDoc: unknown) {
    const chain = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(returnDoc),
    };
    (FinanceInvoice.findById as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: finance-detail-view, Property 2: Invoice detail endpoint returns correct document for valid IDs', () => {
    it('returns ok: true with matching _id and invoiceNo for any valid invoice', async () => {
        await fc.assert(
            fc.asyncProperty(invoiceDocArb, async (invoiceDoc) => {
                vi.clearAllMocks();
                setupFindByIdMock(invoiceDoc);

                const req = createMockReq(invoiceDoc._id);
                const res = createMockRes();

                await fcGetInvoice(req, res as unknown as Response);

                expect(res._status).toBe(200);
                expect(res._json).toEqual({ ok: true, data: invoiceDoc });
                const data = (res._json as any).data;
                expect(data._id).toBe(invoiceDoc._id);
                expect(data.invoiceNo).toBe(invoiceDoc.invoiceNo);
            }),
            { numRuns: 20 },
        );
    });
});

// ─── Property 3 ──────────────────────────────────────────────────────────────

/**
 * Property 3: Invoice detail endpoint rejects invalid ObjectId strings
 *
 * Validates: Requirements 3.4
 *
 * For any string that is not a valid 24-character hex MongoDB ObjectId,
 * calling GET /fc/invoices/:id with that string SHALL return HTTP 400
 * with an error message.
 *
 * Feature: finance-detail-view, Property 3: Invoice detail endpoint rejects invalid ObjectId strings
 */

/**
 * Generates strings that are NOT valid MongoDB ObjectIds.
 *
 * mongoose.Types.ObjectId.isValid() accepts:
 *   - 24-character hex strings
 *   - 12-character strings (treated as 12-byte buffer)
 *   - ObjectId instances
 *
 * We generate strings that fail these checks by:
 *   1. Wrong-length strings (not 12 and not 24)
 *   2. 24-char strings containing non-hex characters
 *   3. Empty / whitespace-only strings
 */
const nonHexChar = fc.constantFrom(
    ...'ghijklmnopqrstuvwxyzGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()-_=+[]{}|;:,.<>?/~`'.split(''),
);

const invalidObjectIdArb = fc.oneof(
    // Empty string
    fc.constant(''),
    // Whitespace-only
    fc.integer({ min: 1, max: 10 }).map((n) => ' '.repeat(n)),
    // Wrong length: too short (1-11 chars, excluding exactly 12)
    fc.string({ minLength: 1, maxLength: 11 }).filter((s) => s.trim().length > 0 && s.trim().length !== 12),
    // Wrong length: between 13 and 23 chars
    fc.string({ minLength: 13, maxLength: 23 }).filter((s) => s.trim().length !== 12 && s.trim().length !== 24),
    // Wrong length: longer than 24 chars
    fc.string({ minLength: 25, maxLength: 50 }).filter((s) => s.trim().length !== 12 && s.trim().length !== 24),
    // Exactly 24 chars but with at least one non-hex character
    fc
        .tuple(
            fc.integer({ min: 0, max: 23 }),
            nonHexChar,
            fc.array(hexCharArb, { minLength: 23, maxLength: 23 }),
        )
        .map(([pos, badChar, hexChars]) => {
            const arr = [...hexChars];
            arr.splice(pos, 0, badChar);
            return arr.slice(0, 24).join('');
        }),
);

describe('Feature: finance-detail-view, Property 3: Invoice detail endpoint rejects invalid ObjectId strings', () => {
    it('returns HTTP 400 with error message for any invalid ObjectId string', async () => {
        await fc.assert(
            fc.asyncProperty(invalidObjectIdArb, async (invalidId) => {
                vi.clearAllMocks();

                const req = createMockReq(invalidId);
                const res = createMockRes();

                await fcGetInvoice(req, res as unknown as Response);

                expect(res._status).toBe(400);
                expect(res._json).toEqual({ message: 'Invalid ID' });

                // Verify findById was never called with an invalid ID
                expect(FinanceInvoice.findById).not.toHaveBeenCalled();
            }),
            { numRuns: 20 },
        );
    });
});
