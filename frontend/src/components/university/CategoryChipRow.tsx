import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UniversityCategoryDetail } from '../../lib/apiClient';

interface CategoryChipRowProps {
    categories: UniversityCategoryDetail[];
    activeCategory: string;
    onCategoryChange: (categorySlug: string) => void;
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

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
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

    const isActive = (slug: string, name: string) =>
        activeCategory === slug || activeCategory === name;

    return (
        <div className="relative group/tabs">
            {canScrollLeft && (
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    className="hidden md:flex absolute -left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700/80 text-slate-500 hover:text-primary hover:border-primary/40 transition-all"
                    aria-label="Scroll categories left"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
            )}

            <div
                ref={scrollRef}
                className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
                role="tablist"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === 'all' || !activeCategory}
                    onClick={() => onCategoryChange('all')}
                    className={`whitespace-nowrap flex-shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 ${activeCategory === 'all' || !activeCategory
                            ? 'bg-primary text-white shadow-md shadow-primary/25'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    data-testid="university-category-tab"
                    data-category="all"
                >
                    All
                    <span className={`ml-1.5 inline-flex items-center justify-center rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${activeCategory === 'all' || !activeCategory
                            ? 'bg-white/20'
                            : 'bg-slate-200/80 dark:bg-slate-700'
                        }`}>
                        {totalCount}
                    </span>
                </button>
                {categories.map((item, index) => {
                    const active = isActive(item.categorySlug, item.categoryName);
                    return (
                        <button
                            key={`${item.categorySlug || item.categoryName}-${index}`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onCategoryChange(item.categorySlug || item.categoryName)}
                            className={`whitespace-nowrap flex-shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 ${active
                                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                            data-testid="university-category-tab"
                            data-category={item.categorySlug || item.categoryName}
                        >
                            {item.categoryName}
                            <span className={`ml-1.5 inline-flex items-center justify-center rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-slate-200/80 dark:bg-slate-700'
                                }`}>
                                {item.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {canScrollRight && (
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    className="hidden md:flex absolute -right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700/80 text-slate-500 hover:text-primary hover:border-primary/40 transition-all"
                    aria-label="Scroll categories right"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
