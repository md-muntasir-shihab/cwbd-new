import { Languages } from 'lucide-react';
import { useI18n, type Language } from '../../i18n';

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'bn', label: 'বা' },
];

export default function LanguageToggle() {
    const { language, setLanguage } = useI18n();

    return (
        <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            title={language === 'en' ? 'বাংলায় পরিবর্তন করুন' : 'Switch to English'}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5"
        >
            <Languages className="h-3.5 w-3.5" />
            <span>{language === 'en' ? 'EN' : 'বা'}</span>
        </button>
    );
}
