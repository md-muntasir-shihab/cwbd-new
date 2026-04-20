/**
 * Content Linter Service
 *
 * Pre-send content validation that checks:
 *  - Placeholder resolution against available data fields
 *  - Channel-specific length limits (SMS body, email subject)
 *  - Restricted terms and compliance flag regex patterns
 *  - Policy score computation with pass/warn/block decision
 *
 * Pure synchronous functions — no async or database access needed.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */

import { ContentLintConfig } from '../types/campaignSettings';

// ─── Result Interface ────────────────────────────────────────────────────────

export interface ContentLintResult {
    placeholderErrors: string[];
    lengthWarnings: Array<{ channel: string; actual: number; limit: number }>;
    restrictedTermHits: string[];
    policyScore: number;
    decision: 'pass' | 'warn' | 'block';
}

// ─── Placeholder regex: matches {{fieldName}} ────────────────────────────────

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Extract all unique placeholder names from a template string.
 */
function extractPlaceholders(template: string): string[] {
    const names = new Set<string>();
    let match: RegExpExecArray | null;
    // Reset lastIndex for safety since we reuse the global regex
    PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = PLACEHOLDER_REGEX.exec(template)) !== null) {
        names.add(match[1]);
    }
    return Array.from(names);
}

/**
 * Validate that every placeholder in the content resolves to a key in dataFields.
 * Returns a list of unresolvable placeholder names.
 *
 * Req 11.1, 11.2
 */
function validatePlaceholders(
    content: { body: string; subject?: string },
    dataFields: Record<string, string>,
): string[] {
    const allText = content.subject
        ? `${content.subject} ${content.body}`
        : content.body;

    const placeholders = extractPlaceholders(allText);
    const available = new Set(Object.keys(dataFields));

    return placeholders.filter((name) => !available.has(name));
}

/**
 * Check channel-specific length limits and return warnings for any violations.
 *
 * - SMS: checks body length against config.channelLengthLimits.sms (default 160)
 * - Email: checks subject length against config.channelLengthLimits.emailSubject (default 200)
 *
 * Req 11.3, 11.4
 */
function checkLengthLimits(
    content: { body: string; subject?: string },
    channel: 'sms' | 'email',
    config: ContentLintConfig,
): Array<{ channel: string; actual: number; limit: number }> {
    const warnings: Array<{ channel: string; actual: number; limit: number }> = [];

    if (channel === 'sms') {
        const limit = config.channelLengthLimits.sms;
        if (content.body.length > limit) {
            warnings.push({ channel: 'sms', actual: content.body.length, limit });
        }
    }

    if (channel === 'email' && content.subject !== undefined) {
        const limit = config.channelLengthLimits.emailSubject;
        if (content.subject.length > limit) {
            warnings.push({
                channel: 'email_subject',
                actual: content.subject.length,
                limit,
            });
        }
    }

    return warnings;
}

/**
 * Scan rendered content for restricted terms (case-insensitive substring match).
 * Returns the list of restricted terms that were found.
 *
 * Req 11.5
 */
function findRestrictedTerms(
    content: { body: string; subject?: string },
    restrictedTerms: string[],
): string[] {
    if (restrictedTerms.length === 0) return [];

    const allText = (
        content.subject ? `${content.subject} ${content.body}` : content.body
    ).toLowerCase();

    return restrictedTerms.filter((term) => allText.includes(term.toLowerCase()));
}

/**
 * Scan rendered content for compliance flag regex patterns.
 * Returns the list of patterns that matched.
 *
 * Req 11.5
 */
function findComplianceFlagMatches(
    content: { body: string; subject?: string },
    patterns: string[],
): string[] {
    if (patterns.length === 0) return [];

    const allText = content.subject
        ? `${content.subject} ${content.body}`
        : content.body;

    const matched: string[] = [];
    for (const pattern of patterns) {
        try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(allText)) {
                matched.push(pattern);
            }
        } catch {
            // Skip invalid regex patterns silently
        }
    }
    return matched;
}

/**
 * Compute the policy score from restricted term hits and compliance flag matches.
 *
 * Scoring:
 *  - +1 per restricted term hit
 *  - +2 per compliance flag pattern match
 *
 * Req 11.6
 */
function computePolicyScore(
    restrictedTermHitCount: number,
    complianceFlagMatchCount: number,
): number {
    return restrictedTermHitCount * 1 + complianceFlagMatchCount * 2;
}

/**
 * Determine the decision based on policy score and thresholds.
 *
 *  - pass:  score < warnThreshold
 *  - warn:  score >= warnThreshold && score < blockThreshold
 *  - block: score >= blockThreshold
 *
 * Req 11.6
 */
function computeDecision(
    score: number,
    warnThreshold: number,
    blockThreshold: number,
): 'pass' | 'warn' | 'block' {
    if (score >= blockThreshold) return 'block';
    if (score >= warnThreshold) return 'warn';
    return 'pass';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Lint campaign content before send or preview.
 *
 * Validates placeholders, enforces length limits, checks restricted terms
 * and compliance flag patterns, computes a policy score, and returns a
 * pass/warn/block decision.
 *
 * Req 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */
export function lint(
    content: { body: string; subject?: string },
    channel: 'sms' | 'email',
    dataFields: Record<string, string>,
    config: ContentLintConfig,
): ContentLintResult {
    // 1. Validate placeholders (Req 11.1, 11.2)
    const placeholderErrors = validatePlaceholders(content, dataFields);

    // 2. Check length limits (Req 11.3, 11.4)
    const lengthWarnings = checkLengthLimits(content, channel, config);

    // 3. Find restricted terms (Req 11.5)
    const restrictedTermHits = findRestrictedTerms(content, config.restrictedTerms);

    // 4. Find compliance flag matches (Req 11.5)
    const complianceFlagMatches = findComplianceFlagMatches(
        content,
        config.complianceFlagPatterns,
    );

    // 5. Compute policy score (Req 11.6)
    const policyScore = computePolicyScore(
        restrictedTermHits.length,
        complianceFlagMatches.length,
    );

    // 6. Determine decision (Req 11.6)
    const decision = computeDecision(
        policyScore,
        config.warnThreshold,
        config.blockThreshold,
    );

    return {
        placeholderErrors,
        lengthWarnings,
        restrictedTermHits,
        policyScore,
        decision,
    };
}
