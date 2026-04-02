const PUBLIC_QA_UNIVERSITY_NAME_RE = /^open qa\b/i;
const PUBLIC_QA_UNIVERSITY_SLUG_RE = /^open-qa\b/i;
const PUBLIC_E2E_UNIVERSITY_NAME_RE = /^e2e\b/i;
const PUBLIC_E2E_UNIVERSITY_SLUG_RE = /^e2e[-_\s]?/i;
const PUBLIC_QA_CLUSTER_NAME_RE = /^open qa\b/i;
const PUBLIC_QA_CLUSTER_SLUG_RE = /^open-qa\b/i;
const PUBLIC_E2E_CLUSTER_NAME_RE = /^e2e\b/i;
const PUBLIC_E2E_CLUSTER_SLUG_RE = /^e2e[-_\s]?/i;
const PUBLIC_QA_PLAN_NAME_RE = /^e2e\b/i;
const PUBLIC_QA_PLAN_TOKEN_RE = /^e2e[-_\s]?/i;
const PUBLIC_DESCRIPTION_GARBAGE_PATTERNS = [
    /\s*open-university QA fixture\.?/gi,
    /\s*is included in the Open Universities QA dataset\.?/gi,
];

type PublicRecord = Record<string, unknown>;

export function combineMongoFilters(...filters: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
    const normalized = filters.filter((item): item is Record<string, unknown> => {
        return item !== null && item !== undefined && Object.keys(item).length > 0;
    });
    if (normalized.length === 0) return {};
    if (normalized.length === 1) return normalized[0];
    return { $and: normalized };
}

export function buildPublicUniversityExclusionQuery(): Record<string, unknown> {
    return {
        name: { $not: new RegExp(`${PUBLIC_QA_UNIVERSITY_NAME_RE.source}|${PUBLIC_E2E_UNIVERSITY_NAME_RE.source}`, 'i') },
        slug: { $not: new RegExp(`${PUBLIC_QA_UNIVERSITY_SLUG_RE.source}|${PUBLIC_E2E_UNIVERSITY_SLUG_RE.source}`, 'i') },
    };
}

export function buildPublicClusterExclusionQuery(): Record<string, unknown> {
    return {
        name: { $not: new RegExp(`${PUBLIC_QA_CLUSTER_NAME_RE.source}|${PUBLIC_E2E_CLUSTER_NAME_RE.source}`, 'i') },
        slug: { $not: new RegExp(`${PUBLIC_QA_CLUSTER_SLUG_RE.source}|${PUBLIC_E2E_CLUSTER_SLUG_RE.source}`, 'i') },
    };
}

export function buildPublicSubscriptionPlanExclusionQuery(): Record<string, unknown> {
    return {
        name: { $not: PUBLIC_QA_PLAN_NAME_RE },
        code: { $not: PUBLIC_QA_PLAN_TOKEN_RE },
        slug: { $not: PUBLIC_QA_PLAN_TOKEN_RE },
    };
}

export function isVisiblePublicUniversityRecord(record: PublicRecord): boolean {
    const name = String(record.name || '').trim();
    const slug = String(record.slug || '').trim();
    return !PUBLIC_QA_UNIVERSITY_NAME_RE.test(name)
        && !PUBLIC_QA_UNIVERSITY_SLUG_RE.test(slug)
        && !PUBLIC_E2E_UNIVERSITY_NAME_RE.test(name)
        && !PUBLIC_E2E_UNIVERSITY_SLUG_RE.test(slug);
}

export function isVisiblePublicClusterRecord(record: PublicRecord): boolean {
    const name = String(record.name || '').trim();
    const slug = String(record.slug || '').trim();
    return !PUBLIC_QA_CLUSTER_NAME_RE.test(name)
        && !PUBLIC_QA_CLUSTER_SLUG_RE.test(slug)
        && !PUBLIC_E2E_CLUSTER_NAME_RE.test(name)
        && !PUBLIC_E2E_CLUSTER_SLUG_RE.test(slug);
}

export function isVisiblePublicSubscriptionPlanRecord(record: PublicRecord): boolean {
    const name = String(record.name || '').trim();
    const code = String(record.code || '').trim();
    const slug = String(record.slug || '').trim();
    return !PUBLIC_QA_PLAN_NAME_RE.test(name)
        && !PUBLIC_QA_PLAN_TOKEN_RE.test(code)
        && !PUBLIC_QA_PLAN_TOKEN_RE.test(slug);
}

export function sanitizePublicFixtureText(value: unknown): string {
    let text = String(value || '').trim();

    for (const pattern of PUBLIC_DESCRIPTION_GARBAGE_PATTERNS) {
        text = text.replace(pattern, '');
    }

    return text
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .trim();
}
