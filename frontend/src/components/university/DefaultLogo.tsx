import { getUniversityFallbackTextSizeClass } from '../../lib/universityPresentation';

interface DefaultLogoProps {
    fallbackText: string;
    className?: string;
    /** Override text size class (default: text-xl) */
    textClassName?: string;
}

export default function DefaultLogo({ fallbackText, className = '', textClassName }: DefaultLogoProps) {
    const compactFallbackText = String(fallbackText || '').replace(/\s+/g, '').toUpperCase();
    const logoLines = (() => {
        if (compactFallbackText.length <= 3) return [compactFallbackText];
        if (compactFallbackText.length === 4) return [compactFallbackText.slice(0, 2), compactFallbackText.slice(2)];
        const pivot = compactFallbackText.length >= 6 ? 3 : Math.ceil(compactFallbackText.length / 2);
        return [compactFallbackText.slice(0, pivot), compactFallbackText.slice(pivot)].filter(Boolean);
    })();
    const effectiveTextClassName = textClassName
        || (logoLines.length > 1
            ? (compactFallbackText.length >= 6 ? 'text-[0.8rem] sm:text-[0.9rem]' : 'text-[0.95rem] sm:text-[1.05rem]')
            : getUniversityFallbackTextSizeClass(compactFallbackText));

    return (
        <div
            className={`flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 dark:from-primary/30 dark:to-primary/15 ${className}`}
            data-testid="university-fallback-logo"
        >
            <span className="flex flex-col items-center justify-center gap-0.5 px-1 text-center" title={compactFallbackText || fallbackText}>
                {logoLines.map((line, index) => (
                    <span
                        key={`${line}-${index}`}
                        className={`${effectiveTextClassName} whitespace-nowrap font-black leading-none tracking-[-0.04em] text-primary select-none dark:text-primary/90`}
                    >
                        {line}
                    </span>
                ))}
            </span>
        </div>
    );
}
