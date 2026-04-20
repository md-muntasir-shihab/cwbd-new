import { describe, it, expect } from 'vitest';
import { displayName } from '../displayName';

describe('displayName', () => {
    it('returns "—" for null', () => {
        expect(displayName(null)).toBe('—');
    });

    it('returns "—" for undefined', () => {
        expect(displayName(undefined)).toBe('—');
    });

    it('returns the string itself for a string value', () => {
        expect(displayName('John Doe')).toBe('John Doe');
    });

    it('returns full_name when object has full_name', () => {
        expect(displayName({ full_name: 'Jane Smith', username: 'jsmith' })).toBe('Jane Smith');
    });

    it('returns name when object has name but no full_name', () => {
        expect(displayName({ name: 'Acme Corp' })).toBe('Acme Corp');
    });

    it('returns username when object has username but no full_name or name', () => {
        expect(displayName({ username: 'admin42' })).toBe('admin42');
    });

    it('returns "—" for an empty object', () => {
        expect(displayName({})).toBe('—');
    });

    it('prefers full_name over name and username', () => {
        expect(displayName({ full_name: 'A', name: 'B', username: 'C' })).toBe('A');
    });

    it('prefers name over username when full_name is absent', () => {
        expect(displayName({ name: 'B', username: 'C' })).toBe('B');
    });

    it('returns "—" for falsy values like 0 and empty string', () => {
        expect(displayName(0)).toBe('—');
        expect(displayName('')).toBe('—');
        expect(displayName(false)).toBe('—');
    });
});
