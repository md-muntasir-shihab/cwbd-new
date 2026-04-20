import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import UniversityBrowseShell from '../components/university/UniversityBrowseShell';
import PageHeroBanner from '../components/common/PageHeroBanner';
import { usePageHeroSettings } from '../hooks/usePageHeroSettings';

export default function UniversitiesPage() {
    const hero = usePageHeroSettings('universities');
    const [searchParams, setSearchParams] = useSearchParams();
    const [heroSearch, setHeroSearch] = useState(searchParams.get('q') || '');

    const handleHeroSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = heroSearch.trim();
        if (q) {
            setSearchParams((prev) => { prev.set('q', q); return prev; }, { replace: true });
        }
    };

    return (
        <>
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
                >
                    <form onSubmit={handleHeroSearch} className="w-full max-w-xl mx-auto mt-2">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50 group-focus-within:text-white/80 transition-colors" />
                            <input
                                type="text"
                                value={heroSearch}
                                onChange={(e) => setHeroSearch(e.target.value)}
                                placeholder="Search universities by name, category..."
                                className="w-full rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md py-3.5 pl-12 pr-4 text-sm text-white placeholder-white/50 outline-none transition-all focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/10 shadow-lg shadow-black/10"
                                autoComplete="off"
                            />
                        </div>
                    </form>
                </PageHeroBanner>
            )}
            <UniversityBrowseShell cardVariant="classic" />
        </>
    );
}
