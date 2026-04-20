import { type ComponentType, type FormEvent, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import {
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Facebook,
    Instagram,
    Link2,
    Mail,
    MessageCircle,
    MessagesSquare,
    Phone,
    Send,
    ShieldCheck,
} from "lucide-react";
import { usePublicContactSettings, useSubmitContactMessage } from "../hooks/useContactQueries";
import PageHeroBanner from '../components/common/PageHeroBanner';
import { usePageHeroSettings } from '../hooks/usePageHeroSettings';
import { mockPublicContactSettings } from "../mocks/contactMock";
import type { ContactMessagePayload, PublicSettingsContactResponse } from "../types/contact";

const isMockMode = String(import.meta.env.VITE_USE_MOCK_API || "false").toLowerCase() === "true";

const EMPTY_SETTINGS: PublicSettingsContactResponse = {
    siteName: "CampusWay",
    logoUrl: "",
    siteDescription: "CampusWay support is available for admission and exam guidance.",
    contactLinks: {},
    footer: {},
};

type ContactFormState = {
    name: string;
    phone: string;
    email: string;
    subject: string;
    message: string;
    consent: boolean;
};

type ContactFormErrors = Partial<Record<keyof ContactFormState, string>>;

type QuickCard = {
    id: string;
    title: string;
    subtitle: string;
    value: string;
    href?: string;
    icon: ComponentType<{ className?: string }>;
};

type SocialGridItem = {
    id: string;
    name: string;
    icon?: ComponentType<{ className?: string }>;
    iconUrl?: string;
    url: string;
    enabled: boolean;
};

const formInitialState: ContactFormState = {
    name: "",
    phone: "",
    email: "",
    subject: "",
    message: "",
    consent: false,
};

const socialPlatformDefs: Array<{
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    getUrl: (settings: PublicSettingsContactResponse) => string;
}> = [
        {
            id: "facebook",
            label: "Facebook",
            icon: Facebook,
            getUrl: (settings) => settings.contactLinks.facebookUrl || "",
        },
        {
            id: "telegram",
            label: "Telegram",
            icon: Send,
            getUrl: (settings) => settings.contactLinks.telegramUrl || "",
        },
        {
            id: "instagram",
            label: "Instagram",
            icon: Instagram,
            getUrl: (settings) => settings.contactLinks.instagramUrl || "",
        },
        {
            id: "whatsapp",
            label: "WhatsApp",
            icon: MessageCircle,
            getUrl: (settings) => settings.contactLinks.whatsappUrl || "",
        },
        {
            id: "messenger",
            label: "Messenger",
            icon: MessagesSquare,
            getUrl: (settings) => settings.contactLinks.messengerUrl || "",
        },
    ];

function sectionMotion(index: number) {
    return {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, delay: index * 0.04, ease: "easeOut" },
    } as const;
}

function cleanHref(raw: string): string {
    return raw.trim();
}

function buildPhoneHref(phone?: string): string {
    const value = (phone || "").trim();
    if (!value) return "";
    const normalized = value.replace(/\s+/g, "");
    return `tel:${normalized}`;
}

function buildEmailHref(email?: string): string {
    const value = (email || "").trim();
    if (!value) return "";
    return `mailto:${value}`;
}

function validateForm(form: ContactFormState): ContactFormErrors {
    const errors: ContactFormErrors = {};
    if (!form.name.trim()) errors.name = "Full name is required.";
    if (!form.phone.trim()) errors.phone = "Phone is required.";
    if (!form.email.trim()) {
        errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        errors.email = "Enter a valid email address.";
    }
    if (!form.subject.trim()) errors.subject = "Subject is required.";
    if (!form.message.trim()) {
        errors.message = "Message is required.";
    } else if (form.message.trim().length < 20) {
        errors.message = "Message must be at least 20 characters.";
    }
    if (!form.consent) errors.consent = "Consent is required.";
    return errors;
}

function topicToSubject(topic: string): string {
    if (!topic) return "";
    const normalized = topic.trim().toLowerCase();
    if (normalized === "password-reset") return "Password reset help";
    return normalized
        .split(/[-_\s]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export default function ContactPage() {
    const [searchParams] = useSearchParams();
    const hero = usePageHeroSettings('contact');
    const settingsQuery = usePublicContactSettings();
    const submitMutation = useSubmitContactMessage();
    const [form, setForm] = useState<ContactFormState>(formInitialState);
    const [errors, setErrors] = useState<ContactFormErrors>({});
    const [isDesktop, setIsDesktop] = useState(false);
    const [submitResult, setSubmitResult] = useState<{ ticketId?: string } | null>(null);
    const topic = (searchParams.get("topic") || "").trim().toLowerCase();
    const isPasswordResetTopic = topic === "password-reset";

    useEffect(() => {
        const media = window.matchMedia("(min-width: 1024px)");
        const sync = () => setIsDesktop(media.matches);
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);

    useEffect(() => {
        const prefilledEmail = searchParams.get("email")?.trim() || "";
        const prefilledPhone = searchParams.get("phone")?.trim() || "";
        const prefilledSubject = searchParams.get("subject")?.trim() || topicToSubject(searchParams.get("topic") || "");
        const prefilledMessage = searchParams.get("message")?.trim() || (
            (searchParams.get("topic") || "").trim().toLowerCase() === "password-reset"
                ? `I need help resetting the password for ${prefilledEmail || "my student account"}.`
                : ""
        );

        if (!prefilledEmail && !prefilledPhone && !prefilledSubject && !prefilledMessage) return;

        setForm((prev) => ({
            ...prev,
            email: prev.email || prefilledEmail,
            phone: prev.phone || prefilledPhone,
            subject: prev.subject || prefilledSubject,
            message: prev.message || prefilledMessage,
        }));
    }, [searchParams]);

    const settings = settingsQuery.data || (isMockMode ? mockPublicContactSettings : EMPTY_SETTINGS);

    const quickCards = useMemo<QuickCard[]>(() => {
        const whatsappUrl = cleanHref(settings.contactLinks.whatsappUrl || "");
        const messengerUrl = cleanHref(settings.contactLinks.messengerUrl || "");
        const phone = settings.contactLinks.phone || "";
        const email = settings.contactLinks.email || "";
        return [
            {
                id: "whatsapp",
                title: "WhatsApp",
                subtitle: "Fast chat support",
                value: whatsappUrl || "Not Available",
                href: whatsappUrl || undefined,
                icon: MessageCircle,
            },
            {
                id: "messenger",
                title: "Messenger",
                subtitle: "Direct inbox support",
                value: messengerUrl || "Not Available",
                href: messengerUrl || undefined,
                icon: MessagesSquare,
            },
            {
                id: "phone",
                title: "Call Now",
                subtitle: "Speak with support",
                value: phone || "Not Available",
                href: buildPhoneHref(phone) || undefined,
                icon: Phone,
            },
            {
                id: "email",
                title: "Email",
                subtitle: "Detailed queries",
                value: email || "Not Available",
                href: buildEmailHref(email) || undefined,
                icon: Mail,
            },
        ];
    }, [settings.contactLinks.email, settings.contactLinks.messengerUrl, settings.contactLinks.phone, settings.contactLinks.whatsappUrl]);

    const socialItems = useMemo<SocialGridItem[]>(() => {
        const baseItems = socialPlatformDefs.map((item) => {
            const url = cleanHref(item.getUrl(settings));
            return {
                id: item.id,
                name: item.label,
                icon: item.icon,
                url,
                enabled: Boolean(url),
            } satisfies SocialGridItem;
        });

        const customItems = (settings.contactLinks.customLinks || []).map((item, index) => {
            const url = cleanHref(item.url || "");
            return {
                id: `custom-${index}-${item.name}`,
                name: item.name || "Custom Link",
                iconUrl: item.iconUrl || "",
                url,
                enabled: item.enabled && Boolean(url),
            } satisfies SocialGridItem;
        });

        return [...baseItems, ...customItems];
    }, [settings]);

    const footerNote =
        settings.footer?.shortNote?.trim() || "By contacting us, you agree to CampusWay About, Terms, and Privacy pages.";

    const onFieldChange = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitResult(null);

        const validationErrors = validateForm(form);
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        const payload: ContactMessagePayload = {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            subject: form.subject.trim(),
            message: form.message.trim(),
            consent: form.consent,
            ...(topic ? { topic } : {}),
        };

        try {
            const response = await submitMutation.mutateAsync(payload);
            setSubmitResult({ ticketId: response.ticketId });
            setForm(formInitialState);
            toast.success("Message sent successfully.");
        } catch (error: unknown) {
            const message = isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message || "Failed to send message. Please retry."
                : error instanceof Error
                    ? error.message
                    : "Failed to send message. Please retry.";
            toast.error(message);
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
                    primaryCTA={hero.primaryCTA}
                    secondaryCTA={hero.secondaryCTA}
                />
            )}
            <div className="section-container space-y-5 py-4 sm:space-y-6 sm:py-6 lg:space-y-8 lg:py-8">
                <motion.section {...sectionMotion(0)} className="card-flat p-5 sm:p-6">
                    <p className="mb-2 inline-flex items-center rounded-full border border-card-border bg-surface2/70 px-3 py-1 text-xs font-semibold text-primary dark:bg-dark-surface/70">
                        Contact CampusWay
                    </p>
                    <h1 className="text-2xl font-bold text-text dark:text-dark-text sm:text-3xl">We are here to help you</h1>
                    <p className="mt-2 max-w-2xl text-sm text-text-muted dark:text-dark-text/70 sm:text-base">
                        {settings.siteDescription || "Reach us for admission, exam, and account support."}
                    </p>
                    {isPasswordResetTopic ? (
                        <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-left">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Password reset request for admin support</p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                This form is prefilled for account recovery. Submit it with the student email and phone number so the admin team can verify ownership before helping with password access.
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success dark:bg-success/15">
                        <ShieldCheck className="h-4 w-4" />
                        Average response time: within 24 hours.
                    </div>
                    {settingsQuery.isError && !isMockMode ? (
                        <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                            <AlertCircle className="h-4 w-4" />
                            Live contact settings are unavailable.
                            <button
                                type="button"
                                className="rounded-lg border border-warning/40 px-2 py-1 font-semibold"
                                onClick={() => settingsQuery.refetch()}
                            >
                                Retry
                            </button>
                        </div>
                    ) : null}
                </motion.section>

                <motion.section {...sectionMotion(1)} className="space-y-3">
                    <h2 className="text-xl font-bold text-text dark:text-dark-text sm:text-2xl">Quick Contact</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {quickCards.map((card) => {
                            const isAvailable = Boolean(card.href);
                            const content = (
                                <motion.div
                                    whileHover={isDesktop && isAvailable ? { y: -3 } : undefined}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className={`card-flat flex h-full flex-col gap-3 p-4 ${isAvailable ? "cursor-pointer" : "opacity-70"}`}
                                >
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <card.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-text dark:text-dark-text">{card.title}</p>
                                        <p className="mt-0.5 text-xs text-text-muted dark:text-dark-text/65">{card.subtitle}</p>
                                    </div>
                                    <p className={`text-sm font-medium ${isAvailable ? "text-text dark:text-dark-text" : "text-text-muted dark:text-dark-text/55"}`}>
                                        {card.value}
                                    </p>
                                    <div className="mt-auto">
                                        <span
                                            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-semibold ${isAvailable
                                                ? "bg-primary/10 text-primary"
                                                : "border border-card-border text-text-muted dark:text-dark-text/55"
                                                }`}
                                        >
                                            {isAvailable ? "Open" : "Not Available"}
                                        </span>
                                    </div>
                                </motion.div>
                            );

                            if (!isAvailable) return <div key={card.id}>{content}</div>;

                            return (
                                <a
                                    key={card.id}
                                    href={card.href}
                                    target={card.id === "phone" || card.id === "email" ? undefined : "_blank"}
                                    rel={card.id === "phone" || card.id === "email" ? undefined : "noopener noreferrer"}
                                    className="block h-full"
                                >
                                    {content}
                                </a>
                            );
                        })}
                    </div>
                </motion.section>

                <motion.section {...sectionMotion(2)} className="space-y-3">
                    <h2 className="text-xl font-bold text-text dark:text-dark-text sm:text-2xl">Social Links</h2>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {socialItems.filter((item) => item.enabled).map((item) => {
                            const isEnabled = item.enabled;
                            return (
                                <div key={item.id} className="card-flat p-3">
                                    {isEnabled ? (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex min-h-[82px] flex-col items-start justify-between gap-2"
                                        >
                                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                {item.iconUrl ? (
                                                    <img src={item.iconUrl} alt={item.name} className="h-5 w-5 object-contain" />
                                                ) : item.icon ? (
                                                    <item.icon className="h-5 w-5" />
                                                ) : (
                                                    <Link2 className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-text dark:text-dark-text">{item.name}</p>
                                                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary">
                                                    Open <ExternalLink className="h-3 w-3" />
                                                </p>
                                            </div>
                                        </a>
                                    ) : (
                                        <div className="flex min-h-[82px] flex-col items-start justify-between gap-2 opacity-70">
                                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-text-muted dark:bg-dark-surface dark:text-dark-text/60">
                                                {item.iconUrl ? (
                                                    <img src={item.iconUrl} alt={item.name} className="h-5 w-5 object-contain" />
                                                ) : item.icon ? (
                                                    <item.icon className="h-5 w-5" />
                                                ) : (
                                                    <Link2 className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-text dark:text-dark-text">{item.name}</p>
                                                <p className="mt-0.5 text-xs text-text-muted dark:text-dark-text/55">Not Available</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.section>

                <motion.section {...sectionMotion(3)} className="card-flat p-5 sm:p-6">
                    <h2 className="text-xl font-bold text-text dark:text-dark-text sm:text-2xl">Contact Form</h2>
                    <p className="mt-1 text-sm text-text-muted dark:text-dark-text/65">
                        Share details clearly so our team can respond faster.
                    </p>

                    <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit}>
                        {submitResult ? (
                            <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                                <p className="inline-flex items-center gap-2 font-semibold">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Message sent.
                                </p>
                                {submitResult.ticketId ? <p className="mt-1 text-xs">Ticket ID: {submitResult.ticketId}</p> : null}
                            </div>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <div>
                                <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-text dark:text-dark-text">
                                    Full Name <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="contact-name"
                                    value={form.name}
                                    onChange={(event) => onFieldChange("name", event.target.value)}
                                    className={`input-field ${errors.name ? "border-danger" : ""}`}
                                    placeholder="Your full name"
                                    autoComplete="name"
                                />
                                {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name}</p> : null}
                            </div>
                            <div>
                                <label htmlFor="contact-phone" className="mb-1 block text-sm font-medium text-text dark:text-dark-text">
                                    Phone <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="contact-phone"
                                    value={form.phone}
                                    onChange={(event) => onFieldChange("phone", event.target.value)}
                                    className={`input-field ${errors.phone ? "border-danger" : ""}`}
                                    placeholder="+8801XXXXXXXXX"
                                    autoComplete="tel"
                                />
                                {errors.phone ? <p className="mt-1 text-xs text-danger">{errors.phone}</p> : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <div>
                                <label htmlFor="contact-email" className="mb-1 block text-sm font-medium text-text dark:text-dark-text">
                                    Email <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="contact-email"
                                    value={form.email}
                                    onChange={(event) => onFieldChange("email", event.target.value)}
                                    className={`input-field ${errors.email ? "border-danger" : ""}`}
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                />
                                {errors.email ? <p className="mt-1 text-xs text-danger">{errors.email}</p> : null}
                            </div>
                            <div>
                                <label htmlFor="contact-subject" className="mb-1 block text-sm font-medium text-text dark:text-dark-text">
                                    Subject <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="contact-subject"
                                    value={form.subject}
                                    onChange={(event) => onFieldChange("subject", event.target.value)}
                                    className={`input-field ${errors.subject ? "border-danger" : ""}`}
                                    placeholder="What do you need help with?"
                                />
                                {errors.subject ? <p className="mt-1 text-xs text-danger">{errors.subject}</p> : null}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="contact-message" className="mb-1 block text-sm font-medium text-text dark:text-dark-text">
                                Message <span className="text-danger">*</span>
                            </label>
                            <textarea
                                id="contact-message"
                                value={form.message}
                                onChange={(event) => onFieldChange("message", event.target.value)}
                                className={`input-field min-h-[140px] resize-y ${errors.message ? "border-danger" : ""}`}
                                placeholder="Write your message in at least 20 characters."
                            />
                            <div className="mt-1 flex items-center justify-between">
                                {errors.message ? <p className="text-xs text-danger">{errors.message}</p> : <span className="text-xs text-text-muted dark:text-dark-text/55">Minimum 20 characters</span>}
                                <span className="text-xs text-text-muted dark:text-dark-text/55">{form.message.trim().length} chars</span>
                            </div>
                        </div>

                        <div>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-text dark:text-dark-text">
                                <input
                                    type="checkbox"
                                    checked={form.consent}
                                    onChange={(event) => onFieldChange("consent", event.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded accent-primary"
                                />
                                <span>I agree to be contacted.</span>
                            </label>
                            {errors.consent ? (
                                <p className="mt-1 inline-flex items-center gap-1 text-xs text-danger">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {errors.consent}
                                </p>
                            ) : null}
                        </div>

                        <button type="submit" className="btn-primary w-full" disabled={submitMutation.isPending}>
                            {submitMutation.isPending ? (
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                                    Sending...
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-2">
                                    <Send className="h-4 w-4" />
                                    Submit Message
                                </span>
                            )}
                        </button>
                    </form>
                </motion.section>

                <motion.section {...sectionMotion(4)} className="card-flat p-5 sm:p-6">
                    <h2 className="text-xl font-bold text-text dark:text-dark-text sm:text-2xl">Support Tickets</h2>
                    <p className="mt-1 text-sm text-text-muted dark:text-dark-text/65">
                        Need tracked follow-up? Use Support Center preview.
                    </p>
                    <div className="mt-4">
                        <Link to="/support" className="btn-secondary">
                            Open Support Center Preview
                        </Link>
                    </div>
                </motion.section>

                <motion.section {...sectionMotion(5)} className="pb-2 text-center">
                    <p className="text-sm text-text-muted dark:text-dark-text/65">{footerNote}</p>
                    <p className="mt-1 text-xs text-text-muted dark:text-dark-text/55">
                        <Link to="/about" className="hover:text-primary">
                            About
                        </Link>{" "}
                        ·{" "}
                        <Link to="/terms" className="hover:text-primary">
                            Terms
                        </Link>{" "}
                        ·{" "}
                        <Link to="/privacy" className="hover:text-primary">
                            Privacy
                        </Link>
                    </p>
                </motion.section>
            </div>
        </>
    );
}
