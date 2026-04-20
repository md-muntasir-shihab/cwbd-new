import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { DEFAULT_HERO_CONFIGS, mergeHeroConfig } from '../hooks/usePageHeroSettings';
import { PAGE_KEYS } from '../components/admin/PageHeroSettingsEditor';
import type { PageHeroConfig, PageHeroKey, PageHeroVantaEffect } from '../services/api';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock react-router-dom (needed by PageHeroBanner)
vi.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
    useNavigate: () => vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
        h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
        p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
}));

// Mock Vanta imports (they require WebGL)
vi.mock('three', () => ({}));
vi.mock('vanta/dist/vanta.birds.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.net.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.globe.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.waves.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.fog.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.clouds.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.cells.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.trunk.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.halo.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.dots.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.rings.min', () => ({ default: vi.fn() }));
vi.mock('vanta/dist/vanta.topology.min', () => ({ default: vi.fn() }));

// Lazy-import PageHeroBanner after mocks are set up
import PageHeroBanner from '../components/common/PageHeroBanner';

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_PAGE_KEYS: PageHeroKey[] = [
    'home', 'universities', 'news', 'exams', 'resources',
    'subscriptionPlans', 'contact', 'about', 'helpCenter', 'privacy', 'terms',
];

const EXPECTED_EFFECTS: Record<PageHeroKey, PageHeroVantaEffect> = {
    home: 'halo',
    universities: 'net',
    news: 'globe',
    exams: 'waves',
    resources: 'cells',
    subscriptionPlans: 'net',
    contact: 'fog',
    about: 'clouds',
    helpCenter: 'dots',
    privacy: 'rings',
    terms: 'rings',
};

// ── fast-check arbitraries ─────────────────────────────────────────────────────

const vantaEffectArb: fc.Arbitrary<PageHeroVantaEffect> = fc.constantFrom(
    'birds', 'net', 'globe', 'waves', 'fog', 'clouds',
    'cells', 'trunk', 'halo', 'dots', 'rings', 'topology', 'none',
);

const hexColorArb = fc.tuple(
    fc.integer({ min: 0, max: 0xffffff }),
).map(([n]) => `#${n.toString(16).padStart(6, '0')}`);

const ctaArb = fc.record({
    label: fc.string({ minLength: 0, maxLength: 30 }),
    url: fc.string({ minLength: 0, maxLength: 60 }),
});

const pageHeroConfigArb: fc.Arbitrary<PageHeroConfig> = fc.record({
    enabled: fc.boolean(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    subtitle: fc.string({ minLength: 1, maxLength: 100 }),
    pillText: fc.string({ minLength: 1, maxLength: 20 }),
    vantaEffect: vantaEffectArb,
    vantaColor: hexColorArb,
    vantaBackgroundColor: hexColorArb,
    gradientFrom: hexColorArb,
    gradientTo: hexColorArb,
    showSearch: fc.boolean(),
    searchPlaceholder: fc.string({ minLength: 0, maxLength: 40 }),
    primaryCTA: ctaArb,
    secondaryCTA: ctaArb,
});

const pageKeyArb: fc.Arbitrary<PageHeroKey> = fc.constantFrom(...ALL_PAGE_KEYS);


// ════════════════════════════════════════════════════════════════════════════════
// Task 6.1 — Unit tests: DEFAULT_HERO_CONFIGS has all 11 keys with correct vantaEffect values
// ════════════════════════════════════════════════════════════════════════════════

describe('DEFAULT_HERO_CONFIGS', () => {
    it('has exactly 11 keys', () => {
        const keys = Object.keys(DEFAULT_HERO_CONFIGS);
        expect(keys).toHaveLength(11);
    });

    it('contains all expected page keys', () => {
        const keys = Object.keys(DEFAULT_HERO_CONFIGS);
        for (const expected of ALL_PAGE_KEYS) {
            expect(keys).toContain(expected);
        }
    });

    it.each(ALL_PAGE_KEYS)('maps "%s" to the correct vantaEffect', (key) => {
        expect(DEFAULT_HERO_CONFIGS[key].vantaEffect).toBe(EXPECTED_EFFECTS[key]);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// Task 6.2 — Unit tests: PAGE_KEYS in PageHeroSettingsEditor contains all 11 page entries
// ════════════════════════════════════════════════════════════════════════════════

describe('PAGE_KEYS in PageHeroSettingsEditor', () => {
    it('has exactly 11 entries', () => {
        expect(PAGE_KEYS).toHaveLength(11);
    });

    it('contains all expected page keys', () => {
        const keys = PAGE_KEYS.map((entry) => entry.key);
        for (const expected of ALL_PAGE_KEYS) {
            expect(keys).toContain(expected);
        }
    });

    it('each entry has key, label, and icon', () => {
        for (const entry of PAGE_KEYS) {
            expect(entry).toHaveProperty('key');
            expect(entry).toHaveProperty('label');
            expect(entry).toHaveProperty('icon');
            expect(typeof entry.key).toBe('string');
            expect(typeof entry.label).toBe('string');
            expect(typeof entry.icon).toBe('string');
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// Task 6.3 — Property 1: enabled flag controls rendering
// Feature: vanta-hero-banners, Property 1: enabled flag controls rendering
// **Validates: Requirements 1.1, 3.4**
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Wrapper that mimics how pages conditionally render PageHeroBanner based on
 * the `enabled` flag — exactly as done in Universities, News, HelpCenter, etc.
 */
function HeroBannerWrapper({ config }: { config: PageHeroConfig }) {
    if (!config.enabled) return null;

    return (
        <PageHeroBanner
            title={config.title}
            subtitle={config.subtitle}
            pillText={config.pillText}
            vantaEffect={config.vantaEffect}
            vantaColor={config.vantaColor}
            vantaBackgroundColor={config.vantaBackgroundColor}
            gradientFrom={config.gradientFrom}
            gradientTo={config.gradientTo}
            primaryCTA={config.primaryCTA}
            secondaryCTA={config.secondaryCTA}
        />
    );
}

describe('Property 1: enabled flag controls rendering', () => {
    it('renders content when enabled=true and renders nothing when enabled=false (100+ iterations)', () => {
        fc.assert(
            fc.property(pageHeroConfigArb, (config) => {
                const { container } = render(<HeroBannerWrapper config={config} />);

                if (config.enabled) {
                    // When enabled, the banner wrapper div should be present
                    expect(container.innerHTML).not.toBe('');
                } else {
                    // When disabled, nothing renders
                    expect(container.innerHTML).toBe('');
                }
            }),
            { numRuns: 150 },
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// Task 6.4 — Property 2: server config overrides defaults
// Feature: vanta-hero-banners, Property 2: server config overrides defaults
// **Validates: Requirements 2.3, 8.3**
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Generates a partial server config where each field is either present (non-empty)
 * or absent, so we can verify the merge logic.
 */
const partialServerConfigArb: fc.Arbitrary<Partial<PageHeroConfig>> = fc.record(
    {
        enabled: fc.boolean(),
        title: fc.string({ minLength: 1, maxLength: 50 }),
        subtitle: fc.string({ minLength: 1, maxLength: 100 }),
        pillText: fc.string({ minLength: 1, maxLength: 20 }),
        vantaEffect: vantaEffectArb,
        vantaColor: hexColorArb,
        vantaBackgroundColor: hexColorArb,
        gradientFrom: hexColorArb,
        gradientTo: hexColorArb,
        showSearch: fc.boolean(),
        searchPlaceholder: fc.string({ minLength: 1, maxLength: 40 }),
        primaryCTA: ctaArb,
        secondaryCTA: ctaArb,
    },
    { requiredKeys: [] },
);

describe('Property 2: server config overrides defaults', () => {
    it('server-provided non-empty values appear in result, absent fields fall back to defaults (100+ iterations)', () => {
        fc.assert(
            fc.property(pageKeyArb, partialServerConfigArb, (key, serverConfig) => {
                const defaults = DEFAULT_HERO_CONFIGS[key];
                const result = mergeHeroConfig(defaults, serverConfig);

                // String fields use || (falsy = fallback to default)
                const stringFields = [
                    'title', 'subtitle', 'pillText', 'vantaEffect',
                    'vantaColor', 'vantaBackgroundColor', 'gradientFrom', 'gradientTo',
                    'searchPlaceholder',
                ] as const;

                for (const field of stringFields) {
                    if (field in serverConfig && serverConfig[field]) {
                        expect(result[field]).toBe(serverConfig[field]);
                    } else {
                        expect(result[field]).toBe(defaults[field]);
                    }
                }

                // Boolean fields use ?? (only undefined/null = fallback)
                const booleanFields = ['enabled', 'showSearch'] as const;
                for (const field of booleanFields) {
                    if (field in serverConfig && serverConfig[field] !== undefined && serverConfig[field] !== null) {
                        expect(result[field]).toBe(serverConfig[field]);
                    } else {
                        expect(result[field]).toBe(defaults[field]);
                    }
                }

                // CTA fields: label and url use ||
                for (const ctaField of ['primaryCTA', 'secondaryCTA'] as const) {
                    const serverCTA = serverConfig[ctaField];
                    if (serverCTA?.label) {
                        expect(result[ctaField].label).toBe(serverCTA.label);
                    } else {
                        expect(result[ctaField].label).toBe(defaults[ctaField].label);
                    }
                    if (serverCTA?.url) {
                        expect(result[ctaField].url).toBe(serverCTA.url);
                    } else {
                        expect(result[ctaField].url).toBe(defaults[ctaField].url);
                    }
                }
            }),
            { numRuns: 150 },
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// Task 6.5 — Property 3: default fallback when no server config
// Feature: vanta-hero-banners, Property 3: default fallback when no server config
// **Validates: Requirements 7.4**
// ════════════════════════════════════════════════════════════════════════════════

describe('Property 3: default fallback when no server config', () => {
    it('returns DEFAULT_HERO_CONFIGS[key] when serverConfig is undefined (100+ iterations)', () => {
        fc.assert(
            fc.property(pageKeyArb, (key) => {
                const defaults = DEFAULT_HERO_CONFIGS[key];
                const result = mergeHeroConfig(defaults, undefined);
                expect(result).toEqual(defaults);
            }),
            { numRuns: 150 },
        );
    });

    it('returns DEFAULT_HERO_CONFIGS[key] when serverConfig is null', () => {
        fc.assert(
            fc.property(pageKeyArb, (key) => {
                const defaults = DEFAULT_HERO_CONFIGS[key];
                const result = mergeHeroConfig(defaults, null);
                expect(result).toEqual(defaults);
            }),
            { numRuns: 150 },
        );
    });
});
