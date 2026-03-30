import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UniversityCategoryDetail } from '../../lib/apiClient';

interface CategoryChipRowProps {
    categories: UniversityCategoryDetail[];
    activeCategory: string;
    onCategoryChange: (categoryName: string) => void;
}

export default function CategoryChipRow({ categories, activeCategory, onCategoryChange }: CategoryChipRowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const totalCount = useMemo(
        () => categories.reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0),
        [categories],
    );

    const checkOverflow = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 2);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }, []);

    useEffect(() => {
        checkOverflow();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', checkOverflow, { passive: true });
        const ro = new ResizeObserver(checkOverflow);
        ro.observe(el);
        return () => { el.removeEventListener('scroll', checkOverflow); ro.disconnect(); };
    }, [checkOverflow, categories]);

    // horizontal mouse-wheel scroll on desktop
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already horizontal
            if (el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollBy({ left: e.deltaY, behavior: 'smooth' });
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    };

    if (!categories.length) return null;

    return (
        <div className="relative group/tabs">
            {/* Left arrow */}
            {canScrollLeft && (
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center rounded-full bg-white/90 dark:bg-slate-800/90 shadow border border-card-border/50 dark:border-dark-border/50 text-text-muted hover:text-primary transition"
                    aria-label="Scroll categories left"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
            )}

            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide -mx-1 px-1"
                role="tablist"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === 'all' || !activeCategory}
                    onClick={() => onCategoryChange('all')}
                    className={`tab-pill whitespace-nowrap flex-shrink-0 text-xs sm:text-sm ${(activeCategory === 'all' || !activeCategory) ? 'tab-pill-active' : 'tab-pill-inactive'}`}
                    data-testid="university-category-tab"
                    data-category="all"
                >
                    All
                    <span className="ml-1 text-xs opacity-70">({totalCount})</span>
                </button>
                {categories.map((item, index) => (
                    <button
                        key={`${item.categorySlug || item.categoryName}-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={activeCategory === item.categoryName}
                        onClick={() => onCategoryChange(item.categoryName)}
                        className={`tab-pill whitespace-nowrap flex-shrink-0 text-xs sm:text-sm ${activeCategory === item.categoryName ? 'tab-pill-active' : 'tab-pill-inactive'}`}
                        data-testid="university-category-tab"
                        data-category={item.categoryName}
                    >
                        {item.categoryName}
                        <span className="ml-1 text-xs opacity-70">({item.count})</span>
                    </button>
                ))}
            </div>

            {/* Right arrow */}
            {canScrollRight && (
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center rounded-full bg-white/90 dark:bg-slate-800/90 shadow border border-card-border/50 dark:border-dark-border/50 text-text-muted hover:text-primary transition"
                    aria-label="Scroll categories right"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
