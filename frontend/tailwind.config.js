/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: 'var(--primary)',
                    50: '#EDF5FF',
                    100: '#D9E9FF',
                    200: '#B7D4FF',
                    300: '#87B7FF',
                    400: '#5599FF',
                    500: '#2D7CF2',
                    600: '#0D5FDB',
                    700: '#094CB8',
                    800: '#073A8D',
                    900: '#052960',
                },
                accent: {
                    DEFAULT: '#08B8A9',
                    50: '#E8FCFA',
                    100: '#C6F7F2',
                    200: '#94EEE6',
                    300: '#5FE1D6',
                    400: '#2DCEC2',
                    500: '#08B8A9',
                    600: '#06988C',
                    700: '#057A72',
                    800: '#035E58',
                    900: '#024340',
                },
                surface: 'var(--surface)',
                surface2: 'var(--surface2)',
                background: 'var(--bg)',
                'card-border': 'var(--border)',
                text: {
                    DEFAULT: 'var(--text)',
                    muted: 'var(--muted)',
                },
                success: 'var(--success)',
                warning: 'var(--warning)',
                danger: 'var(--danger)',
                dark: {
                    bg: 'var(--bg)',
                    surface: 'var(--surface)',
                    text: 'var(--text)',
                    border: 'var(--border)',
                },
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', '"Noto Sans Bengali"', '"Hind Siliguri"', 'Segoe UI', 'sans-serif'],
                heading: ['Sora', '"Plus Jakarta Sans"', 'Segoe UI', 'sans-serif'],
                bangla: ['"Noto Sans Bengali"', '"Hind Siliguri"', 'sans-serif'],
            },
            boxShadow: {
                card: '0 8px 30px -16px var(--shadowColor, rgba(13, 95, 219, 0.26))',
                'card-hover': '0 22px 45px -22px var(--shadowColor, rgba(13, 95, 219, 0.38))',
                elevated: '0 26px 60px -24px var(--shadowColor, rgba(7, 58, 141, 0.42))',
            },
            borderRadius: {
                xl: '0.75rem',
                '2xl': '1rem',
                '3xl': '1.5rem',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
                'pulse-slow': 'pulse 3s ease-in-out infinite',
                marquee: 'marquee 24s linear infinite',
                shimmer: 'shimmer 1.8s infinite',
                'float-slow': 'floatSlow 6s ease-in-out infinite',
                'float-slow-reverse': 'floatSlowReverse 8s ease-in-out infinite',
                'gradient-shift': 'gradientShift 8s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                marquee: {
                    '0%': { transform: 'translateX(0%)' },
                    '100%': { transform: 'translateX(-50%)' },
                },
                shimmer: {
                    '100%': { transform: 'translateX(100%)' },
                },
                floatSlow: {
                    '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
                    '50%': { transform: 'translateY(-20px) rotate(3deg)' },
                },
                floatSlowReverse: {
                    '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
                    '50%': { transform: 'translateY(15px) rotate(-2deg)' },
                },
                gradientShift: {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
            },
        },
    },
    plugins: [],
};
