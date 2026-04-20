import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Mail, RefreshCw, Search, Trash2, Inbox, Clock, CheckCircle, MessageSquare, User, Phone, AtSign } from 'lucide-react';
import {
    adminDeleteContactMessage,
    adminGetContactMessages,
    adminUpdateContactMessage,
} from '../../services/api';
import { showConfirmDialog } from '../../lib/appDialog';

type Msg = {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
    isRead?: boolean;
    isReplied?: boolean;
    createdAt?: string;
};

type FilterMode = 'all' | 'unread' | 'replied';

export default function ContactPanel() {
    const [searchParams] = useSearchParams();
    const [messages, setMessages] = useState<Msg[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterMode>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const focusedId = searchParams.get('focus') || '';

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const response = await adminGetContactMessages({});
            setMessages(response.data.messages || []);
        } catch {
            toast.error('Failed to load contact messages');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchMessages(); }, []);

    useEffect(() => {
        if (!focusedId) return;
        const target = messages.find((m) => m._id === focusedId);
        if (!target || target.isRead) return;
        void adminUpdateContactMessage(focusedId, { isRead: true })
            .then(() => setMessages((prev) => prev.map((item) => item._id === focusedId ? { ...item, isRead: true } : item)))
            .catch(() => undefined);
    }, [focusedId, messages]);

    const visibleMessages = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return messages.filter((item) => {
            if (filter === 'unread' && item.isRead) return false;
            if (filter === 'replied' && !item.isReplied) return false;
            if (!needle) return true;
            return `${item.name} ${item.email} ${item.subject} ${item.message} ${item.phone || ''}`.toLowerCase().includes(needle);
        });
    }, [filter, messages, query]);

    const unreadCount = messages.filter(m => !m.isRead).length;
    const repliedCount = messages.filter(m => m.isReplied).length;

    const patchMessage = async (id: string, data: { isRead?: boolean; isReplied?: boolean }) => {
        try {
            const response = await adminUpdateContactMessage(id, data);
            const next = response.data.item as Msg;
            setMessages((prev) => prev.map((item) => item._id === id ? { ...item, ...next } : item));
            toast.success('Message updated');
        } catch { toast.error('Update failed'); }
    };

    const onDelete = async (id: string) => {
        const confirmed = await showConfirmDialog({ title: 'Delete message', message: 'Delete this message?', confirmLabel: 'Delete', tone: 'danger' });
        if (!confirmed) return;
        try {
            await adminDeleteContactMessage(id);
            setMessages((prev) => prev.filter((item) => item._id !== id));
            toast.success('Deleted');
        } catch { toast.error('Delete failed'); }
    };

    const copyValue = async (label: string, value?: string) => {
        const v = String(value || '').trim();
        if (!v) { toast.error(`No ${label.toLowerCase()} available`); return; }
        try { await navigator.clipboard.writeText(v); toast.success(`${label} copied`); } catch { toast.error(`Failed to copy ${label.toLowerCase()}`); }
    };

    const formatDate = (d?: string) => {
        if (!d) return 'Unknown date';
        try { return new Date(d).toLocaleString(); } catch { return 'Unknown date'; }
    };

    const relativeTime = (d?: string) => {
        if (!d) return '';
        try {
            const diff = Date.now() - new Date(d).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            return `${Math.floor(hrs / 24)}d ago`;
        } catch { return ''; }
    };

    return (
        <div className="space-y-5">
            {/* Enhanced Header */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                            <Mail className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Contact Messages</h2>
                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                Review public contact submissions, copy sender details quickly, and track reply state.
                            </p>
                        </div>
                    </div>
                    <button onClick={() => void fetchMessages()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>

                {/* Stats Row */}
                <div className="mt-5 grid grid-cols-3 gap-3">
                    {[
                        { label: 'Total', value: messages.length, icon: '📬', bg: 'bg-slate-50 dark:bg-slate-800' },
                        { label: 'Unread', value: unreadCount, icon: '🔴', bg: 'bg-rose-50 dark:bg-rose-500/10' },
                        { label: 'Replied', value: repliedCount, icon: '✅', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                    ].map(s => (
                        <div key={s.label} className={`rounded-xl ${s.bg} p-3.5 text-center`}>
                            <span className="text-lg">{s.icon}</span>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{s.label}</p>
                            <p className="text-xl font-bold text-slate-800 dark:text-white">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="mt-5 flex flex-wrap gap-3 items-center">
                    <div className="flex gap-1.5">
                        {([
                            { key: 'all' as FilterMode, label: 'All', count: messages.length },
                            { key: 'unread' as FilterMode, label: 'Unread', count: unreadCount },
                            { key: 'replied' as FilterMode, label: 'Replied', count: repliedCount },
                        ]).map((item) => (
                            <button key={item.key} onClick={() => setFilter(item.key)}
                                className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${filter === item.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                                {item.label} <span className="ml-1 text-xs opacity-70">{item.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="ml-auto flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:w-80 dark:border-slate-700 dark:bg-slate-800">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, subject..." className="w-full bg-transparent text-sm outline-none text-slate-800 dark:text-slate-200" />
                    </div>
                </div>
            </div>

            {/* Message List */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
            ) : visibleMessages.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-16 text-center dark:border-slate-800 dark:bg-slate-900">
                    <Inbox className="mx-auto mb-3 h-14 w-14 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No contact messages found.</p>
                    <p className="mt-1 text-xs text-slate-400">Messages from the public contact form will appear here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visibleMessages.map((message) => {
                        const isFocused = focusedId === message._id;
                        const isExpanded = expandedId === message._id;
                        return (
                            <div key={message._id}
                                className={`rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md dark:bg-slate-900 ${isFocused ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500/50' : 'border-slate-200 dark:border-slate-800'}`}>
                                {/* Header Row - Clickable */}
                                <div className="flex items-start gap-4 p-5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : message._id)}>
                                    {/* Avatar */}
                                    <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${!message.isRead ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {message.name ? message.name.charAt(0).toUpperCase() : '?'}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="text-sm font-bold text-slate-800 dark:text-white">{message.name || 'Unknown'}</h4>
                                            {!message.isRead && (
                                                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">New</span>
                                            )}
                                            {message.isReplied && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                                                    ✓ Replied
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{message.subject || 'No Subject'}</p>
                                        <p className="mt-1 text-xs text-slate-500 line-clamp-1 dark:text-slate-400">{message.message}</p>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{relativeTime(message.createdAt)}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(message.createdAt)}</p>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 px-5 pb-5 dark:border-slate-800">
                                        {/* Contact Info Cards */}
                                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            <InfoField icon={<User className="h-3.5 w-3.5" />} label="Name" value={message.name} onCopy={() => void copyValue('Name', message.name)} />
                                            <InfoField icon={<AtSign className="h-3.5 w-3.5" />} label="Email" value={message.email} onCopy={() => void copyValue('Email', message.email)} />
                                            <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={message.phone || 'Not provided'} onCopy={message.phone ? () => void copyValue('Phone', message.phone) : undefined} />
                                            <InfoField icon={<MessageSquare className="h-3.5 w-3.5" />} label="Subject" value={message.subject || 'No subject'} onCopy={() => void copyValue('Subject', message.subject || 'No subject')} />
                                        </div>

                                        {/* Message Body */}
                                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                                            <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed dark:text-slate-200">{message.message}</p>
                                        </div>

                                        {/* Actions */}
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => void copyValue('Message', message.message)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                                <Copy className="h-3.5 w-3.5" /> Copy message
                                            </button>
                                            <button onClick={() => void patchMessage(message._id, { isRead: !message.isRead })}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                                {message.isRead ? '📭 Mark unread' : '📬 Mark read'}
                                            </button>
                                            <button onClick={() => void patchMessage(message._id, { isReplied: !message.isReplied, isRead: true })}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                                {message.isReplied ? '↩️ Mark unreplied' : '✅ Mark replied'}
                                            </button>
                                            <button onClick={() => void onDelete(message._id)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20">
                                                <Trash2 className="h-3.5 w-3.5" /> Delete
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function InfoField({ icon, label, value, onCopy }: { icon: React.ReactNode; label: string; value: string; onCopy?: () => void }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-slate-400">{icon}</span>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
            </div>
            <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-all text-sm font-medium text-slate-700 dark:text-slate-200">{value}</p>
                {onCopy && (
                    <button type="button" onClick={onCopy}
                        className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-white hover:text-indigo-500 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                        title={`Copy ${label}`}>
                        <Copy className="h-3 w-3" />
                    </button>
                )}
            </div>
        </div>
    );
}
