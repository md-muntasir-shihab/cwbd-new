import api from './api';

const RAW_ADMIN_PATH = String(import.meta.env.VITE_ADMIN_PATH || 'campusway-secure-admin').trim();
const ADMIN_PATH = RAW_ADMIN_PATH.replace(/^\/+|\/+$/g, '') || 'campusway-secure-admin';

export type IntegrationCategory = 'search' | 'image' | 'email' | 'marketing' | 'notifications' | 'analytics' | 'backup' | 'storage';

export type IntegrationConfigField = {
    name: string;
    label: string;
    type: 'text' | 'multitext' | 'number' | 'boolean' | 'url' | 'string';
    required?: boolean;
    helpText?: string;
};

export type IntegrationSecretField = {
    name: string;
    label: string;
    helpText?: string;
};

export type IntegrationDescriptor = {
    key: string;
    displayName: string;
    category: IntegrationCategory;
    description: string;
    docsUrl?: string;
    configFields: IntegrationConfigField[];
    secretFields: IntegrationSecretField[];
};

export type IntegrationState = {
    enabled: boolean;
    config: Record<string, unknown>;
    configuredSecrets: string[];
    lastTestedAt: string | null;
    lastTestStatus: 'success' | 'failed' | 'unknown' | 'skipped';
    lastTestMessage: string;
    updatedAt: string;
};

export type IntegrationItem = IntegrationDescriptor & { state: IntegrationState };

// ---- Mock registry (used when backend is unreachable) ----------------------
function emptyState(): IntegrationState {
    return {
        enabled: false,
        config: {},
        configuredSecrets: [],
        lastTestedAt: null,
        lastTestStatus: 'unknown',
        lastTestMessage: '',
        updatedAt: new Date().toISOString(),
    };
}

export const MOCK_DESCRIPTORS: IntegrationDescriptor[] = [
    {
        key: 'meilisearch',
        displayName: 'Meilisearch',
        category: 'search',
        description: 'Self-hosted typo-tolerant search. Optional. Falls back to MongoDB regex search when disabled.',
        docsUrl: 'https://www.meilisearch.com/docs',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url', helpText: 'https://search.example.com' },
            { name: 'indexPrefix', label: 'Index prefix', type: 'text', helpText: 'campusway_' },
        ],
        secretFields: [
            { name: 'masterKey', label: 'Master key', helpText: 'Used only by admin reindex jobs.' },
            { name: 'searchKey', label: 'Search key', helpText: 'Used by user-facing search.' },
        ],
    },
    {
        key: 'imgproxy',
        displayName: 'imgproxy',
        category: 'image',
        description: 'On-the-fly image resizing/cropping proxy. Remote-URL fetching is OFF by default.',
        docsUrl: 'https://docs.imgproxy.net',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url' },
            { name: 'allowRemote', label: 'Allow remote URL fetching', type: 'boolean', helpText: 'Disabled by default. When enabled, only allowlisted HTTPS domains are permitted.' },
            { name: 'allowedDomains', label: 'Allowlisted HTTPS domains (newline-separated)', type: 'multitext' },
        ],
        secretFields: [
            { name: 'signingKey', label: 'Signing key (hex)' },
            { name: 'signingSalt', label: 'Signing salt (hex)' },
        ],
    },
    {
        key: 'listmonk',
        displayName: 'Listmonk',
        category: 'email',
        description: 'Self-hosted newsletter platform. Subscriber sync respects user consent/unsubscribe.',
        docsUrl: 'https://listmonk.app',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url' },
            { name: 'defaultListId', label: 'Default list ID', type: 'number' },
        ],
        secretFields: [
            { name: 'username', label: 'API username' },
            { name: 'password', label: 'API password' },
        ],
    },
    {
        key: 'mautic',
        displayName: 'Mautic',
        category: 'marketing',
        description: 'Marketing automation. Subscriber sync respects user consent/unsubscribe.',
        docsUrl: 'https://www.mautic.org',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url' },
        ],
        secretFields: [
            { name: 'username', label: 'API username' },
            { name: 'password', label: 'API password' },
        ],
    },
    {
        key: 'novu',
        displayName: 'Novu',
        category: 'notifications',
        description: 'Multi-channel notification orchestration. Coexists with the existing notification provider system.',
        docsUrl: 'https://docs.novu.co',
        configFields: [
            { name: 'baseUrl', label: 'API base URL', type: 'url', helpText: 'https://api.novu.co' },
            { name: 'environmentId', label: 'Environment ID', type: 'text' },
        ],
        secretFields: [
            { name: 'apiKey', label: 'API key' },
        ],
    },
    {
        key: 'umami',
        displayName: 'Umami',
        category: 'analytics',
        description: 'Privacy-friendly web analytics. PII MUST NEVER be sent in event payloads.',
        docsUrl: 'https://umami.is/docs',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url' },
            { name: 'websiteId', label: 'Website ID', type: 'text' },
        ],
        secretFields: [],
    },
    {
        key: 'plausible',
        displayName: 'Plausible',
        category: 'analytics',
        description: 'Alternative privacy-friendly analytics. Mutually exclusive in practice with Umami.',
        docsUrl: 'https://plausible.io/docs',
        configFields: [
            { name: 'baseUrl', label: 'Base URL', type: 'url', helpText: 'https://plausible.io' },
            { name: 'domain', label: 'Tracked domain', type: 'text' },
        ],
        secretFields: [
            { name: 'apiKey', label: 'API key' },
        ],
    },
    {
        key: 'b2_backup',
        displayName: 'Backblaze B2 (backup mirror)',
        category: 'backup',
        description: 'Off-site backup destination. Used by mongodump cron job. SFTP destination is a future add.',
        docsUrl: 'https://www.backblaze.com/docs/cloud-storage',
        configFields: [
            { name: 'endpoint', label: 'S3-compatible endpoint URL', type: 'url' },
            { name: 'bucket', label: 'Bucket name', type: 'text' },
            { name: 'region', label: 'Region', type: 'text', helpText: 'us-west-001' },
        ],
        secretFields: [
            { name: 'keyId', label: 'Application key ID' },
            { name: 'applicationKey', label: 'Application key' },
        ],
    },
    {
        key: 'smtp',
        displayName: 'Generic SMTP',
        category: 'email',
        description: 'Outbound email via Brevo, Mailgun, SendGrid, Gmail, or any SMTP provider. Uses existing Nodemailer.',
        configFields: [
            { name: 'host', label: 'SMTP host', type: 'text' },
            { name: 'port', label: 'SMTP port', type: 'number', helpText: '587' },
            { name: 'secure', label: 'Use TLS (port 465)', type: 'boolean' },
            { name: 'fromAddress', label: 'From address', type: 'text', helpText: 'no-reply@example.com' },
            { name: 'fromName', label: 'From name', type: 'text' },
        ],
        secretFields: [
            { name: 'username', label: 'SMTP username' },
            { name: 'password', label: 'SMTP password' },
        ],
    },
    {
        key: 'cloudinary',
        displayName: 'Cloudinary',
        category: 'storage',
        description: 'Hosted image storage and transformation. Used as an alternative to local /uploads or imgproxy.',
        docsUrl: 'https://cloudinary.com/documentation',
        configFields: [
            { name: 'cloudName', label: 'Cloud name', type: 'text' },
        ],
        secretFields: [
            { name: 'apiKey', label: 'API key' },
            { name: 'apiSecret', label: 'API secret' },
        ],
    },
];

const mockState: Map<string, IntegrationState> = new Map();
function getMockState(key: string): IntegrationState {
    let s = mockState.get(key);
    if (!s) {
        s = emptyState();
        mockState.set(key, s);
    }
    return s;
}

function buildMockItems(): IntegrationItem[] {
    return MOCK_DESCRIPTORS.map((d) => ({ ...d, state: getMockState(d.key) }));
}

function shouldUseMock(error: unknown): boolean {
    const err = error as { response?: { status?: number }; code?: string; message?: string };
    if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNREFUSED') return true;
    if (typeof err?.message === 'string' && err.message.toLowerCase().includes('network')) return true;
    const status = err?.response?.status;
    if (status === undefined) return true; // request never reached server
    if (status === 404 || status === 502 || status === 503 || status === 504) return true;
    return false;
}

// ---- API surface -----------------------------------------------------------

/** Indicates whether the last listIntegrations call fell back to mock data */
let _lastFetchUsedMock = false;
export function didFallBackToMock(): boolean {
    return _lastFetchUsedMock;
}

export async function listIntegrations(): Promise<IntegrationItem[]> {
    try {
        const { data } = await api.get<{ integrations: IntegrationItem[] }>(`/${ADMIN_PATH}/integrations`);
        _lastFetchUsedMock = false;
        return data.integrations;
    } catch (error) {
        if (shouldUseMock(error)) {
            console.warn('[v0] integrations API unavailable, rendering mock registry');
            _lastFetchUsedMock = true;
            return buildMockItems();
        }
        throw error;
    }
}

export async function getIntegration(key: string): Promise<{ descriptor: IntegrationDescriptor; state: IntegrationState }> {
    try {
        const { data } = await api.get(`/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}`);
        return data;
    } catch (error) {
        if (shouldUseMock(error)) {
            const descriptor = MOCK_DESCRIPTORS.find((d) => d.key === key);
            if (descriptor) return { descriptor, state: getMockState(key) };
        }
        throw error;
    }
}

export type UpdateIntegrationInput = {
    enabled?: boolean;
    config?: Record<string, unknown>;
    secrets?: Record<string, string>;
};

export async function updateIntegration(key: string, input: UpdateIntegrationInput): Promise<IntegrationState> {
    try {
        const { data } = await api.put<{ state: IntegrationState }>(
            `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}`,
            input,
        );
        return data.state;
    } catch (error) {
        if (shouldUseMock(error)) {
            const s = getMockState(key);
            if (typeof input.enabled === 'boolean') s.enabled = input.enabled;
            if (input.config) s.config = { ...s.config, ...input.config };
            if (input.secrets) {
                const next = new Set(s.configuredSecrets);
                for (const [secretKey, val] of Object.entries(input.secrets)) {
                    if (val && val.length > 0) next.add(secretKey);
                    else next.delete(secretKey);
                }
                s.configuredSecrets = Array.from(next);
            }
            s.updatedAt = new Date().toISOString();
            return s;
        }
        throw error;
    }
}

export async function toggleIntegration(key: string, enabled: boolean): Promise<IntegrationState> {
    try {
        const { data } = await api.post<{ state: IntegrationState }>(
            `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}/toggle`,
            { enabled },
        );
        return data.state;
    } catch (error) {
        if (shouldUseMock(error)) {
            const s = getMockState(key);
            s.enabled = enabled;
            s.updatedAt = new Date().toISOString();
            return s;
        }
        throw error;
    }
}

export async function testIntegration(key: string): Promise<{ status: 'success' | 'failed'; message: string; latencyMs?: number }> {
    try {
        const { data } = await api.post<{ result: { status: 'success' | 'failed'; message: string; latencyMs?: number } }>(
            `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}/test`,
        );
        return data.result;
    } catch (error) {
        if (shouldUseMock(error)) {
            const s = getMockState(key);
            const result: { status: 'success' | 'failed'; message: string; latencyMs?: number } = s.enabled
                ? { status: 'success', message: 'Mock connection OK (backend unavailable)', latencyMs: 12 }
                : { status: 'failed', message: 'Integration disabled' };
            s.lastTestStatus = result.status;
            s.lastTestMessage = result.message;
            s.lastTestedAt = new Date().toISOString();
            return result;
        }
        throw error;
    }
}
