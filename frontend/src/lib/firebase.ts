import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
    AppCheck,
    getToken,
    initializeAppCheck,
    ReCaptchaV3Provider,
    setTokenAutoRefreshEnabled,
} from 'firebase/app-check';

let firebaseClientApp: FirebaseApp | null = null;
let firebaseAppCheck: AppCheck | null = null;
let firebaseAppCheckInitAttempted = false;

declare global {
    interface Window {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
    }
}

export function initFirebaseClient(): FirebaseApp | null {
    if (firebaseClientApp) return firebaseClientApp;

    const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
    const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
    if (!projectId || !apiKey) {
        return null;
    }

    const config = {
        apiKey,
        authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || undefined,
        projectId,
        storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || undefined,
        messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || undefined,
        appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || undefined,
    };

    if (!getApps().length) {
        firebaseClientApp = initializeApp(config);
    } else {
        firebaseClientApp = getApps()[0];
    }

    return firebaseClientApp;
}

export function isFirebaseClientConfigured(): boolean {
    return Boolean(String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim() && String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim());
}

export function isFirebaseAppCheckConfigured(): boolean {
    return Boolean(
        isFirebaseClientConfigured() &&
        String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim()
    );
}

export function initFirebaseAppCheck(): AppCheck | null {
    if (firebaseAppCheck) return firebaseAppCheck;
    if (firebaseAppCheckInitAttempted) return null;
    firebaseAppCheckInitAttempted = true;

    if (typeof window === 'undefined' || !isFirebaseAppCheckConfigured()) {
        return null;
    }

    const app = initFirebaseClient();
    const siteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
    const debugToken = String(import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
    if (!app || !siteKey) {
        return null;
    }

    try {
        if (debugToken) {
            window.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
        }
        firebaseAppCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
        });
        setTokenAutoRefreshEnabled(firebaseAppCheck, true);
        return firebaseAppCheck;
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[CampusWay] Firebase App Check initialization skipped.', error);
        }
        firebaseAppCheck = null;
        return null;
    }
}

export async function getFirebaseAppCheckToken(forceRefresh = false): Promise<string> {
    const appCheck = initFirebaseAppCheck();
    if (!appCheck) return '';

    try {
        const token = await getToken(appCheck, forceRefresh);
        return String(token?.token || '').trim();
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[CampusWay] Unable to retrieve Firebase App Check token.', error);
        }
        return '';
    }
}
