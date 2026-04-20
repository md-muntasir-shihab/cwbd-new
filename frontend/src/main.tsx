import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import AppDialogHost from './components/ui/AppDialogHost';
import './styles/index.css';
import { initFirebaseAnalytics, initFirebaseAppCheck, initFirebaseClient } from './lib/firebase';
import { registerAllMocks } from './mocks/registerMocks';

import { HelmetProvider } from 'react-helmet-async';

// Pre-load Three.js onto window.THREE so Vanta effects can find it at module evaluation time.
// Vanta's UMD bundles capture `window.THREE` into local vars when first evaluated by Vite's
// pre-bundler, so this must run before any Vanta import.
import * as THREE from 'three';
(() => {
    const w = window as any;
    if (!w.THREE) {
        const proxy: Record<string, unknown> = Object.create(null);
        for (const key of Object.keys(THREE)) proxy[key] = (THREE as any)[key];
        // Polyfill deprecated geometry classes (removed in Three.js r125+, Vanta 0.5.24 still uses them)
        if (!proxy.PlaneBufferGeometry) proxy.PlaneBufferGeometry = THREE.PlaneGeometry;
        if (!proxy.BoxBufferGeometry) proxy.BoxBufferGeometry = THREE.BoxGeometry;
        if (!proxy.CylinderBufferGeometry) proxy.CylinderBufferGeometry = THREE.CylinderGeometry;
        if (!proxy.SphereBufferGeometry) proxy.SphereBufferGeometry = THREE.SphereGeometry;
        // THREE.VertexColors was removed in r136 — Vanta birds/net use it
        if (!('VertexColors' in proxy)) proxy.VertexColors = true;
        w.THREE = proxy;
    }
})();

initFirebaseClient();
void initFirebaseAnalytics();
void initFirebaseAppCheck();
registerAllMocks();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HelmetProvider>
            <App />
        </HelmetProvider>
        <AppDialogHost />
        <Toaster
            position="top-right"
            toastOptions={{
                duration: 3500,
                style: {
                    background: 'linear-gradient(135deg, #052960 0%, #0D5FDB 72%, #0EA5E9 100%)',
                    color: '#EAF4FF',
                    borderRadius: '12px',
                    border: '1px solid rgba(135, 183, 255, 0.45)',
                    boxShadow: '0 16px 34px -20px rgba(13, 95, 219, 0.85)',
                },
                success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
        />
    </React.StrictMode>,
);
