import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import UniversityBrowseShell from '../components/university/UniversityBrowseShell';
import PageHeroBanner from '../components/common/PageHeroBanner';
import HeroSearchInput from '../components/common/HeroSearchInput';
import { usePageHeroSettings } from '../hooks/usePageHeroSettings';

export default function UniversitiesPage() {
    const hero = usePageHeroSettings('universities');
    const [searchParams, setSearchParams] = useSearchParams();
    const [heroSearch, setHeroSearch] = useState(searchParams.get('q') || '');

    // Sync URL → hero search (one-way: URL is source of truth)
    useEffect(() => {
        const urlQ = searchParams.get('q') || '';
        if (urlQ !== heroSearch) setHeroSearch(urlQ);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Sync hero search → URL with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            const q = heroSearch.trim();
            const currentQ = searchParams.get('q') || '';
            if (q === currentQ) return;
            setSearchParams((prev) => {
                if (q) prev.set('q', q);
                else prev.delete('q');
                return prev;
            }, { replace: true });
        }, 350);
        return () => clearTimeout(timer);
    }, [heroSearch, setSearchParams, searchParams]);

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
                    <HeroSearchInput
                        value={heroSearch}
                        onChange={setHeroSearch}
                        placeholder="বিশ্ববিদ্যালয় খুঁজুন নাম বা ক্যাটাগরি দিয়ে..."
                        className="mt-2"
                    />
                </PageHeroBanner>
            )}
            <UniversityBrowseShell cardVariant="classic" />
        </>
    );
}
