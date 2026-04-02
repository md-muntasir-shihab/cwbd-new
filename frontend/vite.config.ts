import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeModuleId(id: string): string {
    return id.replace(/\\/g, '/');
}

function getManualChunkName(id: string): string | undefined {
    const normalizedId = normalizeModuleId(id);

    if (normalizedId.includes('/node_modules/')) {
        if (
            normalizedId.includes('/react/')
            || normalizedId.includes('/react-dom/')
            || normalizedId.includes('/react-router/')
            || normalizedId.includes('/react-router-dom/')
            || normalizedId.includes('/scheduler/')
        ) {
            return 'vendor-react';
        }

        if (
            normalizedId.includes('/@tanstack/react-query/')
            || normalizedId.includes('/axios/')
            || normalizedId.includes('/react-hot-toast/')
            || normalizedId.includes('/react-helmet-async/')
        ) {
            return 'vendor-app';
        }

        if (normalizedId.includes('/firebase/')) {
            return 'vendor-firebase';
        }

        if (
            normalizedId.includes('/framer-motion/')
            || normalizedId.includes('/lucide-react/')
        ) {
            return 'vendor-ui';
        }

        if (
            normalizedId.includes('/chart.js/')
            || normalizedId.includes('/react-chartjs-2/')
            || normalizedId.includes('/recharts/')
        ) {
            return 'vendor-charts';
        }

        if (
            normalizedId.includes('/react-markdown/')
            || normalizedId.includes('/remark-math/')
            || normalizedId.includes('/rehype-katex/')
            || normalizedId.includes('/react-katex/')
            || normalizedId.includes('/katex/')
            || normalizedId.includes('/dompurify/')
            || normalizedId.includes('/@types/dompurify/')
        ) {
            return 'vendor-content';
        }

        if (
            normalizedId.includes('/react-quill/')
            || normalizedId.includes('/browser-image-compression/')
            || normalizedId.includes('/xlsx/')
            || normalizedId.includes('/qrcode.react/')
            || normalizedId.includes('/screenfull/')
        ) {
            return 'vendor-tools';
        }

        if (
            normalizedId.includes('/date-fns/')
            || normalizedId.includes('/dayjs/')
            || normalizedId.includes('/react-is/')
        ) {
            return 'vendor-utils';
        }

        return 'vendor-misc';
    }

    return undefined;
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const frontendPort = Number(env.PORT || env.VITE_PORT || 5175);
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5003';

    return {
        appType: 'spa',  // Enable SPA routing fallback for frontend routes like /universities
        plugins: [react()],
        server: {
            port: frontendPort,
            strictPort: true,
            proxy: {
                '/api': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
                '/uploads': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
            },
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        return getManualChunkName(id);
                    },
                },
            },
        },
    };
});
