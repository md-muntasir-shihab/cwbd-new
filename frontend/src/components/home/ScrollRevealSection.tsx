import { type ReactNode } from 'react';
import { useScrollReveal, scrollRevealClasses } from '../../hooks/useScrollReveal';

interface ScrollRevealSectionProps {
    children: ReactNode;
    className?: string;
    variant?: 'fade-up' | 'fade-left' | 'fade-right' | 'scale';
    delay?: number;
    threshold?: number;
}

/**
 * Wraps any section with a scroll-triggered reveal animation.
 * Cards and content fade/slide in when scrolled into the viewport.
 */
export default function ScrollRevealSection({
    children,
    className = '',
    variant = 'fade-up',
    delay = 0,
    threshold = 0.08,
}: ScrollRevealSectionProps) {
    const [ref, isVisible] = useScrollReveal<HTMLDivElement>({ threshold, delay, once: true });

    return (
        <div ref={ref} className={`${scrollRevealClasses(isVisible, variant)} ${className}`}>
            {children}
        </div>
    );
}
