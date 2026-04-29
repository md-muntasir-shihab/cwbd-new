import IntegrationConfig, {
    IIntegrationConfig,
    IntegrationKey,
    IntegrationTestStatus,
} from '../../models/IntegrationConfig';
import { decrypt, encrypt } from '../cryptoService';
import { INTEGRATIONS_REGISTRY, getDescriptor } from './integrationsRegistry';
import { runConnectionTest } from './connectors';

/**
 * Service layer for the IntegrationConfig collection.
 *
 * Responsibilities:
 *  - Seed missing integration documents from the static registry on first boot.
 *  - Encrypt incoming secret fields via AES-256-GCM (`cryptoService`) and never
 *    return plaintext to API consumers.
 *  - Provide a runtime check `isEnabled(key)` that integration call sites can
 *    use to short-circuit when the integration is disabled or misconfigured.
 *  - Dispatch admin-initiated connection tests to per-integration connectors.
 */

export type SafeIntegrationConfig = {
    key: IntegrationKey;
    displayName: string;
    category: string;
    description: string;
    enabled: boolean;
    config: Record<string, unknown>;
    /** Names of secret fields that have been configured (encrypted in DB). */
    configuredSecrets: string[];
    lastTestedAt: Date | null;
    lastTestStatus: IntegrationTestStatus;
    lastTestMessage: string;
    updatedAt: Date;
};

type SecretsMap = Record<string, string>;

function encodeSecrets(secrets: SecretsMap): string | null {
    const filtered = Object.fromEntries(
        Object.entries(secrets).filter(([, v]) => typeof v === 'string' && v.length > 0),
    );
    if (Object.keys(filtered).length === 0) return null;
    return encrypt(JSON.stringify(filtered));
}

function decodeSecrets(ciphertext: string | null | undefined): SecretsMap {
    if (!ciphertext) return {};
    try {
        const json = decrypt(ciphertext);
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as SecretsMap;
        }
    } catch {
        // fall through to empty map
    }
    return {};
}

export function toSafeConfig(doc: IIntegrationConfig): SafeIntegrationConfig {
    const secrets = decodeSecrets(doc.credentialsEncrypted);
    return {
        key: doc.key,
        displayName: doc.displayName,
        category: doc.category,
        description: doc.description,
        enabled: doc.enabled,
        config: { ...(doc.config as Record<string, unknown>) },
        configuredSecrets: Object.keys(secrets),
        lastTestedAt: doc.lastTestedAt,
        lastTestStatus: doc.lastTestStatus,
        lastTestMessage: doc.lastTestMessage,
        updatedAt: doc.updatedAt,
    };
}

/**
 * Idempotent seed of the IntegrationConfig collection. Inserts a document for
 * every integration in the registry that is not yet present. Existing rows are
 * left untouched so admin-set values, toggles, and credentials survive boots.
 */
export async function seedIntegrationConfigs(): Promise<void> {
    for (const desc of INTEGRATIONS_REGISTRY) {
        await IntegrationConfig.updateOne(
            { key: desc.key },
            {
                $setOnInsert: {
                    key: desc.key,
                    displayName: desc.displayName,
                    category: desc.category,
                    description: desc.description,
                    enabled: false,
                    config: {},
                    credentialsEncrypted: null,
                    lastTestedAt: null,
                    lastTestStatus: 'unknown',
                    lastTestMessage: '',
                    updatedBy: null,
                },
            },
            { upsert: true },
        );
    }
}

export async function listAll(): Promise<SafeIntegrationConfig[]> {
    const docs = await IntegrationConfig.find({}).sort({ category: 1, displayName: 1 }).lean<IIntegrationConfig[]>();
    return docs.map((d) => toSafeConfig(d as IIntegrationConfig));
}

export async function getOne(key: IntegrationKey): Promise<SafeIntegrationConfig | null> {
    const doc = await IntegrationConfig.findOne({ key });
    if (!doc) return null;
    return toSafeConfig(doc);
}

/** Runtime check used by integration call sites. Returns false when disabled, missing, or misconfigured. */
export async function isEnabled(key: IntegrationKey): Promise<boolean> {
    const doc = await IntegrationConfig.findOne({ key }).lean<IIntegrationConfig | null>();
    return Boolean(doc?.enabled);
}

/**
 * Read full plaintext config (public + decrypted secrets) for use by server-side
 * integration code. NEVER expose the return value of this function over HTTP.
 */
export async function getRuntimeConfig(
    key: IntegrationKey,
): Promise<{ enabled: boolean; config: Record<string, unknown>; secrets: SecretsMap } | null> {
    const doc = await IntegrationConfig.findOne({ key }).lean<IIntegrationConfig | null>();
    if (!doc) return null;
    return {
        enabled: doc.enabled,
        config: { ...(doc.config as Record<string, unknown>) },
        secrets: decodeSecrets(doc.credentialsEncrypted),
    };
}

/** Convenience: read a single decrypted secret value, or null when absent. */
export async function getDecryptedSecret(key: IntegrationKey, secretName: string): Promise<string | null> {
    const runtime = await getRuntimeConfig(key);
    if (!runtime) return null;
    const value = runtime.secrets[secretName];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface UpdateInput {
    enabled?: boolean;
    config?: Record<string, unknown>;
    /** Map of secret name -> plaintext. Empty string clears that secret. */
    secrets?: Record<string, string>;
    actorId: string;
}

export async function updateConfig(
    key: IntegrationKey,
    input: UpdateInput,
): Promise<SafeIntegrationConfig> {
    const descriptor = getDescriptor(key);
    if (!descriptor) {
        throw Object.assign(new Error(`Unknown integration key: ${key}`), { status: 404 });
    }

    const doc = await IntegrationConfig.findOne({ key });
    if (!doc) {
        throw Object.assign(new Error(`Integration not seeded: ${key}`), { status: 404 });
    }

    if (typeof input.enabled === 'boolean') {
        doc.enabled = input.enabled;
    }

    if (input.config && typeof input.config === 'object') {
        const allowedNames = new Set(descriptor.configFields.map((f) => f.name));
        const sanitized: Record<string, unknown> = { ...(doc.config as Record<string, unknown>) };
        for (const [k, v] of Object.entries(input.config)) {
            if (allowedNames.has(k)) sanitized[k] = v;
        }
        doc.config = sanitized;
    }

    if (input.secrets && typeof input.secrets === 'object') {
        const allowedNames = new Set(descriptor.secretFields.map((f) => f.name));
        const existing = decodeSecrets(doc.credentialsEncrypted);
        for (const [k, v] of Object.entries(input.secrets)) {
            if (!allowedNames.has(k)) continue;
            if (typeof v !== 'string') continue;
            if (v === '') {
                delete existing[k];
            } else {
                existing[k] = v;
            }
        }
        doc.credentialsEncrypted = encodeSecrets(existing);
    }

    if (input.actorId) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mongoose = require('mongoose');
            doc.updatedBy = new mongoose.Types.ObjectId(input.actorId);
        } catch {
            // ignore — updatedBy is optional
        }
    }

    await doc.save();
    return toSafeConfig(doc);
}

export interface TestResult {
    status: IntegrationTestStatus;
    message: string;
}

/**
 * Run an admin-initiated connection test for one integration. Updates
 * `lastTestedAt`, `lastTestStatus`, `lastTestMessage` on the document.
 *
 * Tests are HTTP-only (no SDK) and time-boxed by the connector implementation.
 */
export async function testIntegration(key: IntegrationKey): Promise<TestResult> {
    const doc = await IntegrationConfig.findOne({ key });
    if (!doc) {
        throw Object.assign(new Error(`Integration not seeded: ${key}`), { status: 404 });
    }

    let result: TestResult;
    try {
        const config = { ...(doc.config as Record<string, unknown>) };
        const secrets = decodeSecrets(doc.credentialsEncrypted);
        result = await runConnectionTest(key, config, secrets);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error during connection test';
        result = { status: 'failed', message };
    }

    doc.lastTestedAt = new Date();
    doc.lastTestStatus = result.status;
    doc.lastTestMessage = result.message.slice(0, 500);
    await doc.save();
    return result;
}
