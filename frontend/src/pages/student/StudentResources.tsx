import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, FileText, Search } from 'lucide-react';
import { getPublicResourceSettings, getStudentMeResources } from '../../services/api';
import { normalizeExternalUrl } from '../../utils/url';

const DEFAULT_STUDENT_COPY = {
    pageTitle: 'Resources',
    pageSubtitle: 'PDFs, links, and learning materials curated for students.',
    searchPlaceholder: 'Search resources',
    emptyStateMessage: 'No resources found.',
    studentHubEnabled: true,
    showSearch: true,
    showCategoryFilter: true,
    openLinksInNewTab: true,
    allowedCategories: [] as string[],
};

export default function StudentResources() {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');

    const settingsQuery = useQuery({
        queryKey: ['resources', 'public-settings'],
        queryFn: async () => (await getPublicResourceSettings()).data.settings,
        staleTime: 60_000,
    });

    const resourcesQuery = useQuery({
        queryKey: ['student-hub', 'resources', category, query],
        queryFn: async () => (await getStudentMeResources({
            category: category !== 'all' ? category : undefined,
            q: query.trim() || undefined,
        })).data,
    });

    const settings = { ...DEFAULT_STUDENT_COPY, ...(settingsQuery.data || {}) };
    const categories = useMemo(() => {
        const ordered = new Set<string>(['all']);
        settings.allowedCategories.forEach((item) => item?.trim() && ordered.add(item.trim()));
        (resourcesQuery.data?.categories || []).forEach((item) => item?.trim() && ordered.add(item.trim()));
        return Array.from(ordered);
    }, [resourcesQuery.data?.categories, settings.allowedCategories]);

    if (!settings.studentHubEnabled) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <BookOpen className="mx-auto h-8 w-8 text-indigo-500" />
                <h1 className="mt-3 text-xl font-bold">Resources hub is hidden</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    The student resources area is currently unavailable from the dashboard.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h1 className="text-2xl font-bold">{settings.pageTitle}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settings.pageSubtitle}</p>
                <div className={`mt-4 grid gap-2 ${settings.showCategoryFilter ? 'grid-cols-1 md:grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
                    {settings.showSearch ? (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={settings.searchPlaceholder}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-9 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                    ) : null}
                    {settings.showCategoryFilter ? (
                        <select
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                        >
                            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {resourcesQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/60" />
                    ))
                ) : resourcesQuery.isError ? (
                    <div className="rounded-2xl border border-rose-300/40 bg-rose-50/70 p-4 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                        Failed to load resources.
                    </div>
                ) : (resourcesQuery.data?.items || []).length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                        {settings.emptyStateMessage}
                    </div>
                ) : (
                    (resourcesQuery.data?.items || []).map((item: any) => {
                        const href = normalizeExternalUrl(item.externalUrl || item.fileUrl || '');
                        const external = settings.openLinksInNewTab;
                        return (
                            <article key={String(item._id)} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <p className="text-xs uppercase tracking-wide text-slate-500">{String(item.category || 'General')}</p>
                                <h2 className="mt-1 font-semibold">{String(item.title || '')}</h2>
                                <p className="mt-2 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">{String(item.description || '')}</p>
                                <div className="mt-auto pt-4">
                                    {href ? (
                                        <a
                                            href={href}
                                            target={external ? '_blank' : undefined}
                                            rel={external ? 'noreferrer noopener' : undefined}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                                        >
                                            {String(item.type || '').toLowerCase() === 'pdf' ? <FileText className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                            Open
                                        </a>
                                    ) : (
                                        <button disabled className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-500">
                                            Unavailable
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </div>
    );
}
