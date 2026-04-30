import api from './api';

const RAW_ADMIN_PATH = String(import.meta.env.VITE_ADMIN_PATH || 'campusway-secure-admin').trim();
const ADMIN_PATH = RAW_ADMIN_PATH.replace(/^\/+|\/+$/g, '') || 'campusway-secure-admin';

export type IntegrationCategory = 'search' | 'images' | 'email' | 'marketing' | 'notifications' | 'analytics' | 'backup';

export type IntegrationConfigField = {
    name: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'url';
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

const MOCK_DESCRIPTORS: IntegrationDescriptor[] = [
    {
        key: 'meilisearch',
        displayName: 'Meilisearch',
        category: 'search',
        description: 'Self-hosted search engine. Powers the global search bar and admin lookups when enabled.',
        docsUrl: 'https://www.meilisearch.com/docs',
        configFields: [
            { name: 'host', label: 'Host URL', type: 'url', required: true, helpText: 'e.g. https://search.your-domain.com' },
            { name: 'indexPrefix', label: 'Index prefix', type: 'string', helpText: 'Optional namespace, e.g. campusway_prod_' },
        ],
        secretFields: [
            { name: 'adminApiKey', label: 'Admin API key', helpText: 'Meilisearch master/admin key' },
        ],
    },
    {
        key: 'imgproxy',
        displayName: 'imgproxy',
        category: 'images',
        description: 'On-the-fly image resizing and signing. Uploaded images are returned through signed imgproxy URLs.',
        docsUrl: 'https://docs.imgproxy.net/',
        configFields: [
            { name: 'host', label: 'Host URL', type: 'url', required: true, helpText: 'Public imgproxy origin' },
        ],
        secretFields: [
            { name: 'key', label: 'Signing key (hex)' },
            { name: 'salt', label: 'Signing salt (hex)' },
        ],
    },
    {
        key: 'smtp',
        displayName: 'SMTP',
        category: 'email',
        description: 'Direct SMTP transport for transactional email when no marketing relay is configured.',
        configFields: [
            { name: 'host', label: 'SMTP host', type: 'string', required: true },
            { name: 'port', label: 'Port', type: 'number', required: true },
            { name: 'username', label: 'Username', type: 'string' },
            { name: 'fromAddress', label: 'From address', type: 'string', required: true },
        ],
        secretFields: [
            { name: 'password', label: 'Password / app key' },
        ],
    },
    {
        key: 'listmonk',
        displayName: 'Listmonk',
        category: 'email',
        description: 'Self-hosted newsletter/list service. Used for bulk email and newsletter subscriptions.',
        docsUrl: 'https://listmonk.app/docs',
        configFields: [
            { name: 'host', label: 'Listmonk host', type: 'url', required: true },
            { name: 'username', label: 'Admin username', type: 'string', required: true },
            { name: 'defaultListId', label: 'Default list ID', type: 'number' },
        ],
        secretFields: [
            { name: 'password', label: 'Admin password' },
        ],
    },
    {
        key: 'mautic',
        displayName: 'Mautic',
        category: 'marketing',
        description: 'Marketing automation. Tracks contacts on registration and emits events from key product flows.',
        docsUrl: 'https://docs.mautic.org/',
        configFields: [
            { name: 'host', label: 'Mautic host', type: 'url', required: true },
            { name: 'username', label: 'Username', type: 'string', required: true },
        ],
        secretFields: [
            { name: 'password', label: 'Password / API key' },
        ],
    },
    {
        key: 'novu',
        displayName: 'Novu',
        category: 'notifications',
        description: 'Multi-channel notification routing. Triggers workflows when in-app notifications are created.',
        docsUrl: 'https://docs.novu.co/',
        configFields: [],
        secretFields: [
            { name: 'apiKey', label: 'API key' },
        ],
    },
    {
        key: 'umami',
        displayName: 'Umami',
        category: 'analytics',
        description: 'Privacy-first product analytics. Script tag is auto-injected into the public site.',
        docsUrl: 'https://umami.is/docs',
        configFields: [
            { name: 'scriptUrl', label: 'Script URL', type: 'url', required: true },
            { name: 'websiteId', label: 'Website ID', type: 'string', required: true },
        ],
        secretFields: [],
    },
    {
        key: 'plausible',
        displayName: 'Plausible',
        category: 'analytics',
        description: 'Lightweight privacy-friendly analytics. Used as fallback when Umami is disabled.',
        docsUrl: 'https://plausible.io/docs',
        configFields: [
            { name: 'scriptUrl', label: 'Script URL', type: 'url', required: true, helpText: 'e.g. https://plausible.io/js/script.js' },
            { name: 'domain', label: 'Site domain', type: 'string', required: true },
        ],
        secretFields: [],
    },
    {
        key: 'b2_backup',
        displayName: 'Backblaze B2 Backup',
        category: 'backup',
        description: 'Off-site database/file backups. Local backup files are mirrored to a B2 bucket after each cron run.',
        docsUrl: 'https://www.backblaze.com/b2/docs/',
        configFields: [
            { name: 'bucketId', label: 'Bucket ID', type: 'string', required: true },
        ],
        secretFields: [
            { name: 'keyId', label: 'Application Key ID' },
            { name: 'applicationKey', label: 'Application Key' },
        ],
    },
    {
        key: 'cloudinary',
        displayName: 'Cloudinary',
        category: 'images',
        description: 'Optional alternate image CDN. Disabled by default; only used when imgproxy is not configured.',
        configFields: [
            { name: 'cloudName', label: 'Cloud name', type: 'string', required: true },
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
export async function listIntegrations(): Promise<IntegrationItem[]> {
    try {
        const { data } = await api.get<{ integrations: IntegrationItem[] }>(`/${ADMIN_PATH}/integrations`);
        return data.integrations;
    } catch (error) {
        if (shouldUseMock(error)) {
            console.warn('[v0] integrations API unavailable, rendering mock registry');
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
