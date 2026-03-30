import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { AppCheck, getAppCheck } from 'firebase-admin/app-check';
import { getStorage } from 'firebase-admin/storage';

function hasServiceAccountConfig(): boolean {
    return Boolean(
        String(process.env.FIREBASE_PROJECT_ID || '').trim() &&
        String(process.env.FIREBASE_CLIENT_EMAIL || '').trim() &&
        String(process.env.FIREBASE_PRIVATE_KEY || '').trim()
    );
}

function normalizePrivateKey(raw: string): string {
    return raw.replace(/\\n/g, '\n');
}

export function isFirebaseAdminEnabled(): boolean {
    return hasServiceAccountConfig() && Boolean(String(process.env.FIREBASE_STORAGE_BUCKET || '').trim());
}

export function getFirebaseAdminApp(): App | null {
    if (!hasServiceAccountConfig()) return null;
    const existing = getApps();
    if (existing.length > 0) return existing[0];

    const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    const privateKey = normalizePrivateKey(String(process.env.FIREBASE_PRIVATE_KEY || ''));
    const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim() || undefined;

    return initializeApp({
        credential: cert({
            projectId,
            clientEmail,
            privateKey,
        }),
        ...(storageBucket ? { storageBucket } : {}),
    });
}

export function getFirebaseStorageBucket() {
    const app = getFirebaseAdminApp();
    if (!app) return null;
    return getStorage(app).bucket();
}

export function getFirebaseAppCheckService(): AppCheck | null {
    const app = getFirebaseAdminApp();
    if (!app) return null;
    return getAppCheck(app);
}
