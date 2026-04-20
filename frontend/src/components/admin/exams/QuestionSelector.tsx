import { useState } from 'react';
import { QuestionSelectorProvider } from './QuestionSelectorContext';
import SelectorLeftPanel from './SelectorLeftPanel';
import SelectorRightPanel from './SelectorRightPanel';

interface QuestionSelectorProps {
    /**
     * When true, the component skips rendering its own QuestionSelectorProvider.
     * Use this when a parent component already wraps the tree in a provider
     * and needs direct access to the selector state (e.g. ExamFormPage).
     */
    skipProvider?: boolean;
}

/**
 * QuestionSelector — split-panel question picker for exam creation.
 *
 * Desktop (≥ 768 px): left panel (55%) + right panel (45%) side-by-side.
 * Mobile  (< 768 px): tabbed interface — "Available" / "Selected" tabs.
 */
export default function QuestionSelector({ skipProvider = false }: QuestionSelectorProps) {
    const [activeTab, setActiveTab] = useState<'available' | 'selected'>('available');

    const content = (
        <>
            {/* ── Desktop: split-panel ── */}
            <div className="hidden md:grid md:grid-cols-[55fr_45fr] h-full border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
                <div className="border-r border-slate-200 dark:border-slate-700/60 overflow-hidden">
                    <SelectorLeftPanel />
                </div>
                <div className="overflow-hidden">
                    <SelectorRightPanel />
                </div>
            </div>

            {/* ── Mobile: tabbed interface ── */}
            <div className="md:hidden flex flex-col h-full border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
                {/* Tab bar */}
                <div
                    className="flex border-b border-slate-200 dark:border-slate-700/60"
                    role="tablist"
                    aria-label="Question selector tabs"
                >
                    <button
                        type="button"
                        role="tab"
                        id="tab-available"
                        aria-selected={activeTab === 'available'}
                        aria-controls="panel-available"
                        onClick={() => setActiveTab('available')}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'available'
                            ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        Available
                    </button>
                    <button
                        type="button"
                        role="tab"
                        id="tab-selected"
                        aria-selected={activeTab === 'selected'}
                        aria-controls="panel-selected"
                        onClick={() => setActiveTab('selected')}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'selected'
                            ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        Selected
                    </button>
                </div>

                {/* Tab panels */}
                <div
                    id="panel-available"
                    role="tabpanel"
                    aria-labelledby="tab-available"
                    className={`flex-1 overflow-hidden ${activeTab === 'available' ? '' : 'hidden'}`}
                >
                    <SelectorLeftPanel />
                </div>
                <div
                    id="panel-selected"
                    role="tabpanel"
                    aria-labelledby="tab-selected"
                    className={`flex-1 overflow-hidden ${activeTab === 'selected' ? '' : 'hidden'}`}
                >
                    <SelectorRightPanel />
                </div>
            </div>
        </>
    );

    if (skipProvider) return content;
    return <QuestionSelectorProvider>{content}</QuestionSelectorProvider>;
}
