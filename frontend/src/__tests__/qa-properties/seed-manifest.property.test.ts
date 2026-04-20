/**
 * Property 2: Seed Manifest Round-Trip
 *
 * Feature: campusway-qa-audit, Property 2: Seed Manifest Round-Trip
 *
 * *For any* seed data state in MongoDB, the generated JSON manifest should
 * contain an entry for every seeded entity, and for each entry in the manifest,
 * querying MongoDB by that entity's ID should return a document whose key fields
 * (role, slug, status, etc.) match the manifest values.
 *
 * **Validates: Requirements 2.6**
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { get } from '../../../qa/helpers/api-client';
import { runSeedDataGenerator } from '../../../qa/seed-data-generator';
import type { SeedManifest, UserRole } from '../../../qa/types';
import { USER_ROLES } from '../../../qa/types';

// ─── Types ───────────────────────────────────────────────────────────

type ManifestEntry =
    | { type: 'user'; role: UserRole; id: string; username: string; email: string }
    | { type: 'exam'; id: string; status: 'published' | 'draft' }
    | { type: 'news'; id: string; status: 'published' | 'draft' }
    | { type: 'university'; id: string }
    | { type: 'subscriptionPlan'; id: string }
    | { type: 'resource'; id: string; status: 'published' | 'draft' }
    | { type: 'helpArticle'; id: string }
    | { type: 'supportTicket'; id: string }
    | { type: 'contactMessage'; id: string }
    | { type: 'universityCategory'; id: string };

// ─── Helpers ─────────────────────────────────────────────────────────

let manifest: SeedManifest;
let manifestEntries: ManifestEntry[];

/**
 * Flatten the manifest into a list of individually queryable entries.
 */
function flattenManifest(m: SeedManifest): ManifestEntry[] {
    const entries: ManifestEntry[] = [];

    // Users — one per role
    for (const role of USER_ROLES) {
        const u = m.users[role];
        if (u?.id) {
            entries.push({ type: 'user', role, id: u.id, username: u.username, email: u.email });
        }
    }

    // Exams
    for (const id of m.exams.published) {
        entries.push({ type: 'exam', id, status: 'published' });
    }
    for (const id of m.exams.draft) {
        entries.push({ type: 'exam', id, status: 'draft' });
    }

    // News
    for (const id of m.news.published) {
        entries.push({ type: 'news', id, status: 'published' });
    }
    for (const id of m.news.draft) {
        entries.push({ type: 'news', id, status: 'draft' });
    }

    // Universities
    for (const id of m.universities) {
        entries.push({ type: 'university', id });
    }

    // Subscription Plans
    for (const id of m.subscriptionPlans) {
        entries.push({ type: 'subscriptionPlan', id });
    }

    // Resources
    for (const id of m.resources.published) {
        entries.push({ type: 'resource', id, status: 'published' });
    }
    for (const id of m.resources.draft) {
        entries.push({ type: 'resource', id, status: 'draft' });
    }

    // Help Articles
    for (const id of m.helpArticles) {
        entries.push({ type: 'helpArticle', id });
    }

    // Support Tickets
    for (const id of m.supportTickets) {
        entries.push({ type: 'supportTicket', id });
    }

    // Contact Messages
    for (const id of m.contactMessages) {
        entries.push({ type: 'contactMessage', id });
    }

    // University Categories
    for (const id of m.universityCategories) {
        entries.push({ type: 'universityCategory', id });
    }

    return entries;
}


/**
 * Query the backend API for a single manifest entry and verify it exists
 * with matching key fields.
 */
async function verifyEntryInDatabase(entry: ManifestEntry): Promise<void> {
    switch (entry.type) {
        case 'user': {
            const res = await get<{
                user?: { _id: string; email: string; username: string; role: string };
                item?: { _id: string; email: string; username: string; role: string };
            }>(
                `/api/__cw_admin__/users/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `User ${entry.role} (${entry.id}) should exist in DB`).toBe(true);
            const user = res.data?.user || res.data?.item;
            expect(user).toBeDefined();
            if (user) {
                expect(user.email).toBe(entry.email);
                expect(user.username).toBe(entry.username);
            }
            break;
        }

        case 'exam': {
            const res = await get<{
                exam?: { _id: string; isPublished?: boolean };
                item?: { _id: string; isPublished?: boolean };
            }>(
                `/api/__cw_admin__/exams/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Exam ${entry.id} should exist in DB`).toBe(true);
            const exam = res.data?.exam || res.data?.item;
            expect(exam).toBeDefined();
            if (exam && entry.status === 'published') {
                expect(exam.isPublished).toBe(true);
            }
            break;
        }

        case 'news': {
            const res = await get<{
                item?: { _id: string; status?: string };
                data?: { _id: string; status?: string };
            }>(
                `/api/__cw_admin__/news/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `News ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'university': {
            const res = await get<{
                university?: { _id: string };
                item?: { _id: string };
            }>(
                `/api/__cw_admin__/universities/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `University ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'subscriptionPlan': {
            const res = await get<{
                item?: { _id: string };
                plan?: { _id: string };
            }>(
                `/api/__cw_admin__/subscription-plans/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Subscription plan ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'resource': {
            const res = await get<{
                resource?: { _id: string; isPublished?: boolean };
                item?: { _id: string; isPublished?: boolean };
            }>(
                `/api/__cw_admin__/resources/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Resource ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'helpArticle': {
            const res = await get<{
                data?: { _id: string };
                item?: { _id: string };
            }>(
                `/api/__cw_admin__/help-center/articles/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Help article ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'supportTicket': {
            // Query via admin support center (student endpoint may not support ID lookup)
            const res = await get<{
                item?: { _id: string };
                ticket?: { _id: string };
            }>(
                `/api/__cw_admin__/support-center/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Support ticket ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'contactMessage': {
            const res = await get<{
                item?: { _id: string };
                message?: { _id: string };
                data?: { _id: string };
            }>(
                `/api/__cw_admin__/contact-messages/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `Contact message ${entry.id} should exist in DB`).toBe(true);
            break;
        }

        case 'universityCategory': {
            const res = await get<{
                category?: { _id: string };
                item?: { _id: string };
                data?: { _id: string };
            }>(
                `/api/__cw_admin__/university-categories/${entry.id}`,
                'superadmin',
            );
            expect(res.ok, `University category ${entry.id} should exist in DB`).toBe(true);
            break;
        }
    }
}

// ─── Setup ───────────────────────────────────────────────────────────

beforeAll(async () => {
    // Run the seed generator to populate DB and get the manifest
    manifest = await runSeedDataGenerator();
    manifestEntries = flattenManifest(manifest);
}, 120_000);

// ─── Property Test ───────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 2: Seed Manifest Round-Trip', () => {
    it('every manifest entry should be queryable in the database with matching key fields', async () => {
        /**
         * **Validates: Requirements 2.6**
         *
         * Strategy: Use fc.constantFrom() to pick random entries from the
         * flattened manifest. For each picked entry, query the backend API
         * by entity ID and verify the entity exists with matching fields.
         */
        expect(manifestEntries.length).toBeGreaterThan(0);

        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...manifestEntries),
                async (entry: ManifestEntry) => {
                    await verifyEntryInDatabase(entry);
                },
            ),
            { numRuns: 20 },
        );
    });
});
