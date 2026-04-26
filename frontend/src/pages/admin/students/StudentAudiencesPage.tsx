import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Eye, X } from 'lucide-react';
import {
  getAudienceSegments, createAudienceSegment,
  previewAudienceSegment, deleteAudienceSegment,
} from '../../../api/adminStudentApi';
import { showConfirmDialog } from '../../../lib/appDialog';
import { useEscapeKey } from '../../../hooks/useEscapeKey';

type Segment = {
  _id: string; name: string; type: string;
  rules: Record<string, unknown>;
  memberCountCached: number; createdAt: string;
};

const DEPARTMENTS = ['science', 'arts', 'commerce'];
const STATUSES = ['active', 'suspended', 'blocked', 'pending'];

export default function StudentAudiencesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  // Close create modal on Escape key
  const closeCreateModal = useCallback(() => setShowCreate(false), []);
  useEscapeKey(closeCreateModal, showCreate);

  const [name, setName] = useState('');
  const [rules, setRules] = useState({
    departments: [] as string[], batches: [] as string[],
    sscBatches: [] as string[], statuses: [] as string[],
    planCodes: [] as string[], profileScoreRange: null as [number, number] | null,
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ['audience-segments'],
    queryFn: () => getAudienceSegments(),
  });
  const segments: Segment[] = data?.segments ?? [];

  const createMut = useMutation({
    mutationFn: () => createAudienceSegment({ name, rules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audience-segments'] });
      setShowCreate(false);
      setName('');
      setRules({ departments: [], batches: [], sscBatches: [], statuses: [], planCodes: [], profileScoreRange: null });
      setPreviewCount(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAudienceSegment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audience-segments'] }),
  });

  const handlePreview = async () => {
    const res = await previewAudienceSegment(rules);
    setPreviewCount(res.count ?? 0);
  };

  const toggleArr = (key: 'departments' | 'statuses', val: string) => {
    setRules(prev => ({
      ...prev,
      [key]: prev[key].includes(val) ? prev[key].filter((v: string) => v !== val) : [...prev[key], val],
    }));
    setPreviewCount(null);
  };

  const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none';
  const chipActive = 'bg-indigo-600 text-white';
  const chipInactive = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Audience Segments</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{segments.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus size={16} /> New Segment
        </button>
      </div>

      {/* Segment List */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {segments.map(seg => (
          <div key={seg._id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-slate-800 dark:text-white">{seg.name}</h4>
                <p className="mt-1 text-xs text-slate-500">{new Date(seg.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={async () => {
                const confirmed = await showConfirmDialog({
                  title: 'Delete segment',
                  message: 'Delete this segment?',
                  confirmLabel: 'Delete',
                  tone: 'danger',
                });
                if (confirmed) deleteMut.mutate(seg._id);
              }}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                <Users size={12} /> {seg.memberCountCached} students
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(seg.rules || {}).map(([key, val]) => {
                if (!val || (Array.isArray(val) && val.length === 0)) return null;
                return (
                  <span key={key} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                    {key}: {Array.isArray(val) ? val.join(', ') : String(val)}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        {segments.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400">
            No audience segments created yet
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Create Audience Segment</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Segment Name</label>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Science 2025 Active" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Departments</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArr('departments', d)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${rules.departments.includes(d) ? chipActive : chipInactive}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Statuses</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s} type="button" onClick={() => toggleArr('statuses', s)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${rules.statuses.includes(s) ? chipActive : chipInactive}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">HSC Batches (comma-sep)</label>
                  <input className={inputCls} value={rules.batches.join(',')} onChange={e => { setRules(p => ({ ...p, batches: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })); setPreviewCount(null); }} placeholder="2024,2025" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">SSC Batches (comma-sep)</label>
                  <input className={inputCls} value={rules.sscBatches.join(',')} onChange={e => { setRules(p => ({ ...p, sscBatches: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })); setPreviewCount(null); }} placeholder="2022,2023" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Plan Codes (comma-sep)</label>
                <input className={inputCls} value={rules.planCodes.join(',')} onChange={e => { setRules(p => ({ ...p, planCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })); setPreviewCount(null); }} placeholder="BASIC,PREMIUM" />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <button onClick={handlePreview} className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  <Eye size={14} /> Preview Count
                </button>
                {previewCount !== null && (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                    {previewCount} students
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400">
                  Cancel
                </button>
                <button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {createMut.isPending ? 'Creating...' : 'Create Segment'}
                </button>
              </div>
              {createMut.isError && (
                <p className="text-sm text-red-500">{(createMut.error as Error)?.message || 'Error creating segment'}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
