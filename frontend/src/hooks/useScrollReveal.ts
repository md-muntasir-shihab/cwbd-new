import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ScrollRevealOptions {
    threshold?: number;
    rootMargin?: string;
    once?: boolean;
    delay?: number;
}

/**
 * Hook that detects when an element enters the viewport.
 * Returns a ref to attach and a boolean indicating visibility.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
    options: ScrollRevealOptions = {},
): [RefObject<T | null>, boolean] {
    const { threshold = 0.1, rootMargin = '0px 0px -40px 0px', once = true, delay = 0 } = options;
    const ref = useRef<T | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    if (delay > 0) {
                        setTimeout(() => setIsVisible(true), delay);
                    } else {
                        setIsVisible(true);
                    }
                    if (once) observer.unobserve(el);
                } else if (!once) {
                    setIsVisible(false);
                }
            },
            { threshold, rootMargin },
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold, rootMargin, once, delay]);

    return [ref, isVisible];
}

/**
 * CSS class string for scroll-reveal animation.
 * Apply to elements that should animate when scrolled into view.
 */
export function scrollRevealClasses(isVisible: boolean, variant: 'fade-up' | 'fade-left' | 'fade-right' | 'scale' = 'fade-up'): string {
    const base = 'transition-all duration-700 ease-out';
    if (isVisible) return `${base} opacity-100 translate-y-0 translate-x-0 scale-100`;

    switch (variant) {
        case 'fade-up': return `${base} opacity-0 translate-y-6`;
        case 'fade-left': return `${base} opacity-0 -translate-x-6`;
        case 'fade-right': return `${base} opacity-0 translate-x-6`;
        case 'scale': return `${base} opacity-0 scale-95`;
        default: return `${base} opacity-0 translate-y-6`;
    }
}
