import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Lock, AlertCircle, CheckCircle, Clock,
    Award, Target, TrendingUp, Activity, BarChart, History,
    Settings, PlayCircle, Eye, FileText, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getProfileDashboard, startExam, updateProfile } from '../services/api';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Profile() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);

    const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'settings'>('overview');
    const [examTab, setExamTab] = useState<'live' | 'upcoming' | 'completed' | 'missed' | 'external'>('live');

    const [formParams, setFormParams] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [startingExternalExamId, setStartingExternalExamId] = useState('');

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            setLoading(true);
            const res = await getProfileDashboard();
            setData(res.data);
            setFormParams(res.data.profile || res.data.user || {});
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to load profile dashboard');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            await updateProfile(formParams);
            toast.success('Profile updated successfully');
            // Refresh dashboard to get updated completion %
            fetchDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Update failed');
        } finally {
            setSaving(false);
        }
    };

    const handleExternalExamStart = async (examId: string) => {
        try {
            setStartingExternalExamId(examId);
            const payload = (await startExam(examId)).data;
            if (payload.redirect && payload.externalExamUrl) {
                window.location.href = payload.externalExamUrl;
                return;
            }
            toast.error('External exam link is not available right now');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to start exam');
        } finally {
            setStartingExternalExamId('');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) return null;

    const { user, profile, upcomingExams, liveExams, completedExams, missedExams, externalExams, analytics, examHistory } = data;
    const studentProfile = profile || user;
    const isComplete = studentProfile.profile_completion_percentage === 100;
    const completionPct = studentProfile.profile_completion_percentage || 0;

    const renderHeader = () => (
        <div className="bg-[#111d33]/80 backdrop-blur-md rounded-2xl border border-indigo-500/10 p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

            <div className="relative group">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[2px]">
                    <div className="w-full h-full bg-[#0a0f1c] rounded-2xl flex items-center justify-center overflow-hidden">
                        {user.profilePictureUrl ? (
                            <img src={user.profilePictureUrl} alt={user.fullName} className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-12 h-12 text-indigo-400" />
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 text-center md:text-left space-y-3 z-10 w-full">
                <div>
                    <h1 className="text-2xl md:text-4xl font-bold text-white mb-2">{user.fullName}</h1>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-mono">
                            ID: {studentProfile.user_unique_id || user.adminGeneratedId || user._id.slice(-8).toUpperCase()}
                        </span>
                        {studentProfile.ssc_batch && <span className="text-sm text-slate-400">SSC: {studentProfile.ssc_batch}</span>}
                        {studentProfile.hsc_batch && <span className="text-sm text-slate-400">HSC: {studentProfile.hsc_batch}</span>}
                        {studentProfile.department && <span className="text-sm text-slate-400">Dept: {studentProfile.department}</span>}
                    </div>
                </div>

                {/* Completion Bar */}
                <div className="pt-2 max-w-md w-full mx-auto md:mx-0">
                    <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400">Profile Completion</span>
                        <span className={isComplete ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                            {completionPct}%
                        </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-1000 ${isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}
                            style={{ width: `${completionPct}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[140px] z-10">
                <button
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
                >
                    <Settings className="w-4 h-4" /> Edit Profile
                </button>
            </div>
        </div>
    );

    const renderLockBanner = () => {
        if (isComplete) return null;
        return (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 md:p-6 flex items-start gap-4">
                <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl shrink-0">
                    <Lock className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-orange-400 mb-1">Exam Access Locked</h3>
                    <p className="text-slate-300 text-sm mb-4">You must complete your profile 100% to unlock and participate in exams. We require your valid academic background and guardian details for security.</p>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                        Complete Profile Now
                    </button>
                </div>
            </div>
        );
    };

    const renderAnalytics = () => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 p-5">
                <div className="flex items-center gap-3 mb-2 opacity-80">
                    <Target className="w-5 h-5 text-indigo-400" />
                    <span className="text-sm font-medium text-slate-300">Total Exams</span>
                </div>
                <div className="text-3xl font-black text-white">{analytics.totalAttempted}</div>
            </div>
            <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 p-5">
                <div className="flex items-center gap-3 mb-2 opacity-80">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-medium text-slate-300">Avg Score</span>
                </div>
                <div className="text-3xl font-black text-white">{analytics.avgScore}%</div>
            </div>
            <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 p-5">
                <div className="flex items-center gap-3 mb-2 opacity-80">
                    <Award className="w-5 h-5 text-amber-400" />
                    <span className="text-sm font-medium text-slate-300">Best Score</span>
                </div>
                <div className="text-3xl font-black text-white">{analytics.bestScore}%</div>
            </div>
            <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 p-5">
                <div className="flex items-center gap-3 mb-2 opacity-80">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-medium text-slate-300">Accuracy</span>
                </div>
                <div className="text-3xl font-black text-white">{analytics.accuracy}%</div>
            </div>
        </div>
    );

    const renderHistoryTimeline = () => (
        <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" /> Recent History
            </h3>
            {examHistory.length === 0 ? (
                <div className="text-center text-slate-500 py-8">No exam history yet.</div>
            ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                    {examHistory.slice(0, 5).map((item: any, i: number) => (
                        <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-[#0a0f1c] bg-[#111d33] text-emerald-400 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors">
                                {item.status === 'missed' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#0a0f1c]/50 p-4 rounded-xl border border-indigo-500/10 shadow hover:border-indigo-500/30 transition-colors">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="font-bold text-white text-sm">{item.examTitle}</div>
                                    <time className="font-mono text-xs text-slate-400">{dayjs(item.date).format('DD MMM')}</time>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {item.status === 'completed'
                                        ? `Score: ${item.obtainedMarks} / ${item.totalMarks}`
                                        : <span className="text-red-400">Missed</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {examHistory.length > 5 && (
                <div className="mt-6 text-center">
                    <button className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                        View All History
                    </button>
                </div>
            )}
        </div>
    );

    const ExamCard = ({ exam, type }: { exam: any, type: string }) => (
        <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-xl border border-indigo-500/10 overflow-hidden hover:border-indigo-500/40 transition-all flex flex-col">
            <div className="p-5 flex-1 space-y-4">
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="text-xs text-indigo-400 font-bold tracking-wider uppercase mb-1">{exam.subject}</div>
                        <h3 className="text-lg font-bold text-white line-clamp-2">{exam.title || exam.exam?.title}</h3>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm border-t border-slate-800 pt-4">
                    {/* If normal exam block */}
                    {['upcoming', 'live', 'missed', 'external'].includes(type) ? (
                        <>
                            <div className="flex flex-col">
                                <span className="text-slate-500 text-xs">Total Marks</span>
                                <span className="text-slate-300 font-medium">{exam.totalMarks}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-slate-500 text-xs">Duration</span>
                                <span className="text-slate-300 font-medium">{exam.duration} min</span>
                            </div>
                            <div className="flex flex-col col-span-2">
                                <span className="text-slate-500 text-xs">Schedule</span>
                                <span className="text-slate-300 text-xs mt-0.5 flex flex-col gap-1">
                                    <span>Starts: {dayjs(exam.startDate).format('DD MMM YYYY, hh:mm A')}</span>
                                    <span>Ends: {dayjs(exam.endDate).format('DD MMM YYYY, hh:mm A')}</span>
                                </span>
                            </div>
                        </>
                    ) : (
                        // Completed block
                        <>
                            <div className="flex flex-col">
                                <span className="text-slate-500 text-xs">Score</span>
                                <span className={`font-bold ${exam.percentage >= 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {exam.obtainedMarks} / {exam.totalMarks} ({exam.percentage}%)
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-slate-500 text-xs">Accuracy</span>
                                <span className="text-slate-300 font-medium">
                                    {exam.correctCount}C / {exam.wrongCount}W
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="p-4 bg-slate-900/50 border-t border-indigo-500/10 flex justify-end">
                {type === 'live' && (
                    <button
                        onClick={() => navigate(`/exam/take/${exam._id}`)}
                        disabled={!isComplete}
                        className={`px-5 py-2 rounded-xl text-sm font-bold shadow-lg transition-transform hover:-translate-y-0.5 flex items-center gap-2 ${isComplete
                            ? (exam.inProgress ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20')
                            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        <PlayCircle className="w-4 h-4" /> {exam.inProgress ? 'Resume Exam' : 'Start Exam'}
                    </button>
                )}
                {type === 'completed' && (
                    <button
                        onClick={() => navigate(`/exam/result/${exam.exam._id}`)}
                        disabled={!exam.resultPublished}
                        className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${exam.resultPublished
                            ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                    >
                        <Eye className="w-4 h-4" /> {exam.resultPublished ? 'View Result' : 'Publishing Pending'}
                    </button>
                )}
                {type === 'upcoming' && (
                    <span className="text-sm font-medium text-amber-500 flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Starts {dayjs(exam.startDate).fromNow()}
                    </span>
                )}
                {type === 'external' && (
                    exam.externalExamUrl ? (
                        <button
                            type="button"
                            onClick={() => void handleExternalExamStart(String(exam._id))}
                            disabled={startingExternalExamId === String(exam._id)}
                            className="px-5 py-2 bg-purple-500 hover:bg-purple-600 rounded-xl text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {startingExternalExamId === String(exam._id) ? 'Opening...' : 'Go to Exam'} <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="px-5 py-2 bg-slate-800 text-slate-500 rounded-xl text-sm font-bold cursor-not-allowed"
                        >
                            Link Unavailable
                        </button>
                    )
                )}
                {type === 'missed' && (
                    <span className="text-sm font-bold text-red-500 bg-red-500/10 px-4 py-2 rounded-xl">Missed</span>
                )}
            </div>
        </div>
    );

    const renderExamsTab = () => (
        <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {(['live', 'upcoming', 'completed', 'missed', 'external'] as const).map(et => {
                    const counts: any = {
                        live: liveExams.length, upcoming: upcomingExams.length,
                        completed: completedExams.length, missed: missedExams.length, external: externalExams.length
                    };
                    const count = counts[et];
                    return (
                        <button
                            key={et}
                            onClick={() => setExamTab(et)}
                            className={`px-5 py-2.5 rounded-xl whitespace-nowrap text-sm font-bold transition-all flex items-center gap-2 ${examTab === et
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                }`}
                        >
                            {et.charAt(0).toUpperCase() + et.slice(1)}
                            <span className={`px-2 py-0.5 rounded-lg text-xs ${examTab === et ? 'bg-white/20' : 'bg-slate-900'}`}>{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {examTab === 'live' && liveExams.length === 0 && <div className="col-span-full py-12 text-center text-slate-500">No live exams available right now.</div>}
                {examTab === 'live' && liveExams.map((e: any) => <ExamCard key={e._id} exam={e} type="live" />)}

                {examTab === 'upcoming' && upcomingExams.length === 0 && <div className="col-span-full py-12 text-center text-slate-500">No upcoming exams scheduled.</div>}
                {examTab === 'upcoming' && upcomingExams.map((e: any) => <ExamCard key={e._id} exam={e} type="upcoming" />)}

                {examTab === 'completed' && completedExams.length === 0 && <div className="col-span-full py-12 text-center text-slate-500">You haven't completed any exams yet.</div>}
                {examTab === 'completed' && completedExams.map((e: any) => <ExamCard key={e.resultId} exam={e} type="completed" />)}

                {examTab === 'missed' && missedExams.length === 0 && <div className="col-span-full py-12 text-center text-slate-500">No missed exams. Great job!</div>}
                {examTab === 'missed' && missedExams.map((e: any) => <ExamCard key={e._id} exam={e} type="missed" />)}

                {examTab === 'external' && externalExams.length === 0 && <div className="col-span-full py-12 text-center text-slate-500">No external exams linked.</div>}
                {examTab === 'external' && externalExams.map((e: any) => <ExamCard key={e._id} exam={e} type="external" />)}
            </div>
        </div>
    );

    const renderSettingsTab = () => (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-[#111d33]/80 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                <div className="p-6 border-b border-indigo-500/10">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-indigo-400" /> Personal Information
                    </h2>
                </div>
                <div className="p-6">
                    <form onSubmit={handleSaveProfile} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">Full Name <span className="text-red-500">*</span></label>
                                <input type="text" value={formParams.full_name || ''} onChange={(e) => setFormParams({ ...formParams, full_name: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">Phone Number <span className="text-red-500">*</span></label>
                                <input type="text" value={formParams.phone_number || ''} onChange={(e) => setFormParams({ ...formParams, phone_number: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">Guardian Contact Number <span className="text-red-500">*</span></label>
                                <input type="text" value={formParams.guardian_number || ''} onChange={(e) => setFormParams({ ...formParams, guardian_number: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">Date of Birth <span className="text-red-500">*</span></label>
                                <input type="date" value={formParams.date_of_birth ? formParams.date_of_birth.split('T')[0] : ''} onChange={(e) => setFormParams({ ...formParams, date_of_birth: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                        </div>

                        <div className="border-t border-slate-800 pt-5 mt-5">
                            <h3 className="text-lg font-bold text-white mb-4">Academic Background</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-300">SSC Batch Year <span className="text-red-500">*</span></label>
                                    <input type="text" placeholder="e.g. 2022" value={formParams.ssc_batch || ''} onChange={(e) => setFormParams({ ...formParams, ssc_batch: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-300">HSC Batch Year <span className="text-red-500">*</span></label>
                                    <input type="text" placeholder="e.g. 2024" value={formParams.hsc_batch || ''} onChange={(e) => setFormParams({ ...formParams, hsc_batch: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-300">Department Framework <span className="text-red-500">*</span></label>
                                    <select value={formParams.department || ''} onChange={(e) => setFormParams({ ...formParams, department: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                                        <option value="">Select Department</option>
                                        <option value="Science">Science (বিজ্ঞান)</option>
                                        <option value="Humanities">Humanities (মানবিক)</option>
                                        <option value="Business">Business Studies (ব্যবসায় শিক্ষা)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-300">College Name <span className="text-red-500">*</span></label>
                                    <input type="text" value={formParams.college_name || ''} onChange={(e) => setFormParams({ ...formParams, college_name: e.target.value })} required className="w-full bg-[#0a0f1c] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Profile Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col font-sans">
            <main className="flex-1 w-full mx-auto px-5 sm:px-8 lg:px-12 xl:px-16 py-8 mt-20">
                <div className="space-y-6">
                    {renderHeader()}
                    {renderLockBanner()}

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 border-b border-slate-800">
                        {[
                            { id: 'overview', label: 'Dashboard Overview', icon: BarChart },
                            { id: 'exams', label: 'My Exams Library', icon: FileText },
                            { id: 'settings', label: 'Profile Setup', icon: Settings }
                        ].map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-5 py-3.5 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                    {activeTab === tab.id && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content area */}
                    <div className="pt-2">
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 space-y-6">
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <BarChart className="w-5 h-5 text-indigo-400" /> Performance Analytics
                                    </h2>
                                    {renderAnalytics()}

                                    <h2 className="text-xl font-bold text-white flex items-center gap-2 pt-4">
                                        <PlayCircle className="w-5 h-5 text-emerald-400" /> Active & Upcoming
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {liveExams.length === 0 && upcomingExams.length === 0 && (
                                            <div className="col-span-full py-8 text-center bg-[#111d33]/50 rounded-2xl border border-indigo-500/10 text-slate-500">
                                                No active or upcoming exams.
                                            </div>
                                        )}
                                        {liveExams.slice(0, 2).map((e: any) => <ExamCard key={e._id} exam={e} type="live" />)}
                                        {upcomingExams.slice(0, 2).map((e: any) => <ExamCard key={e._id} exam={e} type="upcoming" />)}
                                    </div>
                                    {(liveExams.length > 2 || upcomingExams.length > 2) && (
                                        <button onClick={() => setActiveTab('exams')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">View all exams →</button>
                                    )}
                                </div>
                                <div className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-800 pt-6 lg:pt-0 lg:pl-6">
                                    {renderHistoryTimeline()}
                                </div>
                            </div>
                        )}

                        {activeTab === 'exams' && renderExamsTab()}
                        {activeTab === 'settings' && renderSettingsTab()}
                    </div>
                </div>
            </main>
        </div>
    );
}
