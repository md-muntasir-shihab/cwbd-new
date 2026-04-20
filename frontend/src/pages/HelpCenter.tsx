import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  getPublicHelpCenter,
  searchPublicHelpArticles,
  type PublicHelpArticleSummary,
} from '../api/helpCenterApi';
import PageHeroBanner from '../components/common/PageHeroBanner';
import { usePageHeroSettings } from '../hooks/usePageHeroSettings';

export default function HelpCenterPage() {
  const [q, setQ] = useState('');
  const query = q.trim();
  const hero = usePageHeroSettings('helpCenter');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-help-center'],
    queryFn: getPublicHelpCenter,
  });

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['public-help-center-search', query],
    queryFn: () => searchPublicHelpArticles(query),
    enabled: query.length >= 2,
  });

  const categories = data?.categories ?? [];
  const defaultArticles = data?.articles ?? [];
  const activeArticles = query.length >= 2 ? (searchData?.articles ?? []) : defaultArticles;

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PublicHelpArticleSummary[]>();
    activeArticles.forEach((article) => {
      const key = String(article.categoryId ?? 'uncategorized');
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(article);
    });

    return categories
      .map((category) => ({
        category,
        articles: byCategory.get(String(category._id)) ?? [],
      }))
      .filter(section => section.articles.length > 0);
  }, [activeArticles, categories]);

  const uncategorized = useMemo(
    () => activeArticles.filter(article => !categories.some(category => String(category._id) === String(article.categoryId))),
    [activeArticles, categories],
  );

  return (
    <div className="min-h-screen">
      {hero.enabled && (
        <PageHeroBanner
          title={hero.title}
          subtitle={hero.subtitle}
          pillText={hero.pillText}
          vantaEffect={hero.vantaEffect}
          vantaColor={hero.vantaColor}
          vantaBackgroundColor={hero.vantaBackgroundColor}
          gradientFrom={hero.gradientFrom}
          gradientTo={hero.gradientTo}
          primaryCTA={hero.primaryCTA}
          secondaryCTA={hero.secondaryCTA}
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <label className="block">
            <span className="sr-only">Search help articles</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search help topics..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </label>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {query.length >= 2
              ? `Showing ${activeArticles.length} result(s) for "${query}"${searching ? ' ...' : ''}`
              : `Browse ${defaultArticles.length} published article(s)`}
          </p>
        </div>

        {isLoading && <div className="py-10 text-center text-sm text-slate-500">Loading help center...</div>}
        {isError && <div className="py-10 text-center text-sm text-red-500">Failed to load help center.</div>}

        {!isLoading && !isError && (
          <div className="mt-6 space-y-6">
            {grouped.map(section => (
              <section key={section.category._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">{section.category.name}</h2>
                {section.category.description && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.category.description}</p>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {section.articles.map(article => (
                    <Link
                      key={article._id}
                      to={`/help-center/${article.slug}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-500/50"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{article.title}</p>
                      {article.shortDescription && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{article.shortDescription}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {uncategorized.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Other Articles</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {uncategorized.map(article => (
                    <Link
                      key={article._id}
                      to={`/help-center/${article.slug}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-500/50"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{article.title}</p>
                      {article.shortDescription && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{article.shortDescription}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {activeArticles.length === 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No help articles found.
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
