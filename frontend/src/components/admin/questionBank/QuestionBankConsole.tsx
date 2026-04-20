import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import QuestionBankListPanel from './QuestionBankListPanel';
import QuestionBankFormPanel from './QuestionBankFormPanel';
import QuestionBankImportPanel from './QuestionBankImportPanel';
import QuestionBankSetsPanel from './QuestionBankSetsPanel';
import QuestionBankAnalyticsPanel from './QuestionBankAnalyticsPanel';
import QuestionBankSettingsPanel from './QuestionBankSettingsPanel';

type QBTab = 'list' | 'new' | 'edit' | 'import' | 'sets' | 'analytics' | 'archive' | 'settings';

function inferTab(pathname: string): QBTab {
    if (pathname.includes('/new')) return 'new';
    if (pathname.includes('/edit')) return 'edit';
    if (pathname.includes('/import')) return 'import';
    if (pathname.includes('/sets')) return 'sets';
    if (pathname.includes('/analytics')) return 'analytics';
    if (pathname.includes('/archive')) return 'archive';
    if (pathname.includes('/settings')) return 'settings';
    return 'list';
}

const tabs: { key: QBTab; label: string; path: string }[] = [
    { key: 'list', label: 'All Questions', path: ADMIN_PATHS.questionBank },
    { key: 'new', label: 'Add New', path: ADMIN_PATHS.questionBankNew },
    { key: 'import', label: 'Import', path: ADMIN_PATHS.questionBankImport },
    { key: 'sets', label: 'Sets', path: ADMIN_PATHS.questionBankSets },
    { key: 'analytics', label: 'Analytics', path: ADMIN_PATHS.questionBankAnalytics },
    { key: 'archive', label: 'Archive', path: ADMIN_PATHS.questionBankArchive },
    { key: 'settings', label: 'Settings', path: ADMIN_PATHS.questionBankSettings },
];

export default function QuestionBankConsole() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentTab = inferTab(location.pathname);
    const [editId, setEditId] = useState<string | null>(null);

    function goTo(tab: QBTab, id?: string) {
        if (tab === 'edit' && id) {
            setEditId(id);
            navigate(ADMIN_PATHS.questionBankEdit);
        } else {
            setEditId(null);
            const t = tabs.find((t) => t.key === tab);
            if (t) navigate(t.path);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Tab bar */}
            <div className="flex flex-wrap gap-1.5 md:gap-2 p-1 md:p-1.5 bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-indigo-500/10 rounded-xl md:rounded-2xl overflow-x-auto scrollbar-hide">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => goTo(t.key)}
                        className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${currentTab === t.key
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Active panel */}
            {currentTab === 'list' && <QuestionBankListPanel onEdit={(id) => goTo('edit', id)} />}
            {currentTab === 'archive' && <QuestionBankListPanel onEdit={(id) => goTo('edit', id)} archiveMode />}
            {(currentTab === 'new' || currentTab === 'edit') && (
                <QuestionBankFormPanel
                    editId={currentTab === 'edit' ? editId : null}
                    onDone={() => goTo('list')}
                />
            )}
            {currentTab === 'import' && <QuestionBankImportPanel />}
            {currentTab === 'sets' && <QuestionBankSetsPanel />}
            {currentTab === 'analytics' && <QuestionBankAnalyticsPanel />}
            {currentTab === 'settings' && <QuestionBankSettingsPanel />}
        </div>
    );
}
