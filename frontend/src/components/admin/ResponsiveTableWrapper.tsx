/**
 * ResponsiveTableWrapper — Wraps admin data tables with overflow-x-auto
 * and scroll indicators for mobile viewports.
 *
 * Bug 1.23: Admin data tables need responsive wrapper with scroll indicators.
 * Requirements: 2.23
 */

import { useRef, useState, useEffect, type ReactNode } from 'react';

interface ResponsiveTableWrapperProps {
    children: ReactNode;
    className?: string;
}

export default function ResponsiveTableWrapper({ children, className = '' }: ResponsiveTableWrapperProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showRightShadow, setShowRightShadow] = useState(false);
    const [showLeftShadow, setShowLeftShadow] = useState(false);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const checkScroll = () => {
            const { scrollLeft, scrollWidth, clientWidth } = el;
            setShowLeftShadow(scrollLeft > 0);
            setShowRightShadow(scrollLeft + clientWidth < scrollWidth - 1);
        };

        checkScroll();
        el.addEventListener('scroll', checkScroll, { passive: true });
        const observer = new ResizeObserver(checkScroll);
        observer.observe(el);

        return () => {
            el.removeEventListener('scroll', checkScroll);
            observer.disconnect();
        };
    }, []);

    return (
        <div className={`relative ${className}`}>
            {showLeftShadow && (
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-white/80 to-transparent dark:from-slate-900/80" />
            )}
            {showRightShadow && (
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-white/80 to-transparent dark:from-slate-900/80" />
            )}
            <div
                ref={scrollRef}
                className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0"
            >
                {children}
            </div>
        </div>
    );
}
