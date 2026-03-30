import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/index.css';
import { initFirebaseAppCheck, initFirebaseClient } from './lib/firebase';
import { registerAllMocks } from './mocks/registerMocks';

import { HelmetProvider } from 'react-helmet-async';

initFirebaseClient();
void initFirebaseAppCheck();
registerAllMocks();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HelmetProvider>
            <App />
        </HelmetProvider>
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
