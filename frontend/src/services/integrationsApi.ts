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

export async function listIntegrations(): Promise<IntegrationItem[]> {
    const { data } = await api.get<{ integrations: IntegrationItem[] }>(`/${ADMIN_PATH}/integrations`);
    return data.integrations;
}

export async function getIntegration(key: string): Promise<{ descriptor: IntegrationDescriptor; state: IntegrationState }> {
    const { data } = await api.get(`/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}`);
    return data;
}

export type UpdateIntegrationInput = {
    enabled?: boolean;
    config?: Record<string, unknown>;
    secrets?: Record<string, string>;
};

export async function updateIntegration(key: string, input: UpdateIntegrationInput): Promise<IntegrationState> {
    const { data } = await api.put<{ state: IntegrationState }>(
        `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}`,
        input,
    );
    return data.state;
}

export async function toggleIntegration(key: string, enabled: boolean): Promise<IntegrationState> {
    const { data } = await api.post<{ state: IntegrationState }>(
        `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}/toggle`,
        { enabled },
    );
    return data.state;
}

export async function testIntegration(key: string): Promise<{ status: 'success' | 'failed'; message: string; latencyMs?: number }> {
    const { data } = await api.post<{ result: { status: 'success' | 'failed'; message: string; latencyMs?: number } }>(
        `/${ADMIN_PATH}/integrations/${encodeURIComponent(key)}/test`,
    );
    return data.result;
}
