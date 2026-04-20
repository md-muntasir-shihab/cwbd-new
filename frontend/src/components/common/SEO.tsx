import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { getPublicSettings } from '../../services/api';

interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
}

export function SEO({
    title,
    description,
    keywords = 'CampusWay, University Admissions, Admission Test, Bangladesh Universities, Mock Test',
    image,
    url = typeof window !== 'undefined' ? window.location.href : 'https://campusway.net',
    type,
    siteName,
}: SEOProps) {
    const { data: siteSettings } = useQuery({
        queryKey: ['public-settings'],
        queryFn: async () => (await getPublicSettings()).data,
        staleTime: 5 * 60 * 1000,
    });

    const sp = (siteSettings as any)?.socialPreview;
    const resolvedSiteName = siteName || siteSettings?.websiteName || 'CampusWay';
    const resolvedDescription = description || sp?.ogDescription || siteSettings?.metaDescription || 'CampusWay - The ultimate platform for university admissions and career guidance in Bangladesh.';
    const resolvedImage = image || sp?.ogImageUrl || '/cw-banner.png';
    const resolvedType = type || sp?.ogType || 'website';
    const resolvedTwitterCard = sp?.twitterCard || 'summary_large_image';
    const resolvedTwitterSite = sp?.twitterSite || '';

    const pageTitle = title
        ? `${title} | ${resolvedSiteName}`
        : (sp?.ogTitle || siteSettings?.metaTitle || resolvedSiteName);

    return (
        <Helmet>
            <title>{pageTitle}</title>
            <meta name="description" content={resolvedDescription} />
            <meta name="keywords" content={keywords} />

            {/* Open Graph */}
            <meta property="og:type" content={resolvedType} />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={resolvedDescription} />
            <meta property="og:image" content={resolvedImage} />
            <meta property="og:site_name" content={resolvedSiteName} />

            {/* Twitter */}
            <meta name="twitter:card" content={resolvedTwitterCard} />
            <meta name="twitter:url" content={url} />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={resolvedDescription} />
            <meta name="twitter:image" content={resolvedImage} />
            {resolvedTwitterSite && <meta name="twitter:site" content={resolvedTwitterSite} />}
        </Helmet>
    );
}

export default SEO;
