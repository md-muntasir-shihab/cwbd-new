/**
 * Null-safe display name extractor for populated Mongoose references.
 *
 * Handles every shape a reference field can take after `.populate()`:
 *   null / undefined  → "—"
 *   string             → the string itself
 *   object with full_name / name / username → first available
 *   empty object       → "—"
 */
export function displayName(ref: unknown): string {
    if (!ref) return '—';
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'object' && ref !== null) {
        const obj = ref as Record<string, unknown>;
        const value = obj.full_name || obj.name || obj.username;
        if (typeof value === 'string' && value) return value;
        return '—';
    }
    return '—';
}
