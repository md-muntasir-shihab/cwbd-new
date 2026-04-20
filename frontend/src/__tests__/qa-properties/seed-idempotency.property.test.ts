/**
 * Property 1: Seed Data Idempotency
 *
 * Feature: campusway-qa-audit, Property 1: Seed Data Idempotency
 *
 * *For any* number of consecutive seed generator executions (N ≥ 1),
 * the total document count for each seeded collection (users, exams, news,
 * universities, subscription plans, resources, help articles, support tickets,
 * contact messages, university categories) should remain identical after each run,
 * and no duplicate documents should exist.
 *
 * **Validates: Requirements 2.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { get } from '../../../qa/helpers/api-client';
import {
    seedUsers,
    seedExams,
    seedNews,
    seedUniversities,
    seedSubscriptionPlans,
    seedResources,
    seedHelpArticles,
    seedSupportTickets,
    seedContactMessages,
    seedUniversityCategories,
} from '../../../qa/seed-data-generator';

// ─── Types ───────────────────────────────────────────────────────────

interface CollectionCounts {
    users: number;
    exams: number;
    news: number;
    universities: number;
    subscriptionPlans: number;
    resources: number;
    helpArticles: number;
    supportTickets: number;
    contactMessages: number;
    universityCategories: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Query the backend API to get current document counts for all seeded collections.
 * Uses the admin API endpoints authenticated as superadmin.
 */
async function getCollectionCounts(): Promise<CollectionCounts> {
    const [
        usersRes,
        examsRes,
        newsRes,
        universitiesRes,
        subscriptionPlansRes,
        resourcesRes,
        helpArticlesRes,
        supportTicketsRes,
        contactMessagesRes,
        universityCategoriesRes,
    ] = await Promise.all([
        get<{ total?: number; count?: number; users?: unknown[]; items?: unknown[] }>(
            '/api/__cw_admin__/users',
            'superadmin',
            { params: { search: 'qa-' } },
        ),
        get<{ total?: number; count?: number; exams?: unknown[]; items?: unknown[] }>(
            '/api/__cw_admin__/exams',
            'superadmin',
            { params: { search: 'QA Seed Exam' } },
        ),
        get<{ total?: number; count?: number; items?: unknown[] }>(
            '/api/__cw_admin__/news',
            'superadmin',
            { params: { search: 'QA Seed News' } },
        ),
        get<{ total?: number; count?: number; universities?: unknown[]; items?: unknown[] }>(
            '/api/__cw_admin__/universities',
            'superadmin',
            { params: { search: 'QA Seed University' } },
        ),
        get<{ total?: number; count?: number; items?: unknown[]; plans?: unknown[] }>(
            '/api/__cw_admin__/subscription-plans',
            'superadmin',
        ),
        get<{ total?: number; count?: number; resources?: unknown[]; items?: unknown[] }>(
            '/api/__cw_admin__/resources',
            'superadmin',
            { params: { search: 'QA Seed Resource' } },
        ),
        get<{ total?: number; count?: number; data?: unknown[]; items?: unknown[] }>(
            '/api/__cw_admin__/help-center/articles',
            'superadmin',
        ),
        get<{ total?: number; count?: number; items?: unknown[]; tickets?: unknown[] }>(
            '/api/student/support-tickets',
            'student',
        ),
        get<{ total?: number; count?: number; items?: unknown[]; messages?: unknown[]; data?: unknown[] }>(
            '/api/__cw_admin__/contact-messages',
            'superadmin',
            { params: { search: 'QA Seed Contact' } },
        ),
        get<{ total?: number; count?: number; categories?: unknown[]; items?: unknown[]; data?: unknown[] }>(
            '/api/__cw_admin__/university-categories',
            'superadmin',
        ),
    ]);

    const extractCount = (res: { data: { total?: number; count?: number;[key: string]: unknown } }): number => {
        if (typeof res.data?.total === 'number') return res.data.total;
        if (typeof res.data?.count === 'number') return res.data.count;
        // Fallback: count array items from known response shapes
        for (const key of Object.keys(res.data || {})) {
            if (Array.isArray(res.data[key])) {
                return (res.data[key] as unknown[]).length;
            }
        }
        return 0;
    };

    return {
        users: extractCount(usersRes),
        exams: extractCount(examsRes),
        news: extractCount(newsRes),
        universities: extractCount(universitiesRes),
        subscriptionPlans: extractCount(subscriptionPlansRes),
        resources: extractCount(resourcesRes),
        helpArticles: extractCount(helpArticlesRes),
        supportTickets: extractCount(supportTicketsRes),
        contactMessages: extractCount(contactMessagesRes),
        universityCategories: extractCount(universityCategoriesRes),
    };
}

/**
 * Run all seed functions once (same order as runSeedDataGenerator).
 */
async function runAllSeedFunctions(): Promise<void> {
    await seedUsers();
    await seedUniversityCategories();
    await seedUniversities();
    await seedExams();
    await seedNews();
    await seedSubscriptionPlans();
    await seedResources();
    await seedHelpArticles();
    await seedSupportTickets();
    await seedContactMessages();
}

// ─── Property Test ───────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 1: Seed Data Idempotency', () => {
    it('N consecutive seed executions should produce identical document counts (no duplicates)', async () => {
        /**
         * **Validates: Requirements 2.2**
         *
         * Strategy: Use fast-check to generate random N (1-5).
         * Run the seed generator once to establish baseline counts,
         * then run it N more times and verify counts remain identical.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 5 }),
                async (n: number) => {
                    // Run seed once to establish baseline
                    await runAllSeedFunctions();
                    const baselineCounts = await getCollectionCounts();

                    // Run seed N more times
                    for (let i = 0; i < n; i++) {
                        await runAllSeedFunctions();
                    }

                    // Get counts after N additional runs
                    const afterCounts = await getCollectionCounts();

                    // All collection counts must remain identical
                    expect(afterCounts.users).toBe(baselineCounts.users);
                    expect(afterCounts.exams).toBe(baselineCounts.exams);
                    expect(afterCounts.news).toBe(baselineCounts.news);
                    expect(afterCounts.universities).toBe(baselineCounts.universities);
                    expect(afterCounts.subscriptionPlans).toBe(baselineCounts.subscriptionPlans);
                    expect(afterCounts.resources).toBe(baselineCounts.resources);
                    expect(afterCounts.helpArticles).toBe(baselineCounts.helpArticles);
                    expect(afterCounts.supportTickets).toBe(baselineCounts.supportTickets);
                    expect(afterCounts.contactMessages).toBe(baselineCounts.contactMessages);
                    expect(afterCounts.universityCategories).toBe(baselineCounts.universityCategories);
                },
            ),
            { numRuns: 20 },
        );
    });
});
