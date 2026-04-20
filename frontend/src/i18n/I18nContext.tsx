import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import enCommon from './en/common.json';
import enQuestionBank from './en/questionBank.json';
import enExam from './en/exam.json';
import bnCommon from './bn/common.json';
import bnQuestionBank from './bn/questionBank.json';
import bnExam from './bn/exam.json';

export type Language = 'en' | 'bn';

const STORAGE_KEY = 'cw_admin_language';

type TranslationMap = Record<string, Record<string, string>>;

function flattenTranslations(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(result, flattenTranslations(value as Record<string, unknown>, fullKey));
        } else {
            result[fullKey] = String(value);
        }
    }
    return result;
}

function mergeTranslationSources(...sources: Record<string, unknown>[]): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const source of sources) {
        Object.assign(merged, flattenTranslations(source));
    }
    return merged;
}

const translations: Record<Language, Record<string, string>> = {
    en: mergeTranslationSources(enCommon, enQuestionBank, enExam),
    bn: mergeTranslationSources(bnCommon, bnQuestionBank, bnExam),
};

interface I18nContextValue {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getStoredLanguage(): Language {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'bn') return stored;
    } catch {
        // localStorage unavailable
    }
    return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(getStoredLanguage);

    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            // localStorage unavailable
        }
    }, []);

    const t = useCallback(
        (key: string, params?: Record<string, string | number>): string => {
            let value = translations[language]?.[key] ?? translations.en?.[key] ?? key;
            if (params) {
                for (const [paramKey, paramValue] of Object.entries(params)) {
                    value = value.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(paramValue));
                }
            }
            return value;
        },
        [language],
    );

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return ctx;
}

export { STORAGE_KEY };
