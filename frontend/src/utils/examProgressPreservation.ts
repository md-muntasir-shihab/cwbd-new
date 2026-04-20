const EXAM_PROGRESS_PRESERVATION_KEY = 'cw_exam_force_logout_preserved';

/**
 * Preserves exam progress to a separate localStorage key before force logout clears state.
 * No-op if the exam cache doesn't exist.
 */
export function preserveExamProgress(examId: string, sessionId: string): void {
    const cacheKey = `cw_exam_${examId}_${sessionId}`;
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return;
    window.localStorage.setItem(
        EXAM_PROGRESS_PRESERVATION_KEY,
        JSON.stringify({
            examId,
            sessionId,
            preservedAt: new Date().toISOString(),
            cache: raw,
        })
    );
}

/**
 * Restores preserved exam progress after re-login.
 * Returns the preserved data or null if not present/invalid.
 */
export function restoreExamProgress(): { examId: string; sessionId: string; cache: string } | null {
    const raw = window.localStorage.getItem(EXAM_PROGRESS_PRESERVATION_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.examId && parsed.sessionId && parsed.cache) {
            return { examId: parsed.examId, sessionId: parsed.sessionId, cache: parsed.cache };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Clears the preserved exam progress from localStorage.
 */
export function clearPreservedExamProgress(): void {
    window.localStorage.removeItem(EXAM_PROGRESS_PRESERVATION_KEY);
}
