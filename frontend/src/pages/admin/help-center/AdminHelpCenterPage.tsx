import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import AdminTabNav from '../../../components/admin/AdminTabNav';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { LifeBuoy, HelpCircle, Mail } from 'lucide-react';
import ModernToggle from '../../../components/ui/ModernToggle';
import {
    createAdminHelpArticle,
    createAdminHelpCategory,
    deleteAdminHelpArticle,
    deleteAdminHelpCategory,
    getAdminHelpArticles,
    getAdminHelpCategories,
    publishAdminHelpArticle,
    unpublishAdminHelpArticle,
    updateAdminHelpArticle,
    updateAdminHelpCategory,
    type AdminHelpArticle,
    type AdminHelpCategory,
} from '../../../api/adminHelpCenterApi';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const textareaClass = `${inputClass} min-h-[110px]`;

type CategoryForm = { name: string; description: string; icon: string; displayOrder: string; isActive: boolean };
type ArticleForm = { title: string; categoryId: string; shortDescription: string; fullContent: string; tagsInput: string; isPublished: boolean; isFeatured: boolean };

const emptyCategory: CategoryForm = { name: '', description: '', icon: '', displayOrder: '', isActive: true };
const emptyArticle: ArticleForm = { title: '', categoryId: '', shortDescription: '', fullContent: '', tagsInput: '', isPublished: false, isFeatured: false };

function categoryIdOf(article: AdminHelpArticle): string {
    return typeof article.categoryId === 'string' ? article.categoryId : String(article.categoryId?._id || '');
}

export default function AdminHelpCenterPage() {
    const queryClient = useQueryClient();
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
    const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
    const [articleForm, setArticleForm] = useState<ArticleForm>(emptyArticle);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [publishedFilter, setPublishedFilter] = useState<'all' | 'published' | 'draft'>('all');
    const categoriesQuery = useQuery({ queryKey: ['admin-help-categories'], queryFn: getAdminHelpCategories });
    const articlesQuery = useQuery({
        queryKey: ['admin-help-articles', search, categoryFilter, publishedFilter],
        queryFn: () => getAdminHelpArticles({
            limit: 100,
            q: search.trim() || undefined,
            categoryId: categoryFilter || undefined,
            isPublished: publishedFilter === 'all' ? '' : publishedFilter === 'published',
        }),
    });

    const categories = categoriesQuery.data ?? [];
    const articles = articlesQuery.data?.items ?? [];
    const loadedCount = useMemo(() => articles.length, [articles]);

    async function refresh(): Promise<void> {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin-help-categories'] }),
            queryClient.invalidateQueries({ queryKey: ['admin-help-articles'] }),
            queryClient.invalidateQueries({ queryKey: ['public-help-center'] }),
        ]);
    }

    function resetCategory(): void {
        setEditingCategoryId(null);
        setCategoryForm(emptyCategory);
    }

    function resetArticle(): void {
        setEditingArticleId(null);
        setArticleForm({ ...emptyArticle, categoryId: categoryFilter || categories[0]?._id || '' });
    }

    async function saveCategory(): Promise<void> {
        try {
            const payload = {
                name: categoryForm.name.trim(),
                description: categoryForm.description.trim(),
                icon: categoryForm.icon.trim(),
                displayOrder: categoryForm.displayOrder.trim() ? Number(categoryForm.displayOrder) : undefined,
                isActive: categoryForm.isActive,
            };
            if (editingCategoryId) await updateAdminHelpCategory(editingCategoryId, payload);
            else await createAdminHelpCategory(payload);
            toast.success(editingCategoryId ? 'Category updated' : 'Category created');
            await refresh();
            resetCategory();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to save category');
        }
    }

    async function saveArticle(): Promise<void> {
        try {
            const payload = {
                title: articleForm.title.trim(),
                categoryId: articleForm.categoryId,
                shortDescription: articleForm.shortDescription.trim(),
                fullContent: articleForm.fullContent.trim(),
                tags: articleForm.tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean),
                isPublished: articleForm.isPublished,
                isFeatured: articleForm.isFeatured,
            };
            if (editingArticleId) await updateAdminHelpArticle(editingArticleId, payload);
            else await createAdminHelpArticle(payload);
            toast.success(editingArticleId ? 'Article updated' : 'Article created');
            await refresh();
            resetArticle();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to save article');
        }
    }

    return (
        <AdminGuardShell title="Help Center Control" description="Manage the live public help center from admin." requiredModule="support_center">
            <AdminTabNav tabs={[
                { key: 'center', label: 'Support Center', path: ADMIN_PATHS.supportCenter, icon: LifeBuoy },
                { key: 'help', label: 'Help Center', path: ADMIN_PATHS.helpCenterAdmin, icon: HelpCircle },
                { key: 'contact', label: 'Contact Messages', path: ADMIN_PATHS.contact, icon: Mail },
            ]} />
            <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Categories</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{categories.length} total</p>
                        </div>
                        <button type="button" onClick={resetCategory} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Plus className="h-4 w-4" /> New</button>
                    </div>
                    <input aria-label="Category name" title="Category name" className={inputClass} placeholder="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} />
                    <input aria-label="Icon label" title="Icon label" className={inputClass} placeholder="Icon label" value={categoryForm.icon} onChange={(event) => setCategoryForm((prev) => ({ ...prev, icon: event.target.value }))} />
                    <textarea aria-label="Category description" title="Category description" className={textareaClass} placeholder="Description" value={categoryForm.description} onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <input aria-label="Display order" title="Display order" className={inputClass} type="number" placeholder="Display order" value={categoryForm.displayOrder} onChange={(event) => setCategoryForm((prev) => ({ ...prev, displayOrder: event.target.value }))} />
                        <div className="flex items-center rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                            <ModernToggle
                                label="Active"
                                checked={categoryForm.isActive}
                                onChange={(isActive) => setCategoryForm((prev) => ({ ...prev, isActive }))}
                                size="sm"
                            />
                        </div>
                    </div>
                    <button type="button" onClick={saveCategory} disabled={!categoryForm.name.trim()} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{editingCategoryId ? 'Update Category' : 'Create Category'}</button>
                    {categoriesQuery.isLoading && <p className="text-sm text-slate-500">Loading categories...</p>}
                    {categories.map((category: AdminHelpCategory) => (
                        <div key={category._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{category.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">/{category.slug} • {category.articleCount} article(s)</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-xs font-medium ${category.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{category.isActive ? 'Active' : 'Hidden'}</span>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <button type="button" onClick={() => { setEditingCategoryId(category._id); setCategoryForm({ name: category.name, description: category.description || '', icon: category.icon || '', displayOrder: String(category.displayOrder ?? ''), isActive: category.isActive }); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                                <button type="button" onClick={async () => { try { await deleteAdminHelpCategory(category._id); toast.success('Category deleted'); await refresh(); resetCategory(); } catch (error: any) { toast.error(error?.response?.data?.message || 'Failed to delete category'); } }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Articles</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{loadedCount} loaded • {articles.filter((article) => article.isPublished).length} published</p>
                        </div>
                        <button type="button" onClick={resetArticle} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Plus className="h-4 w-4" /> New Article</button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,160px]">
                        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search articles" title="Search articles" placeholder="Search title or tags" className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                        <select aria-label="Filter by category" title="Filter by category" className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
                        <select aria-label="Filter by status" title="Filter by status" className={inputClass} value={publishedFilter} onChange={(event) => setPublishedFilter(event.target.value as 'all' | 'published' | 'draft')}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option></select>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                        <input aria-label="Article title" title="Article title" className={inputClass} placeholder="Article title" value={articleForm.title} onChange={(event) => setArticleForm((prev) => ({ ...prev, title: event.target.value }))} />
                        <select aria-label="Article category" title="Article category" className={inputClass} value={articleForm.categoryId} onChange={(event) => setArticleForm((prev) => ({ ...prev, categoryId: event.target.value }))}><option value="">Select category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
                        <textarea aria-label="Short description" title="Short description" className={textareaClass} placeholder="Short description" value={articleForm.shortDescription} onChange={(event) => setArticleForm((prev) => ({ ...prev, shortDescription: event.target.value }))} />
                        <textarea aria-label="Full article content" title="Full article content" className={`${textareaClass} min-h-[220px]`} placeholder="Full article content" value={articleForm.fullContent} onChange={(event) => setArticleForm((prev) => ({ ...prev, fullContent: event.target.value }))} />
                        <input aria-label="Tags" title="Tags, comma separated" className={inputClass} placeholder="Tags, comma separated" value={articleForm.tagsInput} onChange={(event) => setArticleForm((prev) => ({ ...prev, tagsInput: event.target.value }))} />
                        <div className="flex flex-wrap gap-6 border-y border-slate-100 py-4 dark:border-slate-800">
                            <ModernToggle
                                label="Published"
                                checked={articleForm.isPublished}
                                onChange={(isPublished) => setArticleForm((prev) => ({ ...prev, isPublished }))}
                                size="sm"
                            />
                            <ModernToggle
                                label="Featured"
                                checked={articleForm.isFeatured}
                                onChange={(isFeatured) => setArticleForm((prev) => ({ ...prev, isFeatured }))}
                                size="sm"
                            />
                        </div>
                        <button type="button" onClick={saveArticle} disabled={!articleForm.title.trim() || !articleForm.categoryId || !articleForm.shortDescription.trim() || !articleForm.fullContent.trim()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{editingArticleId ? 'Update Article' : 'Create Article'}</button>
                    </div>
                    {articlesQuery.isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading articles...</div>}
                    {articles.map((article: AdminHelpArticle) => (
                        <article key={article._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-slate-900 dark:text-white">{article.title}</h3><span className={`rounded-full px-2 py-1 text-xs font-medium ${article.isPublished ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{article.isPublished ? 'Published' : 'Draft'}</span></div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">/{article.slug} • {categories.find((category) => category._id === categoryIdOf(article))?.name || 'Uncategorized'}</p>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{article.shortDescription}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => { setEditingArticleId(article._id); setArticleForm({ title: article.title, categoryId: categoryIdOf(article), shortDescription: article.shortDescription, fullContent: article.fullContent, tagsInput: Array.isArray(article.tags) ? article.tags.join(', ') : '', isPublished: article.isPublished, isFeatured: article.isFeatured }); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                                    <button type="button" onClick={async () => { try { article.isPublished ? await unpublishAdminHelpArticle(article._id) : await publishAdminHelpArticle(article._id); toast.success(article.isPublished ? 'Article unpublished' : 'Article published'); await refresh(); } catch (error: any) { toast.error(error?.response?.data?.message || 'Failed to change publish state'); } }} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30">{article.isPublished ? 'Unpublish' : 'Publish'}</button>
                                    <button type="button" onClick={async () => { try { await deleteAdminHelpArticle(article._id); toast.success('Article deleted'); await refresh(); resetArticle(); } catch (error: any) { toast.error(error?.response?.data?.message || 'Failed to delete article'); } }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                                </div>
                            </div>
                        </article>
                    ))}
                </section>
            </div>
        </AdminGuardShell>
    );
}
