import type {
    ApiAboutStaticPageConfig,
    ApiFounderContactLink,
    ApiFounderProfile,
    ApiStaticFeatureCard,
    ApiStaticPageConfig,
    ApiStaticPageSection,
    StaticPageTone,
    WebsiteStaticPagesConfig,
} from '../services/api';

export const STATIC_PAGE_ICON_OPTIONS = [
    'info',
    'target',
    'globe',
    'heart',
    'graduation-cap',
    'book-open',
    'users',
    'award',
    'file-text',
    'shield',
    'alert-triangle',
    'mail',
    'eye',
    'database',
    'lock',
    'bell',
] as const;

export const STATIC_PAGE_TONE_OPTIONS: StaticPageTone[] = ['neutral', 'info', 'success', 'warning', 'accent'];

function createSection(
    order: number,
    title: string,
    body: string,
    iconKey: string,
    tone: StaticPageTone,
    bullets: string[] = [],
): ApiStaticPageSection {
    return {
        title,
        body,
        bullets,
        iconKey,
        tone,
        enabled: true,
        order,
    };
}

function createFeatureCard(
    order: number,
    title: string,
    description: string,
    iconKey: string,
): ApiStaticFeatureCard {
    return {
        title,
        description,
        iconKey,
        enabled: true,
        order,
    };
}

function createFounder(
    order: number,
    name = '',
    title = '',
    shortBio = '',
    photoUrl = '',
    contactLinks: ApiFounderContactLink[] = [],
): ApiFounderProfile {
    return {
        name,
        title,
        shortBio,
        photoUrl,
        contactLinks,
        enabled: true,
        order,
    };
}

export function createDefaultWebsiteStaticPages(): WebsiteStaticPagesConfig {
    return {
        about: {
            eyebrow: 'CampusWay সম্পর্কে',
            title: 'শিক্ষার্থীদের জন্য একটি সমন্বিত একাডেমিক সহায়ক প্ল্যাটফর্ম',
            subtitle: 'CampusWay হল শিক্ষার্থীদের জন্য একটি সহজ, সুবিধাজনক এবং নির্ভুল প্ল্যাটফর্ম, যাতে তারা শুধুমাত্র পড়াশোনায় মনোযোগ দিতে পারে এবং প্রয়োজনীয় তথ্য সহজেই পায়।',
            lastUpdatedLabel: 'CampusWay Team কর্তৃক পরিচালিত',
            backLinkLabel: 'Back to Home',
            backLinkUrl: '/',
            sections: [
                createSection(
                    1,
                    'আমাদের উদ্দেশ্য',
                    'আমাদের উদ্দেশ্য হল শিক্ষার্থীদের জন্য একটি সহজ, সুবিধাজনক এবং নির্ভুল প্ল্যাটফর্ম তৈরি করা, যাতে তারা শুধুমাত্র পড়াশোনায় মনোযোগ দিতে পারে, প্রয়োজনীয় তথ্য সহজেই পায় এবং বিশ্ববিদ্যালয় ভিত্তিক পরীক্ষায় আত্মবিশ্বাসের সঙ্গে অংশগ্রহণ করতে পারে। CampusWay শিক্ষার্থীদের প্রতিটি পদক্ষেপে সহায়তা করবে, যাতে ভর্তি preparation, পরীক্ষার প্রস্তুতি এবং গুরুত্বপূর্ণ তথ্য সংগ্রহ সবকিছুই সহজ ও ঝামেলামুক্ত হয়।',
                    'target',
                    'info',
                ),
                createSection(
                    2,
                    'কেন CampusWay?',
                    'আমরা জানি, আধুনিক শিক্ষাব্যবস্থায় শিক্ষার্থীদের জন্য সময় সাশ্রয়, তথ্যের সঠিকতা এবং ভর্তি প্রস্তুতিকে সহজ ও ঝামেলামুক্ত করা কতটা গুরুত্বপূর্ণ। এখানে সমস্ত ধরনের একাডেমিক সহায়তা একত্রে পাওয়া যায় – যেমন পরীক্ষার প্রস্তুতি, বিশ্ববিদ্যালয়ের তথ্য, ব্যক্তিগত নোটিফিকেশন এবং ফর্ম পূরণের সেবা।',
                    'heart',
                    'accent',
                ),
            ],
            featureCards: [
                createFeatureCard(1, 'বিশ্ববিদ্যালয় তথ্য', 'বিভিন্ন বিশ্ববিদ্যালয়, তাদের ভর্তি সংক্রান্ত তথ্য ও ডেডলাইন এক জায়গায় ট্র্যাক করুন।', 'graduation-cap'),
                createFeatureCard(2, 'পরীক্ষা প্রস্তুতি', 'মডেল টেস্ট ও অনুশীলন প্রক্রিয়ার মাধ্যমে নিজের ভর্তি প্রস্তুতি আরও মজবুত করুন।', 'book-open'),
                createFeatureCard(3, 'ভর্তি ফর্ম-ফিলআপ', 'ভর্তি ফর্ম পূরণ ও প্রসেসিং এর ঝামেলা থেকে বাঁচতে আমাদের সাহায্য গ্রহণ করুন।', 'file-text'),
                createFeatureCard(4, 'ব্যক্তিগত নোটিফিকেশন', 'ভর্তি সংক্রান্ত যেকোনো গুরুত্বপূর্ণ নোটিফিকেশন ও আপডেট পান খুব সহজেই।', 'bell'),
            ],
            founderProfiles: [],
        },
        terms: {
            eyebrow: 'Legal',
            title: 'শর্তাবলী ও বিস্তারিত',
            subtitle: 'CampusWay সেবাসমূহ ব্যবহার করার পূর্বে এই শর্তাবলী ও নিয়মকানুনগুলো ভালোভাবে পড়ার অনুরোধ করা হচ্ছে।',
            lastUpdatedLabel: 'সর্বশেষ আপডেট: ২১ ফেব্রুয়ারী ২০২৬ | শাসন আইন: গণপ্রজাতন্ত্রী বাংলাদেশ',
            backLinkLabel: 'Back to Home',
            backLinkUrl: '/',
            sections: [
                createSection(1, '1. প্রযোজ্যতা ও সম্মতি', 'এই শর্তাবলী (“Terms”) CampusWay ওয়েবসাইট, অনলাইন প্ল্যাটফর্ম, ফর্ম-ফিলআপ সার্ভিস, সাবস্ক্রিপশন সার্ভিস এবং সংশ্লিষ্ট সকল ডিজিটাল সেবার ক্ষেত্রে প্রযোজ্য।\nপ্ল্যাটফর্ম ব্যবহার, রেজিস্ট্রেশন, ফর্ম জমা বা পেমেন্ট সম্পন্ন করার মাধ্যমে ব্যবহারকারী এই Terms-এ সম্পূর্ণ সম্মতি প্রদান করছেন।\nযদি ব্যবহারকারী এই শর্তাবলীতে সম্মত না হন, তাহলে অনুগ্রহ করে প্ল্যাটফর্ম ব্যবহার থেকে বিরত থাকুন।', 'shield', 'info'),
                createSection(2, '2. সেবার প্রকৃতি', 'CampusWay একটি স্বাধীন তথ্য ও সহায়তামূলক প্ল্যাটফর্ম। আমরা নিম্নলিখিত সেবা প্রদান করতে পারি:\n- অনলাইন ভর্তি ফর্ম-ফিলআপ সহায়তা\n- ভর্তি সংক্রান্ত তথ্য ও নোটিফিকেশন\n- সাবস্ক্রিপশন ভিত্তিক আপডেট সার্ভিস\n- ডকুমেন্ট গাইডলাইন ও প্রসেসিং সহায়তা\n\nগুরুত্বপূর্ণ ঘোষণা: CampusWay কোনো বিশ্ববিদ্যালয় বা শিক্ষা প্রতিষ্ঠানে ভর্তি নিশ্চিত বা গ্যারান্টি প্রদান করে না। ভর্তি সংক্রান্ত চূড়ান্ত সিদ্ধান্ত সংশ্লিষ্ট বিশ্ববিদ্যালয় বা প্রতিষ্ঠানের নিজস্ব নীতিমালা অনুযায়ী গৃহীত হবে।', 'file-text', 'neutral'),
                createSection(3, '3. ব্যবহারকারীর দায়িত্ব', 'ব্যবহারকারী নিম্নলিখিত বিষয়ে সম্মত হচ্ছেন:', 'users', 'warning', ['প্রদত্ত সকল তথ্য সঠিক, পূর্ণাঙ্গ ও হালনাগাদ থাকবে।', 'ভুয়া, বিভ্রান্তিকর বা অন্যের পরিচয় ব্যবহার করা হবে না।', 'পেমেন্ট সংক্রান্ত তথ্য যথাযথভাবে প্রদান করা হবে।', 'চূড়ান্ত সাবমিশনের পূর্বে সমস্ত তথ্য নিজ দায়িত্বে যাচাই করা হবে।', 'ভুল তথ্যের কারণে আবেদন বাতিল, ভর্তি বাতিল বা আর্থিক ক্ষতির জন্য CampusWay কোনোভাবেই দায়ী থাকবে না।']),
                createSection(4, '4. সার্ভিস ফি ও পেমেন্ট নীতি', 'সকল সার্ভিস ফি ওয়েবসাইটে প্রদর্শিত থাকবে। সার্ভিস চার্জ সময়, বাজার পরিস্থিতি, পরিচালন ব্যয় বা নীতিগত পরিবর্তনের কারণে বৃদ্ধি বা হ্রাস পেতে পারে।\nনতুন মূল্য ভবিষ্যৎ অর্ডারের ক্ষেত্রে প্রযোজ্য হবে। পেমেন্ট সম্পন্ন হওয়ার পরই সার্ভিস প্রসেস শুরু হবে।', 'info', 'neutral'),
                createSection(5, '5. রিফান্ড নীতি (Non-Refundable Policy)', 'মূল নীতি: একবার সার্ভিস গ্রহণ করলে প্রদত্ত অর্থ সাধারণত ফেরতযোগ্য নয়।\nরিফান্ডের সিদ্ধান্ত সম্পূর্ণরূপে CampusWay-এর একক বিবেচনায় গৃহীত হবে।', 'alert-triangle', 'warning', ['প্রমাণিত সার্ভিস-অপ্রদান', 'সিস্টেমিক ত্রুটি যার কারণে সার্ভিস সম্পাদন সম্ভব হয়নি']),
                createSection(6, '6. দায়-সীমা', 'আমাদের সর্বোচ্চ দায় সীমাবদ্ধ থাকবে সংশ্লিষ্ট সার্ভিসের প্রদত্ত ফি-এর পরিমাণ পর্যন্ত। CampusWay নিম্নলিখিত ক্ষেত্রে দায়ী থাকবে না:', 'shield', 'neutral', ['পরোক্ষ বা আনুষঙ্গিক ক্ষতি', 'লাভ বা সুযোগের ক্ষতি', 'ডেটা লস', 'ভর্তি বাতিলের ফলে আর্থিক ক্ষতি']),
                createSection(7, '7. ক্ষতিপূরণ সুরক্ষা', 'ব্যবহারকারী সম্মত হচ্ছেন যে, যদি ব্যবহারকারীর প্রদত্ত ভুল তথ্য, অবৈধ কার্যকলাপ, শর্ত লঙ্ঘন বা অপব্যবহারের কারণে CampusWay কোনো আইনি দাবি, ক্ষতি, ব্যয় বা দায়ের সম্মুখীন হয়, তাহলে ব্যবহারকারী CampusWay-কে সম্পূর্ণ দায়মুক্ত রাখবেন এবং প্রযোজ্য ক্ষতিপূরণ প্রদান করবেন। তৃতীয় পক্ষের অভিযোগ বা আইনি পদক্ষেপের ক্ষেত্রেও একই শর্ত প্রযোজ্য হবে, যদি তা ব্যবহারকারীর তথ্য বা কার্যকলাপের কারণে হয়ে থাকে।', 'heart', 'accent'),
                createSection(8, '8. তথ্য প্রক্রিয়াকরণ ক্লজ', 'ব্যবহারকারীর তথ্য শুধুমাত্র নির্দিষ্ট সার্ভিস প্রদানের উদ্দেশ্যে প্রক্রিয়াকৃত হবে। প্রয়োজনে তৃতীয়-পক্ষ (যেমন: পেমেন্ট গেটওয়ে, হোস্টিং, ইমেইল সার্ভিস) ব্যবহার করা হতে পারে। ব্যবহারকারীর তথ্য বিক্রি করা হবে না। আইনগত প্রয়োজন বা সরকারি নির্দেশনার ক্ষেত্রে সংশ্লিষ্ট কর্তৃপক্ষকে তথ্য প্রদান করা হতে পারে।', 'database', 'neutral'),
                createSection(9, '9. তৃতীয়-পক্ষ লিংক ও কন্টেন্ট', 'আমাদের ওয়েবসাইটে বিভিন্ন বিশ্ববিদ্যালয় বা অন্যান্য প্রতিষ্ঠানের ওয়েবসাইটের লিংক থাকতে পারে। এর জন্য CampusWay দায়ী নয়। ব্যবহারকারী স্বীকার করেন যে তৃতীয়-পক্ষ ওয়েবসাইট ব্যবহার সম্পূর্ণরূপে নিজ দায়িত্বে করবেন।', 'globe', 'info', ['কন্টেন্ট', 'ডেটা প্রক্রিয়াকরণ', 'প্রাইভেসি নীতি', 'নিরাপত্তা ব্যবস্থা']),
                createSection(10, '10. নিষিদ্ধ কার্যকলাপ', 'নিম্নলিখিত কার্যকলাপ সম্পূর্ণ নিষিদ্ধ। লঙ্ঘনের ক্ষেত্রে অ্যাকাউন্ট স্থগিত, সার্ভিস বাতিল এবং প্রয়োজন হলে আইনি ব্যবস্থা নেওয়া হবে:', 'lock', 'warning', ['হ্যাকিং বা অননুমোদিত প্রবেশ', 'স্প্যামিং', 'জাল ডকুমেন্ট প্রদান', 'প্রতারণামূলক পেমেন্ট', 'সিস্টেম অপব্যবহার']),
                createSection(11, '11. নিরাপত্তা নীতি', 'আমরা যুক্তিসঙ্গত নিরাপত্তা ব্যবস্থা অনুসরণ করি। তবে, Canva Free Hosting বা অন্যান্য সার্ভারের কারণে নিয়ন্ত্রণ সরাসরি আমাদের হাতে নেই এবং ইন্টারনেট-ভিত্তিক কোনো সিস্টেম শতভাগ নিরাপদ নয়। ব্যবহারকারীও নিজ লগইন তথ্য ও OTP গোপন রাখার জন্য দায়ী থাকবেন। আমরা যা প্রয়োগ করি:', 'lock', 'success', ['SSL সংযোগ ব্যবহার', 'সীমিত অ্যাডমিন অ্যাক্সেস', 'ডেটা মনিটরিং', 'প্রাথমিক নিরাপত্তা ব্যবস্থা']),
                createSection(12, '12. এখতিয়ার ও প্রযোজ্য আইন', 'এই Terms গণপ্রজাতন্ত্রী বাংলাদেশের আইন অনুযায়ী পরিচালিত হবে। যে কোনো বিরোধের ক্ষেত্রে ঢাকা আদালত একচ্ছত্র এখতিয়ারভুক্ত হবে।', 'award', 'neutral'),
                createSection(13, '13. পরিবর্তন', 'CampusWay যেকোনো সময় এই Terms সংশোধন করার অধিকার সংরক্ষণ করে। আপডেট প্রকাশের পর প্ল্যাটফর্ম ব্যবহার অব্যাহত রাখা মানেই সংশোধিত শর্তাবলীতে সম্মতি প্রদান।', 'info', 'neutral'),
                createSection(14, '14. চূড়ান্ত নোট / ব্যবহারকারীর স্বীকৃতি', 'CampusWay-এর সেবা ব্যবহার, ফর্ম জমা বা পেমেন্ট করার মাধ্যমে আপনি স্বীকার করছেন যে আপনি এই Terms & Conditions সম্পূর্ণ পড়েছেন, বুঝেছেন এবং এর সঙ্গে সম্মত হয়েছেন।\nএই Terms & Conditions প্ল্যাটফর্ম ব্যবহার সংক্রান্ত আপনার এবং CampusWay-এর মধ্যে পূর্ণ চুক্তি হিসেবে গণ্য হবে।', 'book-open', 'accent', ['শর্তাবলী লঙ্ঘনের ক্ষেত্রে আপনার সেবা স্থগিত বা বাতিল হতে পারে।', 'CampusWay আপনার তথ্য বা কার্যকলাপ থেকে উদ্ভূত কোনো ক্ষতি বা আর্থিক দায় বহন করবে না।']),
            ],
        },
        privacy: {
            eyebrow: 'Legal',
            title: 'Privacy Policy',
            subtitle: 'This policy explains what information CampusWay collects, why it is used, and how it is protected.',
            lastUpdatedLabel: 'Last updated: March 2026',
            backLinkLabel: 'Back to Home',
            backLinkUrl: '/',
            sections: [
                createSection(1, 'Information We Collect', 'CampusWay may collect account, contact, exam, and device information needed to deliver the platform safely and effectively.', 'eye', 'info', ['Account information such as name, email, and phone.', 'Usage information related to learning activity and support flows.', 'Device and browser data for compatibility and security.']),
                createSection(2, 'How We Use Data', 'We use data to deliver services, personalize learning support, improve the product, and keep the platform secure.', 'database', 'neutral', ['Support admissions, exams, and communication workflows.', 'Generate aggregated analytics and service insights.', 'Protect the platform from misuse and fraud.']),
                createSection(3, 'Security & Retention', 'Reasonable technical and organizational controls are used to protect stored data and limit access based on role and need.', 'lock', 'success', ['Authentication and role-based access controls are enforced.', 'Sensitive data should be accessed only by authorized personnel.']),
                createSection(4, 'Your Rights', 'Users can contact CampusWay to request corrections, discuss account privacy concerns, or ask questions about communication preferences.', 'shield', 'accent', ['You may request correction of inaccurate personal information.', 'You may ask questions about stored communication data.']),
            ],
        },
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = true): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
    if (!Array.isArray(value)) return fallback;
    return value
        .map((item) => asString(item))
        .filter(Boolean);
}

function normalizeSection(value: unknown, fallback: ApiStaticPageSection): ApiStaticPageSection {
    const source = asRecord(value);
    return {
        title: asString(source.title, fallback.title),
        body: asString(source.body, fallback.body),
        bullets: asStringArray(source.bullets, fallback.bullets),
        iconKey: asString(source.iconKey, fallback.iconKey),
        tone: (asString(source.tone, fallback.tone) as StaticPageTone) || fallback.tone,
        enabled: asBoolean(source.enabled, fallback.enabled),
        order: asNumber(source.order, fallback.order),
    };
}

function normalizeFeatureCard(value: unknown, fallback: ApiStaticFeatureCard): ApiStaticFeatureCard {
    const source = asRecord(value);
    return {
        title: asString(source.title, fallback.title),
        description: asString(source.description, fallback.description),
        iconKey: asString(source.iconKey, fallback.iconKey),
        enabled: asBoolean(source.enabled, fallback.enabled),
        order: asNumber(source.order, fallback.order),
    };
}

function normalizeFounderContactLink(value: unknown): ApiFounderContactLink | null {
    const source = asRecord(value);
    const label = asString(source.label);
    const url = asString(source.url);
    if (!label && !url) return null;
    return {
        label: label || 'Link',
        url,
    };
}

function normalizeFounderProfile(value: unknown, fallback: ApiFounderProfile): ApiFounderProfile {
    const source = asRecord(value);
    const nextContactLinks = Array.isArray(source.contactLinks)
        ? source.contactLinks
            .map((item) => normalizeFounderContactLink(item))
            .filter((item): item is ApiFounderContactLink => Boolean(item))
        : fallback.contactLinks;

    return {
        name: asString(source.name, fallback.name),
        title: asString(source.title, fallback.title),
        photoUrl: asString(source.photoUrl, fallback.photoUrl),
        shortBio: asString(source.shortBio, fallback.shortBio),
        contactLinks: nextContactLinks,
        enabled: asBoolean(source.enabled, fallback.enabled),
        order: asNumber(source.order, fallback.order),
    };
}

function normalizeStaticPage(value: unknown, fallback: ApiStaticPageConfig): ApiStaticPageConfig {
    const source = asRecord(value);
    const fallbackSections = fallback.sections || [];
    const sourceSections = Array.isArray(source.sections) ? source.sections : null;
    return {
        eyebrow: asString(source.eyebrow, fallback.eyebrow),
        title: asString(source.title, fallback.title),
        subtitle: asString(source.subtitle, fallback.subtitle),
        lastUpdatedLabel: asString(source.lastUpdatedLabel, fallback.lastUpdatedLabel),
        sections: sourceSections
            ? sourceSections.map((item, index) => normalizeSection(item, fallbackSections[index] || createSection(index + 1, '', '', 'info', 'neutral')))
            : fallbackSections,
        backLinkLabel: asString(source.backLinkLabel, fallback.backLinkLabel),
        backLinkUrl: asString(source.backLinkUrl, fallback.backLinkUrl),
    };
}

function normalizeAboutPage(value: unknown, fallback: ApiAboutStaticPageConfig): ApiAboutStaticPageConfig {
    const source = asRecord(value);
    const normalizedBase = normalizeStaticPage(source, fallback);
    const fallbackFeatureCards = fallback.featureCards || [];
    const fallbackFounderProfiles = fallback.founderProfiles || [];

    return {
        ...normalizedBase,
        featureCards: Array.isArray(source.featureCards)
            ? source.featureCards.map((item, index) => normalizeFeatureCard(item, fallbackFeatureCards[index] || createFeatureCard(index + 1, '', '', 'info')))
            : fallbackFeatureCards,
        founderProfiles: Array.isArray(source.founderProfiles)
            ? source.founderProfiles.map((item, index) => normalizeFounderProfile(item, fallbackFounderProfiles[index] || createFounder(index + 1)))
            : fallbackFounderProfiles,
    };
}

export function mergeWebsiteStaticPages(value?: Partial<WebsiteStaticPagesConfig> | null): WebsiteStaticPagesConfig {
    const defaults = createDefaultWebsiteStaticPages();
    const source = asRecord(value);
    return {
        about: normalizeAboutPage(source.about, defaults.about),
        terms: normalizeStaticPage(source.terms, defaults.terms),
        privacy: normalizeStaticPage(source.privacy, defaults.privacy),
    };
}

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
    return [...items].sort((left, right) => left.order - right.order);
}

