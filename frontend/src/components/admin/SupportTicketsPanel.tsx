import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    adminCreateNotice,
    adminGetNotices,
    adminGetStudentGroups,
    adminGetStudents,
    adminGetSupportTickets,
    adminReplySupportTicket,
    adminToggleNotice,
    adminUpdateSupportTicketStatus,
    type AdminNoticeItem,
    type AdminStudentGroup,
    type AdminStudentItem,
    type AdminSupportTicketItem,
} from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { useAdminRuntimeFlags } from '../../hooks/useAdminRuntimeFlags';
import InfoHint from '../ui/InfoHint';

import {
    RefreshCw, MessageSquare, Bell, Send, User,
    Clock, CheckCircle, Search,
    ArrowLeft, ExternalLink, Calendar, AlertTriangle,
    Filter, ChevronDown,
} from 'lucide-react';

const formatDate = (date?: Date | string | null, options: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' }) => {
    if (!date) return 'N/A';
    try { return new Intl.DateTimeFormat('en-US', options).format(new Date(date)); } catch { return 'N/A'; }
};
const formatFullDate = (date?: Date | string | null) => formatDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatTime = (date?: Date | string | null) => formatDate(date, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const getStudentDisplayName = (student: AdminSupportTicketItem['studentId']) => {
    if (!student || typeof student === 'string') return 'Unknown student';
    return student.full_name || student.username || student.email || 'Unknown student';
};

type NoticeRecipientOption = { id: string; title: string; subtitle: string };

export default function SupportTicketsPanel() {
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const runtimeFlags = useAdminRuntimeFlags();
    const [tab, setTab] = useState<'tickets' | 'notices'>('tickets');
    const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicketItem | null>(null);
    const [replyDraft, setReplyDraft] = useState('');
    const [ticketSearch, setTicketSearch] = useState('');
    const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('');
    const [ticketPriorityFilter, setTicketPriorityFilter] = useState<string>('');

    const [noticeForm, setNoticeForm] = useState({ title: '', message: '', target: 'all' as 'all' | 'groups' | 'students', targetIds: [] as string[], startAt: '', endAt: '' });
    const [recipientSearch, setRecipientSearch] = useState('');

    const ticketsQuery = useQuery<AdminSupportTicketItem[]>({ queryKey: queryKeys.supportTickets, queryFn: async () => (await adminGetSupportTickets({ page: 1, limit: 50 })).data.items || [] });
    const noticesQuery = useQuery<AdminNoticeItem[]>({ queryKey: queryKeys.supportNotices, queryFn: async () => (await adminGetNotices({ page: 1, limit: 20 })).data.items || [] });
    const studentsQuery = useQuery<AdminStudentItem[]>({ queryKey: ['admin', 'notice-target-students'], queryFn: async () => (await adminGetStudents({ page: 1, limit: 300 })).data.items || [], enabled: tab === 'notices', staleTime: 60_000 });
    const groupsQuery = useQuery<AdminStudentGroup[]>({ queryKey: ['admin', 'notice-target-groups'], queryFn: async () => (await adminGetStudentGroups()).data.items || [], enabled: tab === 'notices', staleTime: 60_000 });

    const tickets = ticketsQuery.data || [];
    const notices = noticesQuery.data || [];
    const students = studentsQuery.data || [];
    const groups = groupsQuery.data || [];
    const loading = tab === 'tickets' ? ticketsQuery.isFetching : (noticesQuery.isFetching || studentsQuery.isFetching || groupsQuery.isFetching);
    const hasError = tab === 'tickets' ? ticketsQuery.isError : (noticesQuery.isError || studentsQuery.isError || groupsQuery.isError);

    // Filtered tickets
    const filteredTickets = useMemo(() => {
        let list = tickets;
        if (ticketStatusFilter) list = list.filter(t => t.status === ticketStatusFilter);
        if (ticketPriorityFilter) list = list.filter(t => t.priority === ticketPriorityFilter);
        if (ticketSearch.trim()) {
            const q = ticketSearch.toLowerCase();
            list = list.filter(t => t.subject.toLowerCase().includes(q) || t.ticketNo.toLowerCase().includes(q) || t.message.toLowerCase().includes(q) || getStudentDisplayName(t.studentId).toLowerCase().includes(q));
        }
        return list;
    }, [tickets, ticketStatusFilter, ticketPriorityFilter, ticketSearch]);

    // Ticket stats
    const openCount = tickets.filter(t => t.status === 'open').length;
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
    const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

    const recipientOptions = useMemo<NoticeRecipientOption[]>(() => {
        if (noticeForm.target === 'students') return students.map(s => ({ id: s._id, title: s.fullName || s.username || s.email, subtitle: [s.username, s.email].filter(Boolean).join(' · ') }));
        if (noticeForm.target === 'groups') return groups.map(g => ({ id: g._id, title: g.name, subtitle: g.batchTag || g.description || g.slug }));
        return [];
    }, [groups, noticeForm.target, students]);

    const filteredRecipientOptions = useMemo(() => {
        const needle = recipientSearch.trim().toLowerCase();
        if (!needle) return recipientOptions;
        return recipientOptions.filter(i => `${i.title} ${i.subtitle}`.toLowerCase().includes(needle));
    }, [recipientOptions, recipientSearch]);

    useEffect(() => { if (!selectedTicket) return; const u = tickets.find(t => t._id === selectedTicket._id); if (u) setSelectedTicket(u); }, [tickets, selectedTicket]);
    useEffect(() => { const id = searchParams.get('ticketId'); if (!id || tickets.length === 0) return; const t = tickets.find(x => x._id === id); if (t) setSelectedTicket(t); }, [searchParams, tickets]);

    const reloadSupportData = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.supportTickets }), queryClient.invalidateQueries({ queryKey: queryKeys.supportNotices })]); };

    const updateStatusMutation = useMutation({ mutationFn: async ({ id, status }: { id: string; status: AdminSupportTicketItem['status'] }) => adminUpdateSupportTicketStatus(id, { status }), onSuccess: async () => { toast.success('Status updated'); await reloadSupportData(); }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Status update failed') });
    const replyMutation = useMutation({ mutationFn: async ({ id, message }: { id: string; message: string }) => adminReplySupportTicket(id, message), onSuccess: async () => { setReplyDraft(''); toast.success('Reply sent'); await reloadSupportData(); }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Reply failed') });
    const createNoticeMutation = useMutation({ mutationFn: async () => adminCreateNotice({ title: noticeForm.title, message: noticeForm.message, target: noticeForm.target, targetIds: noticeForm.target === 'all' ? [] : noticeForm.targetIds, startAt: noticeForm.startAt || undefined, endAt: noticeForm.endAt || undefined }), onSuccess: async () => { setNoticeForm({ title: '', message: '', target: 'all', targetIds: [], startAt: '', endAt: '' }); setRecipientSearch(''); toast.success('Notice published'); await reloadSupportData(); }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Notice create failed') });
    const toggleNoticeMutation = useMutation({ mutationFn: async (id: string) => adminToggleNotice(id), onSuccess: async () => { await reloadSupportData(); }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Toggle failed') });

    const updateStatus = async (id: string, status: AdminSupportTicketItem['status']) => { await updateStatusMutation.mutateAsync({ id, status }); };
    const handleReply = async (id: string) => { const message = replyDraft.trim(); if (!message) return toast.error('Reply message is required'); await replyMutation.mutateAsync({ id, message }); };
    const handleCreateNotice = async (event: React.FormEvent) => { event.preventDefault(); if (!noticeForm.title || !noticeForm.message) return toast.error('Title and message are required'); if (noticeForm.target !== 'all' && noticeForm.targetIds.length === 0) return toast.error('Please select at least one recipient'); await createNoticeMutation.mutateAsync(); };
    const toggleRecipient = (id: string) => { setNoticeForm(p => ({ ...p, targetIds: p.targetIds.includes(id) ? p.targetIds.filter(x => x !== id) : [...p.targetIds, id] })); };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'open': return 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30';
            case 'in_progress': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
            case 'resolved': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
            case 'closed': return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30';
            default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30';
        }
    };

    const getPriorityStyle = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
            case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300';
            case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
            default: return 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300';
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority) { case 'urgent': return '🔴'; case 'high': return '🟠'; case 'medium': return '🟡'; default: return '🟢'; }
    };

    const renderTicketList = () => (
        <div className="space-y-4">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} placeholder="Search tickets..." className="w-full bg-transparent text-sm outline-none text-slate-800 dark:text-slate-200" />
                </div>
                <div className="flex gap-1.5">
                    {['', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
                        <button key={s} onClick={() => setTicketStatusFilter(s)}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${ticketStatusFilter === s ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {s ? s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'All'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Ticket Grid */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {filteredTickets.length === 0 ? (
                    <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center dark:border-slate-800">
                        <MessageSquare className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                        <p className="mt-4 text-sm text-slate-400">No support tickets found.</p>
                    </div>
                ) : filteredTickets.map((ticket) => (
                    <div key={ticket._id} onClick={() => setSelectedTicket(ticket)}
                        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40">
                        {/* Priority indicator strip */}
                        <div className={`absolute left-0 top-0 h-full w-1 ${ticket.priority === 'urgent' ? 'bg-red-500' : ticket.priority === 'high' ? 'bg-orange-500' : ticket.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        <div className="flex items-start justify-between gap-3 pl-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{ticket.ticketNo}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusStyle(ticket.status)}`}>
                                        {ticket.status.replace('_', ' ')}
                                    </span>
                                    {ticket.status === 'open' && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                                        </span>
                                    )}
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPriorityStyle(ticket.priority)}`}>
                                        {getPriorityIcon(ticket.priority)} {ticket.priority}
                                    </span>
                                </div>
                                <h4 className="line-clamp-1 font-bold text-slate-800 group-hover:text-indigo-600 transition-colors dark:text-white dark:group-hover:text-indigo-400">{ticket.subject}</h4>
                                <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                                    <User className="h-3 w-3" /> {getStudentDisplayName(ticket.studentId)}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-[10px] text-slate-400">{formatTime(ticket.createdAt)}</p>
                            </div>
                        </div>
                        <p className="mt-3 pl-2 line-clamp-2 break-all text-xs text-slate-500 dark:text-slate-400">{ticket.message}</p>
                        <div className="mt-4 pl-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Updated {formatDate(ticket.updatedAt)}
                            </span>
                            {ticket.timeline && ticket.timeline.length > 0 && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" /> {ticket.timeline.length} replies
                                </span>
                            )}
                            <span className="text-xs font-semibold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Open <ExternalLink className="h-3 w-3" />
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTicketDetail = () => {
        if (!selectedTicket) return null;
        return (
            <div className="flex flex-col h-[700px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors dark:hover:bg-slate-800">
                            <ArrowLeft className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{selectedTicket.subject}</h3>
                                <span className="text-xs text-slate-400">#{selectedTicket.ticketNo}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-xs text-slate-500">
                                    <span className="text-slate-400">Student:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{getStudentDisplayName(selectedTicket.studentId)}</span>
                                </p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPriorityStyle(selectedTicket.priority)}`}>
                                    {getPriorityIcon(selectedTicket.priority)} {selectedTicket.priority}
                                </span>
                            </div>
                            {selectedTicket.studentId && typeof selectedTicket.studentId !== 'string' && (
                                <Link to={`/__cw_admin__/student-management/students/${selectedTicket.studentId._id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400">
                                    Open student profile <ExternalLink className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                    </div>
                    <select value={selectedTicket.status} onChange={(e) => updateStatus(selectedTicket._id, e.target.value as AdminSupportTicketItem['status'])}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none transition-colors ${getStatusStyle(selectedTicket.status)}`}>
                        <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                    </select>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/30 dark:bg-slate-950/20">
                    {/* Original Message */}
                    <div className="flex gap-3">
                        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center dark:bg-indigo-500/20">
                            <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex-1 max-w-[85%]">
                            <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words dark:text-slate-200">{selectedTicket.message}</p>
                            </div>
                            <span className="mt-1.5 block text-[10px] text-slate-400">{formatFullDate(selectedTicket.createdAt)}</span>
                        </div>
                    </div>

                    {/* Timeline */}
                    {selectedTicket.timeline?.map((item, idx) => {
                        const isStudent = !item.actorRole || item.actorRole === 'student';
                        return (
                            <div key={idx} className={`flex gap-3 ${isStudent ? '' : 'flex-row-reverse'}`}>
                                <div className={`h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center ${isStudent ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20'}`}>
                                    {isStudent ? <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> : <ShieldIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                                </div>
                                <div className={`flex flex-col ${isStudent ? 'max-w-[85%]' : 'max-w-[85%] items-end'}`}>
                                    <div className={`rounded-2xl p-4 shadow-sm border ${isStudent
                                        ? 'rounded-tl-sm bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800'
                                        : 'rounded-tr-sm bg-gradient-to-br from-indigo-600 to-indigo-500 border-transparent text-white'}`}>
                                        <p className="text-sm whitespace-pre-wrap break-words">{item.message}</p>
                                    </div>
                                    <span className="mt-1.5 block text-[10px] text-slate-400">
                                        {!isStudent && <span className="text-emerald-500 font-semibold mr-2">Support Team</span>}
                                        {formatTime(item.createdAt)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Reply Bar */}
                <div className="p-4 sm:p-5 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
                        <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="Type your response..."
                            className="flex-1 min-h-[50px] max-h-[150px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply(selectedTicket._id); } }} />
                        <button onClick={() => void handleReply(selectedTicket._id)} disabled={!replyDraft.trim() || loading}
                            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl disabled:opacity-50 transition-all flex-shrink-0">
                            <Send className="h-5 w-5" />
                        </button>
                    </div>
                    <p className="mt-2 text-[10px] text-center text-slate-400">Press Enter to send, Shift + Enter for new line</p>
                </div>
            </div>
        );
    };

    const renderNotices = () => (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Create Form */}
            <div className="xl:col-span-5">
                <form onSubmit={handleCreateNotice} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-500/20"><Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /></div>
                        <h3 className="font-bold text-slate-800 dark:text-white">New Announcement</h3>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Title</label>
                            <input value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} placeholder="E.g. Class Rescheduled"
                                className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Message</label>
                            <textarea value={noticeForm.message} onChange={(e) => setNoticeForm({ ...noticeForm, message: e.target.value })} placeholder="Enter details here..."
                                className="h-28 w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Audience</label>
                                <select value={noticeForm.target} onChange={(e) => { setNoticeForm({ ...noticeForm, target: e.target.value as typeof noticeForm.target, targetIds: [] }); setRecipientSearch(''); }}
                                    className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    <option value="all">All Users</option><option value="groups">Groups Only</option><option value="students">Single Students</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Start At</label>
                                <input type="datetime-local" value={noticeForm.startAt} onChange={(e) => setNoticeForm({ ...noticeForm, startAt: e.target.value })}
                                    className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">End At</label>
                                <input type="datetime-local" value={noticeForm.endAt} onChange={(e) => setNoticeForm({ ...noticeForm, endAt: e.target.value })}
                                    className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                            </div>
                        </div>
                        {noticeForm.target !== 'all' && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Recipients</label>
                                    <span className="text-[10px] font-semibold text-indigo-500">{noticeForm.targetIds.length} selected</span>
                                </div>
                                <input value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} placeholder={noticeForm.target === 'students' ? 'Search students...' : 'Search groups...'}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
                                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                                    {(studentsQuery.isFetching || groupsQuery.isFetching) ? <p className="text-xs text-slate-400 px-1 py-2">Loading...</p>
                                        : filteredRecipientOptions.length === 0 ? <p className="text-xs text-slate-400 px-1 py-2">No recipients found.</p>
                                            : filteredRecipientOptions.map(o => (
                                                <button key={o.id} type="button" onClick={() => toggleRecipient(o.id)}
                                                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${noticeForm.targetIds.includes(o.id) ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10' : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900'}`}>
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{o.title}</p>
                                                    <p className="text-xs text-slate-400 line-clamp-1">{o.subtitle}</p>
                                                </button>
                                            ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button type="submit" disabled={createNoticeMutation.isPending}
                        className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl disabled:opacity-50 transition-all">
                        {createNoticeMutation.isPending ? '⏳ Publishing...' : '📢 Publish Notice'}
                    </button>
                </form>
            </div>

            {/* Notice List */}
            <div className="xl:col-span-7 space-y-3">
                <div className="flex items-center justify-between px-1">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        📢 Live Notices <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">{notices.length}</span>
                    </h3>
                </div>
                <div className="max-h-[500px] overflow-y-auto pr-1 space-y-3">
                    {notices.length === 0 ? (
                        <div className="py-10 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800"><p className="text-slate-400 text-sm">No active notices.</p></div>
                    ) : notices.map(notice => (
                        <div key={notice._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="font-bold text-slate-800 text-sm dark:text-white">{notice.title}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${notice.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                                            {notice.isActive ? '● Live' : '○ Hidden'}
                                        </span>
                                        {notice.priority && notice.priority !== 'normal' && (
                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${notice.priority === 'breaking' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                                                {notice.priority}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed dark:text-slate-400">{notice.message}</p>
                                    <div className="mt-3 flex items-center gap-4">
                                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(notice.createdAt)}</span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                            Target: {notice.target}{Array.isArray(notice.targetIds) && notice.targetIds.length > 0 ? ` (${notice.targetIds.length})` : ''}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => void toggleNoticeMutation.mutateAsync(notice._id)}
                                    className={`rounded-xl p-2.5 transition-all ${notice.isActive ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400'}`}
                                    title={notice.isActive ? 'Deactivate' : 'Activate'}>
                                    <CheckCircle className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-[1600px] mx-auto space-y-6">
            {/* Enhanced Header with Stats */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                            <LifeBuoyIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                Support & Notifications
                                {runtimeFlags.trainingMode && <InfoHint title="Support Workflow" description="Open tickets should be replied, then moved to In Progress or Resolved. Notices are broadcast messages." />}
                            </h2>
                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Provide student support via live tickets and broadcast critical announcements.</p>
                        </div>
                    </div>
                    <button onClick={() => void reloadSupportData()} disabled={loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 self-end md:self-auto">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>

                {/* Stats Row */}
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Open', value: openCount, icon: '🔵', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
                        { label: 'In Progress', value: inProgressCount, icon: '🟡', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                        { label: 'Resolved', value: resolvedCount, icon: '✅', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                        { label: 'Notices', value: notices.length, icon: '📢', bg: 'bg-violet-50 dark:bg-violet-500/10' },
                    ].map(s => (
                        <div key={s.label} className={`rounded-xl ${s.bg} p-3.5 text-center`}>
                            <span className="text-lg">{s.icon}</span>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{s.label}</p>
                            <p className="text-xl font-bold text-slate-800 dark:text-white">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Tab Switcher */}
                <div className="mt-5 flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 w-full sm:w-fit dark:bg-slate-800">
                    <button onClick={() => { setTab('tickets'); setSelectedTicket(null); }}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${tab === 'tickets' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        <MessageSquare className="h-4 w-4" /> Tickets
                        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === 'tickets' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>{tickets.length}</span>
                    </button>
                    <button onClick={() => { setTab('notices'); setSelectedTicket(null); }}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${tab === 'notices' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        <Bell className="h-4 w-4" /> Notices
                        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === 'notices' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>{notices.length}</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="min-h-[400px]">
                {hasError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                        <div>
                            {tab === 'tickets' ? 'Failed to load support tickets.' : 'Failed to load notice tools.'}
                            <button type="button" onClick={() => void reloadSupportData()} className="ml-2 font-bold underline">Retry</button>
                        </div>
                    </div>
                ) : loading && !selectedTicket ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                        <p className="mt-3 text-sm text-slate-500">Loading support items...</p>
                    </div>
                ) : selectedTicket ? renderTicketDetail() : (
                    tab === 'tickets' ? renderTicketList() : renderNotices()
                )}
            </div>
        </div>
    );
}

/* ─── Inline SVG Icons ────────────────────────────── */
const ShieldIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
);

const LifeBuoyIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24" /><path d="m14.83 9.17 4.24-4.24" /><path d="m14.83 14.83 4.24 4.24" /><path d="m9.17 14.83-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg>
);
