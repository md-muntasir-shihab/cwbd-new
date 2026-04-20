/**
 * AdminTabNav
 * -----------
 * Reusable horizontal tab navigation bar used across admin sections
 * to replace sidebar sub-menus with a Campaign Hub-style tab design.
 */

import { Link, useLocation } from 'react-router-dom';
import type { ComponentType } from 'react';

export interface AdminTabItem {
    key: string;
    label: string;
    path: string;
    icon?: ComponentType<{ className?: string }>;
    /** If true, only match exact path (not prefix) */
    exact?: boolean;
}

interface AdminTabNavProps {
    tabs: AdminTabItem[];
    className?: string;
}

function isTabActive(tab: AdminTabItem, pathname: string, search: string): boolean {
    const fullPath = `${pathname}${search}`;
    if (tab.exact) return fullPath === tab.path || pathname === tab.path;
    // Handle query-param based paths (e.g. ?tab=external)
    if (tab.path.includes('?')) return fullPath === tab.path;
    return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
}

export default function AdminTabNav({ tabs, className = '' }: AdminTabNavProps) {
    const location = useLocation();

    return (
        <div className={`mb-5 -mx-1 ${className}`}>
            <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/60 p-1 dark:border-slate-800/80 dark:bg-slate-900/60">
                {tabs.map((tab) => {
                    const active = isTabActive(tab, location.pathname, location.search);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.key}
                            to={tab.path}
                            className={`
                                inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150
                                ${active
                                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm shadow-indigo-500/20'
                                    : 'text-slate-600 hover:bg-white/80 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-indigo-300'
                                }
                            `}
                        >
                            {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                            <span>{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
