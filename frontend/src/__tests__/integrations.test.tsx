/**
 * Frontend Unit Tests — Integration Panel Audit
 *
 * Tests:
 * - 13.1: Mock registry field names match backend registry after fix
 * - 13.2: StatusBadge renders all 4 statuses correctly including skipped
 * - 13.3: Skeleton loader shown during loading, error state shows retry button
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── 13.1: Mock registry field names match backend registry ─────────────────

describe('13.1 Mock registry field names match backend registry', () => {
    it('should have the same integration keys in both registries', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');

        // Backend registry keys (source of truth)
        const BACKEND_KEYS = [
            'meilisearch', 'imgproxy', 'listmonk', 'mautic', 'novu',
            'umami', 'plausible', 'b2_backup', 'smtp', 'cloudinary',
        ];

        const frontendKeys = MOCK_DESCRIPTORS.map((d) => d.key);
        expect(frontendKeys.sort()).toEqual(BACKEND_KEYS.sort());
    });

    it('should have exactly 10 entries in the mock registry', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        expect(MOCK_DESCRIPTORS).toHaveLength(10);
    });

    it('meilisearch: configFields match backend (baseUrl, indexPrefix)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'meilisearch')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['baseUrl', 'indexPrefix']);
    });

    it('meilisearch: secretFields match backend (masterKey, searchKey)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'meilisearch')!;
        const secretNames = entry.secretFields.map((f) => f.name);
        expect(secretNames).toEqual(['masterKey', 'searchKey']);
    });

    it('imgproxy: configFields match backend (baseUrl, allowRemote, allowedDomains)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'imgproxy')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['baseUrl', 'allowRemote', 'allowedDomains']);
    });

    it('imgproxy: secretFields match backend (signingKey, signingSalt)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'imgproxy')!;
        const secretNames = entry.secretFields.map((f) => f.name);
        expect(secretNames).toEqual(['signingKey', 'signingSalt']);
    });

    it('listmonk: configFields match backend (baseUrl, defaultListId)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'listmonk')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['baseUrl', 'defaultListId']);
    });

    it('listmonk: secretFields match backend (username, password)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'listmonk')!;
        const secretNames = entry.secretFields.map((f) => f.name);
        expect(secretNames).toEqual(['username', 'password']);
    });

    it('b2_backup: configFields match backend (endpoint, bucket, region)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'b2_backup')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['endpoint', 'bucket', 'region']);
    });

    it('smtp: configFields match backend (host, port, secure, fromAddress, fromName)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'smtp')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['host', 'port', 'secure', 'fromAddress', 'fromName']);
    });

    it('cloudinary: configFields match backend (cloudName)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'cloudinary')!;
        const configNames = entry.configFields.map((f) => f.name);
        expect(configNames).toEqual(['cloudName']);
    });

    it('cloudinary: secretFields match backend (apiKey, apiSecret)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const entry = MOCK_DESCRIPTORS.find((d) => d.key === 'cloudinary')!;
        const secretNames = entry.secretFields.map((f) => f.name);
        expect(secretNames).toEqual(['apiKey', 'apiSecret']);
    });

    it('all field types use backend-compatible values (text, url, number, boolean, multitext)', async () => {
        const { MOCK_DESCRIPTORS } = await import('../services/integrationsApi');
        const validTypes = ['text', 'url', 'number', 'boolean', 'multitext', 'string'];
        for (const descriptor of MOCK_DESCRIPTORS) {
            for (const field of descriptor.configFields) {
                expect(validTypes).toContain(field.type);
            }
        }
    });
});

// ─── 13.2: StatusBadge renders all 4 statuses correctly ─────────────────────

describe('13.2 StatusBadge renders all 4 statuses correctly including skipped', () => {
    it('renders "Healthy" text for success status', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        render(<StatusBadge status="success" />);
        expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('renders success badge with emerald styling', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        const { container } = render(<StatusBadge status="success" />);
        const badge = container.querySelector('span');
        expect(badge?.className).toContain('emerald');
    });

    it('renders "Failing" text for failed status', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        render(<StatusBadge status="failed" />);
        expect(screen.getByText('Failing')).toBeInTheDocument();
    });

    it('renders failed badge with rose styling', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        const { container } = render(<StatusBadge status="failed" />);
        const badge = container.querySelector('span');
        expect(badge?.className).toContain('rose');
    });

    it('renders "Skipped" text for skipped status', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        render(<StatusBadge status="skipped" />);
        expect(screen.getByText('Skipped')).toBeInTheDocument();
    });

    it('renders skipped badge with yellow styling', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        const { container } = render(<StatusBadge status="skipped" />);
        const badge = container.querySelector('span');
        expect(badge?.className).toContain('yellow');
    });

    it('renders "Untested" text for unknown status', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        render(<StatusBadge status="unknown" />);
        expect(screen.getByText('Untested')).toBeInTheDocument();
    });

    it('renders unknown badge with slate styling', async () => {
        const { StatusBadge } = await import('../pages/AdminSettingsIntegrations');
        const { container } = render(<StatusBadge status="unknown" />);
        const badge = container.querySelector('span');
        expect(badge?.className).toContain('slate');
    });
});

// ─── 13.3: Skeleton loader and error state ──────────────────────────────────

// We need to mock React Query and the integrations API
vi.mock('../services/integrationsApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/integrationsApi')>();
    return {
        ...actual,
        listIntegrations: vi.fn(),
        didFallBackToMock: vi.fn(() => false),
    };
});

vi.mock('../components/admin/AdminGuardShell', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-guard">{children}</div>,
}));

// Mock react-query to control loading/error states
const mockRefetch = vi.fn();
const mockQueryState = {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: mockRefetch,
    isFetching: false,
};

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => mockQueryState,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    QueryClient: vi.fn(),
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

describe('13.3 Skeleton loader shown during loading, error state shows retry button', () => {
    beforeEach(() => {
        mockQueryState.data = undefined;
        mockQueryState.isLoading = false;
        mockQueryState.isError = false;
        mockQueryState.error = null;
        mockQueryState.isFetching = false;
    });

    it('shows skeleton loader (animate-pulse cards) during loading state', async () => {
        mockQueryState.isLoading = true;

        const AdminSettingsIntegrationsPage = (await import('../pages/AdminSettingsIntegrations')).default;
        const { container } = render(<AdminSettingsIntegrationsPage />);

        // Skeleton loader uses animate-pulse class
        const skeletonCards = container.querySelectorAll('.animate-pulse');
        expect(skeletonCards.length).toBeGreaterThan(0);
    });

    it('shows multiple skeleton card placeholders during loading', async () => {
        mockQueryState.isLoading = true;

        const AdminSettingsIntegrationsPage = (await import('../pages/AdminSettingsIntegrations')).default;
        const { container } = render(<AdminSettingsIntegrationsPage />);

        // Should show 4 skeleton cards
        const skeletonCards = container.querySelectorAll('.animate-pulse');
        expect(skeletonCards.length).toBe(4);
    });

    it('shows error message when loading fails', async () => {
        mockQueryState.isError = true;
        mockQueryState.error = new Error('Network error');

        const AdminSettingsIntegrationsPage = (await import('../pages/AdminSettingsIntegrations')).default;
        render(<AdminSettingsIntegrationsPage />);

        expect(screen.getByText(/Failed to load integrations/)).toBeInTheDocument();
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    it('shows retry button in error state', async () => {
        mockQueryState.isError = true;
        mockQueryState.error = new Error('Server error');

        const AdminSettingsIntegrationsPage = (await import('../pages/AdminSettingsIntegrations')).default;
        render(<AdminSettingsIntegrationsPage />);

        const retryButton = screen.getByRole('button', { name: /retry/i });
        expect(retryButton).toBeInTheDocument();
    });
});
