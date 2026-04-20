import { useState, useEffect } from 'react';
import { SEO } from '../../components/common/SEO';
import { User, Upload, Save, Loader2, AlertCircle, Lock, BookOpen, Clock3, FileText, Hash, MapPin, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { changePassword, getStudentProfile, updateStudentProfile, uploadStudentDocument } from '../../services/api';
import AchievementPopupCard from '../../components/ui/AchievementPopupCard';
import { useMySubscription } from '../../hooks/useSubscriptionPlans';
import { compressImage } from '../../utils/imageCompressor';

const normalizeDepartmentValue = (value: string): 'science' | 'arts' | 'commerce' | '' => {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (['science', 'sci'].includes(normalized)) return 'science';
    if (['arts', 'humanities', 'humanity'].includes(normalized)) return 'arts';
    if (['commerce', 'business', 'business studies'].includes(normalized)) return 'commerce';
    return '';
};

export default function StudentProfile() {
    const mySubscriptionQuery = useMySubscription();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [showCelebration, setShowCelebration] = useState(false);

    const [formData, setFormData] = useState({
        full_name: '',
        date_of_birth: '',
        gender: '',
        address: '',
        guardian_name: '',
        guardian_phone: '',
        ssc_batch: '',
        hsc_batch: '',
        department: '',
        college_name: '',
        phone_number: '',
        preferred_stream: '',
        profile_photo_url: '',
        roll_number: '',
        registration_id: '',
        user_unique_id: ''
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await getStudentProfile();
            setProfile(res.data);
            const celebration = res.data?.celebration;
            if (celebration?.eligible) {
                const todayKey = new Date().toISOString().slice(0, 10);
                const storageKey = `campusway-celebration-${todayKey}`;
                const shownCount = Number(localStorage.getItem(storageKey) || 0);
                const maxShows = Number(celebration.maxShowsPerDay || 1);
                if (shownCount < maxShows) {
                    setShowCelebration(true);
                    localStorage.setItem(storageKey, String(shownCount + 1));
                }
            }
            if (res.data) {
                setFormData({
                    full_name: res.data.full_name || '',
                    date_of_birth: res.data.date_of_birth ? new Date(res.data.date_of_birth).toISOString().split('T')[0] : '',
                    gender: res.data.gender || '',
                    address: res.data.address || '',
                    guardian_name: res.data.guardian_name || '',
                    guardian_phone: res.data.guardian_phone || '',
                    ssc_batch: res.data.ssc_batch || '',
                    hsc_batch: res.data.hsc_batch || '',
                    department: normalizeDepartmentValue(res.data.department || ''),
                    college_name: res.data.college_name || '',
                    phone_number: res.data.phone_number || '',
                    preferred_stream: normalizeDepartmentValue(res.data.preferred_stream || res.data.department || ''),
                    profile_photo_url: res.data.profile_photo_url || '',
                    roll_number: res.data.roll_number || '',
                    registration_id: res.data.registration_id || '',
                    user_unique_id: res.data.user_unique_id || ''
                });
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                full_name: formData.full_name.trim(),
                date_of_birth: formData.date_of_birth || undefined,
                gender: formData.gender || undefined,
                address: formData.address.trim(),
                guardian_name: formData.guardian_name.trim(),
                guardian_phone: formData.guardian_phone.trim(),
                ssc_batch: formData.ssc_batch.trim(),
                hsc_batch: formData.hsc_batch.trim(),
                college_name: formData.college_name.trim(),
                phone_number: formData.phone_number.trim(),
            };
            const normalizedDepartment = normalizeDepartmentValue(formData.department);

            if (normalizedDepartment) {
                payload.department = normalizedDepartment;
            } else {
                delete payload.department;
            }

            const res = await updateStudentProfile(payload);
            if (res.data.pendingRequest) {
                toast.success('Some changes submitted for admin approval');
            } else {
                toast.success('Profile updated');
            }
            fetchProfile(); // refresh data
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordData.currentPassword || !passwordData.newPassword) {
            toast.error('Current password and new password are required');
            return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('New password and confirm password do not match');
            return;
        }

        setPasswordSaving(true);
        try {
            await changePassword(passwordData.currentPassword, passwordData.newPassword);
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            toast.success('Password updated successfully');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to update password');
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'profile_photo') {
            if (!file.type.startsWith('image/')) {
                toast.error('Please upload a valid image file');
                e.target.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Photo size must be 5MB or less');
                e.target.value = '';
                return;
            }
            setPhotoUploading(true);
        }

        const toastId = toast.loading(type === 'profile_photo' ? 'Compressing and uploading photo...' : 'Uploading document...');
        try {
            let fileToUpload = file;
            if (type === 'profile_photo') {
                try {
                    fileToUpload = await compressImage(file, 0.15); // 150KB max
                } catch (err) {
                    console.error('Image compression failed:', err);
                    // fallback to original file if compression fails
                }
            }

            const formDataUpload = new FormData();
            formDataUpload.append('type', type);
            formDataUpload.append('document_type', type);
            formDataUpload.append('file', fileToUpload);

            const res = await uploadStudentDocument(formDataUpload);

            if (type === 'profile_photo') {
                const photoUrl = res.data.url || (res.data as any).absoluteUrl || '';
                setFormData(prev => ({ ...prev, profile_photo_url: photoUrl }));
                setProfile((prev: any) => ({ ...(prev || {}), profile_photo_url: photoUrl }));
                toast.success('Profile photo uploaded successfully', { id: toastId });
            } else {
                toast.success('Document uploaded!', { id: toastId });
                fetchProfile();
            }
        } catch (err: unknown) {
            const errMsg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
                || (err as { message?: string })?.message
                || 'Upload failed';
            toast.error(errMsg, { id: toastId });
        } finally {
            if (type === 'profile_photo') setPhotoUploading(false);
            e.target.value = ''; // reset input
        }
    };

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    );

    const completion = profile?.profile_completion || 0;
    const mySubscription = mySubscriptionQuery.data;
    const examData = profile?.exam_data;

    return (
        <div className="w-full max-w-5xl space-y-6 sm:space-y-8">
            <SEO title="Profile" description="Manage your CampusWay student profile, personal information, and academic details." />
            <AchievementPopupCard
                open={showCelebration}
                onClose={() => setShowCelebration(false)}
                score={Number(profile?.celebration?.topPercentage || 0)}
                rank={profile?.celebration?.bestRank || null}
                message={String(profile?.celebration?.message || 'Excellent performance!')}
                showForSec={Number(profile?.celebration?.showForSec || 10)}
                dismissible={Boolean(profile?.celebration?.dismissible ?? true)}
            />
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile &amp; Documents</h1>
                <p className="text-slate-500 mt-1">Manage your personal information and verified documents</p>
                {mySubscription?.isActive ? (
                    <span className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
                        Active Plan: {mySubscription.planName}
                    </span>
                ) : null}
            </div>

            {profile?.pendingRequest && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-slate-700 p-4 rounded-2xl flex items-center gap-3">
                    <div className="p-2 bg-amber-100 dark:bg-amber-500/20 rounded-full text-amber-600 dark:text-amber-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Profile Update Pending</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">You have a pending profile change request. Some fields may be locked until an admin reviews your request.</p>
                    </div>
                </div>
            )}

            {/* Completion Progress */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2 relative z-10">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Profile Completion</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{completion}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 h-3 rounded-full overflow-hidden relative z-10">
                    <div
                        className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-1000 ease-out"
                        style={{ width: `${completion}%` }}
                    />
                </div>
                {completion < 60 && (
                    <div className="flex items-center gap-2 mt-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p>Complete at least 60% of your profile to apply for universities.</p>
                    </div>
                )}
            </div>

            {examData && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <BookOpen className="w-5 h-5 text-indigo-500" />
                            Exam Data & Records
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">Identity fields, synced result summary, and recent exam history.</p>
                    </div>
                    <div className="p-6 space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Hash className="w-3.5 h-3.5" />Serial ID</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{examData.identity?.serialId || '-'}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Hash className="w-3.5 h-3.5" />Roll / Registration</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{examData.identity?.rollNumber || '-'}</p>
                                <p className="mt-1 text-xs text-slate-500">{examData.identity?.registrationNumber || 'No registration synced yet'}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><MapPin className="w-3.5 h-3.5" />Exam Center</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{examData.identity?.examCenter || '-'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><FileText className="w-4 h-4 text-indigo-500" />Latest Result Summary</p>
                                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{examData.latestResultSummary || 'No result summary available yet.'}</p>
                                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                                    <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />Last sync: {examData.lastSyncAt ? new Date(examData.lastSyncAt).toLocaleString() : 'Never'}</span>
                                    <span>Source: {examData.lastSyncSource || 'n/a'}</span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent Sync Logs</p>
                                <div className="mt-3 space-y-2">
                                    {(examData.syncLogs || []).slice(0, 4).map((log: any) => (
                                        <div key={String(log._id || `${log.source}-${log.createdAt || ''}`)} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
                                            <p className="text-sm font-medium text-slate-800 dark:text-white">{log.source || 'sync'}</p>
                                            <p className="mt-1 text-xs text-slate-500">{log.status || 'unknown'} · {log.syncMode || 'default'}</p>
                                        </div>
                                    ))}
                                    {(!examData.syncLogs || examData.syncLogs.length === 0) && (
                                        <p className="text-sm text-slate-500">No sync logs yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent Exam History</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {(examData.history || []).slice(0, 6).map((item: any) => (
                                    <div key={String(item.examId || item.examSlug || item.examTitle || Math.random())} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.examTitle || 'Exam'}</p>
                                        <p className="mt-1 text-xs text-slate-500">{item.resultStatus || item.examStatus || 'status pending'} · {item.source || 'sync'}</p>
                                        <p className="mt-2 text-xs text-slate-500">{item.examCenter || examData.identity?.examCenter || 'No center recorded'}</p>
                                    </div>
                                ))}
                                {(!examData.history || examData.history.length === 0) && (
                                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No exam history has been synced yet.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Main Form */}
                <div className="xl:col-span-2 space-y-6">
                    <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <User className="w-5 h-5 text-indigo-500" />
                                Personal Information
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5 relative group">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    Full Name {(profile?.full_name && profile?.pendingRequest) && <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter bg-amber-500/10 px-1.5 rounded">Pending Approval</span>}
                                </label>
                                <input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    disabled={Boolean(profile?.full_name && profile?.pendingRequest)}
                                    className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white ${profile?.full_name && profile?.pendingRequest ? 'opacity-70 cursor-not-allowed' : ''}`} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5 relative group">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</label>
                                    <input type="text" value={formData.phone_number} onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                                        disabled={Boolean(profile?.phone_number && profile?.pendingRequest)}
                                        className={`w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white ${profile?.phone_number && profile?.pendingRequest ? 'opacity-70 cursor-not-allowed' : ''}`} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Date of Birth</label>
                                    <input type="date" value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">SSC Batch</label>
                                    <input type="text" placeholder="e.g. 2022" value={formData.ssc_batch} onChange={(e) => setFormData({ ...formData, ssc_batch: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">HSC Batch</label>
                                    <input type="text" placeholder="e.g. 2024" value={formData.hsc_batch} onChange={(e) => setFormData({ ...formData, hsc_batch: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Gender</label>
                                    <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white">
                                        <option value="">Select gender...</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Department Framework</label>
                                    <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white">
                                        <option value="">Select Department</option>
                                        <option value="science">Science (বিজ্ঞান)</option>
                                        <option value="arts">Humanities (মানবিক)</option>
                                        <option value="commerce">Business Studies (ব্যবসায় শিক্ষা)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">College Name</label>
                                <input type="text" value={formData.college_name} onChange={(e) => setFormData({ ...formData, college_name: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Address</label>
                                <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Street, City, State/Province, Country"
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Guardian Name</label>
                                    <input type="text" value={formData.guardian_name} onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Guardian Phone</label>
                                    <input type="text" value={formData.guardian_phone} onChange={(e) => setFormData({ ...formData, guardian_phone: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white" />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Preferred Study Stream</label>
                                <select value={formData.preferred_stream} onChange={(e) => setFormData({ ...formData, preferred_stream: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white">
                                    <option value="">Select a stream...</option>
                                    <option value="science">Science / Engineering / Tech</option>
                                    <option value="commerce">Commerce / Business / Finance</option>
                                    <option value="arts">Arts / Humanities / Social Sciences</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                            <button type="submit" disabled={saving} className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </div>
                    </form>

                    <form onSubmit={handleChangePassword} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <Lock className="w-5 h-5 text-indigo-500" />
                                Change Password
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Current Password</label>
                                <input
                                    type="password"
                                    value={passwordData.currentPassword}
                                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.newPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                            <button type="submit" disabled={passwordSaving} className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Update Password
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sidebar */}
                <div className="space-y-6 xl:sticky xl:top-8 h-max">
                    {/* Profile Photo Upload */}
                    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 opacity-50"></div>

                        <div className="relative p-6 flex flex-col items-center">
                            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-900 dark:text-white self-start w-full border-b border-slate-100 dark:border-slate-700/50 pb-4">
                                <Camera className="w-5 h-5 text-indigo-500" />
                                Profile Photo
                            </h2>

                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-cyan-400 rounded-full blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                                <div className="relative w-36 h-36 rounded-full border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden bg-slate-50 dark:bg-slate-900/50 ring-1 ring-slate-900/5 dark:ring-white/10">
                                    {formData.profile_photo_url ? (
                                        <img
                                            src={formData.profile_photo_url}
                                            alt="Profile"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                            <User className="w-12 h-12 mb-2 opacity-50" />
                                            <span className="text-[10px] font-medium uppercase tracking-wider">No Photo</span>
                                        </div>
                                    )}
                                </div>

                                <label className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white opacity-0 hover:opacity-100 transition-all duration-300 cursor-pointer rounded-full z-10">
                                    <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex flex-col items-center">
                                        <Camera className="w-8 h-8 mb-2 text-white" />
                                        <span className="text-xs font-semibold uppercase tracking-wider drop-shadow-md">Change Photo</span>
                                    </div>
                                    <input id="profile-photo-upload" type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'profile_photo')} disabled={photoUploading} />
                                </label>
                            </div>

                            <label
                                htmlFor="profile-photo-upload"
                                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer relative z-20 ${photoUploading
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20'
                                    }`}
                            >
                                {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {photoUploading ? 'Processing...' : 'Upload New Photo'}
                            </label>

                            <div className="mt-4 flex items-center justify-center gap-2 opacity-70">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Auto-compressed to ~150KB</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

