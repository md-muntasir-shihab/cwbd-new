import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Activity, CheckSquare, ChevronDown, ChevronUp, Download, Edit, Loader2, Plus, RefreshCw, Save, Search, Square, Trash2, Upload, X } from 'lucide-react';
import {
  AdminBulkTargetOptions,
  AdminUniversityCluster,
  AdminUniversityCategoryItem,
  AdminUniversityImportCommitResponse,
  AdminUniversityImportInitResponse,
  AdminUniversityImportValidationResponse,
  HomeSettingsConfig,
  ApiUniversity,
  adminBulkDeleteUniversities,
  adminBulkUpdateUniversities,
  adminCommitUniversityImportWithMode,
  adminCreateUniversityCategory,
  adminCreateUniversity,
  adminCreateUniversityCluster,
  adminDeleteUniversityCategory,
  adminDeleteUniversity,
  adminDeleteUniversityCluster,
  adminDeleteUniversityClusterPermanent,
  adminDownloadUniversityImportErrors,
  adminDownloadUniversityImportTemplate,
  adminExportUniversitiesSheet,
  adminGetHomeSettings,
  adminGetUniversities,
  adminGetUniversityCategoryMaster,
  adminGetUniversityCategories,
  adminGetUniversityClusterById,
  adminGetUniversityClusters,
  adminGetUniversityImportJob,
  adminInitUniversityImport,
  adminResolveUniversityClusterMembers,
  adminSyncUniversityCategoryConfig,
  adminSyncUniversityClusterDates,
  adminToggleUniversityCategory,
  adminToggleUniversityStatus,
  adminUpdateHomeSettings,
  adminUpdateUniversity,
  adminUpdateUniversityCategory,
  adminUpdateUniversityCluster,
  adminUploadMedia,
  adminValidateUniversityImport,
} from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useAdminRuntimeFlags } from '../../hooks/useAdminRuntimeFlags';
import { downloadFile } from '../../utils/download';
import { promptForSensitiveActionProof } from '../../utils/sensitiveAction';
import { showConfirmDialog, showPromptDialog } from '../../lib/appDialog';


/** Zod validation schema for university create/edit form */
const universityFormSchema = z.object({
  name: z.string().min(1, 'University name is required').max(300, 'Name must be 300 characters or fewer'),
  shortForm: z.string().min(1, 'Short form / abbreviation is required').max(50, 'Short form must be 50 characters or fewer'),
  category: z.string().min(1, 'Category is required'),
});

type Tab = 'universities' | 'categories' | 'clusters' | 'import';
type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type SortOrder = 'asc' | 'desc';
type BulkAction = '' | 'softDelete' | 'hardDelete' | 'setCluster' | 'setCategory' | 'setStatus' | 'setFeatured' | 'setDescriptions';
type BulkScope = 'selected' | 'filtered' | 'all';


type UniversityForm = Partial<ApiUniversity> & {
  categorySyncLocked?: boolean;
  clusterSyncLocked?: boolean;
  clusterDateOverrides?: {
    applicationStartDate?: string;
    applicationEndDate?: string;
    scienceExamDate?: string;
    artsExamDate?: string;
    businessExamDate?: string;
  };
};

type ClusterForm = {
  name: string;
  slug: string;
  description: string;
  heroImageUrl: string;
  isActive: boolean;
  categoryRules: string[];
  categoryRuleIds: string[];
  manualMembers: string[];
  dates: {
    applicationStartDate?: string;
    applicationEndDate?: string;
    scienceExamDate?: string;
    businessExamDate?: string;
    commerceExamDate?: string;
    artsExamDate?: string;
    admissionWebsite?: string;
    examCentersText?: string;
  };
  homeVisible: boolean;
  homeOrder: number;
  homeFeedMode: 'cluster_only' | 'members_only' | 'both';
};

type FeaturedUniversityEntry = HomeSettingsConfig['featuredUniversities'][number];

const DEFAULT_FORM: UniversityForm = {
  name: '', shortForm: '', category: '', address: '', contactNumber: '', email: '', website: '', admissionWebsite: '',
  totalSeats: '', scienceSeats: '', artsSeats: '', businessSeats: '',
  applicationStartDate: '', applicationEndDate: '', scienceExamDate: '', artsExamDate: '', businessExamDate: '',
  shortDescription: '', description: '', featured: false, featuredOrder: 0, isActive: true, categorySyncLocked: false, clusterSyncLocked: false,
  clusterDateOverrides: { applicationStartDate: '', applicationEndDate: '', scienceExamDate: '', artsExamDate: '', businessExamDate: '' },
};

const DEFAULT_CLUSTER_FORM: ClusterForm = {
  name: '', slug: '', description: '', heroImageUrl: '', isActive: true, categoryRules: [], categoryRuleIds: [], manualMembers: [], dates: {}, homeVisible: false, homeOrder: 0, homeFeedMode: 'both',
};

type CategoryForm = {
  name: string;
  slug: string;
  labelBn: string;
  labelEn: string;
  homeOrder: number;
  homeHighlight: boolean;
  isActive: boolean;
  sharedConfig: {
    applicationStartDate?: string;
    applicationEndDate?: string;
    scienceExamDate?: string;
    artsExamDate?: string;
    businessExamDate?: string;
    examCentersText?: string;
  };
};

const DEFAULT_CATEGORY_FORM: CategoryForm = {
  name: '',
  slug: '',
  labelBn: '',
  labelEn: '',
  homeOrder: 0,
  homeHighlight: false,
  isActive: true,
  sharedConfig: { applicationStartDate: '', applicationEndDate: '', scienceExamDate: '', artsExamDate: '', businessExamDate: '', examCentersText: '' },
};



const IMPORT_FIELDS = [
  'category', 'clusterGroup', 'name', 'shortForm', 'shortDescription', 'description', 'establishedYear', 'address', 'contactNumber', 'email', 'websiteUrl', 'admissionUrl',
  'totalSeats', 'seatsScienceEng', 'seatsArtsHum', 'seatsBusiness',
  'applicationStartDate', 'applicationEndDate', 'examDateScience', 'examDateArts', 'examDateBusiness',
  'examCenters',
];

const COLUMN_MAP: Record<string, string> = {
  name: 'Name',
  shortForm: 'Short',
  category: 'Category',
  clusterGroup: 'Cluster',
  establishedYear: 'Est.',
  applicationStartDate: 'App Start',
  applicationEndDate: 'App End',
  examDateScience: 'Science Exam',
  examDateArts: 'Humanities Exam',
  examDateBusiness: 'Business Exam',
  totalSeats: 'Total Seats',
  seatsScienceEng: 'Science Seats',
  seatsArtsHum: 'Humanities Seats',
  seatsBusiness: 'Business Seats',
  contactNumber: 'Contact',
  address: 'Address',
  updatedAt: 'Updated',
};

const SORT_COLUMNS = Object.keys(COLUMN_MAP);

const COLUMN_VISIBILITY: Record<string, string> = {
  name: "table-cell",
  shortForm: "table-cell",
  category: "table-cell",
  clusterGroup: "hidden xl:table-cell",
  establishedYear: "hidden 2xl:table-cell",
  applicationStartDate: "hidden xl:table-cell",
  applicationEndDate: "hidden xl:table-cell",
  examDateScience: "hidden 2xl:table-cell",
  examDateArts: "hidden 2xl:table-cell",
  examDateBusiness: "hidden 2xl:table-cell",
  totalSeats: "hidden lg:table-cell",
  seatsScienceEng: "hidden 2xl:table-cell",
  seatsArtsHum: "hidden 2xl:table-cell",
  seatsBusiness: "hidden 2xl:table-cell",
  contactNumber: "hidden 2xl:table-cell",
  address: "hidden 2xl:table-cell",
  updatedAt: "hidden md:table-cell",
};

function dateInput(v?: string): string { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); }
function dateText(v?: string): string { if (!v) return 'N/A'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(); }
function numOrUndef(v: unknown): number | undefined { if (v === '' || v === undefined || v === null) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function readErrorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}
function AdminDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">{label}</label>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
      />
    </div>
  );
}

export default function UniversitiesPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const runtimeFlags = useAdminRuntimeFlags();
  const canManageTaxonomy = ['superadmin', 'admin', 'moderator'].includes(String(user?.role || ''));
  const canDeleteTaxonomy = ['superadmin', 'admin'].includes(String(user?.role || ''));
  const [tab, setTab] = useState<Tab>('universities');
  const [universities, setUniversities] = useState<ApiUniversity[]>([]);
  const [allCandidates, setAllCandidates] = useState<ApiUniversity[]>([]);
  const [clusters, setClusters] = useState<AdminUniversityCluster[]>([]);
  const [categoryMaster, setCategoryMaster] = useState<AdminUniversityCategoryItem[]>([]);
  const [categoryFacets, setCategoryFacets] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedHomeCategories, setSelectedHomeCategories] = useState<string[]>([]);
  const [homeFeaturedUniversities, setHomeFeaturedUniversities] = useState<FeaturedUniversityEntry[]>([]);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [clusterFilter, setClusterFilter] = useState('');
  const [categoryStatusView, setCategoryStatusView] = useState<'all' | 'active' | 'inactive'>('all');
  const [clusterStatusView, setClusterStatusView] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [savingHomeSelection, setSavingHomeSelection] = useState(false);
  const [savingHomeFeaturedSelection, setSavingHomeFeaturedSelection] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>('');
  const [bulkScope, setBulkScope] = useState<BulkScope>('selected');
  const [exportScope, setExportScope] = useState<BulkScope>('selected');
  const [targetClusterId, setTargetClusterId] = useState('');
  const [targetCategory, setTargetCategory] = useState('');
  const [targetStatus, setTargetStatus] = useState<'active' | 'inactive'>('active');
  const [targetFeatured, setTargetFeatured] = useState<'featured' | 'not_featured'>('featured');
  const [bulkShortDescription, setBulkShortDescription] = useState('');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const [modalUniversity, setModalUniversity] = useState<null | ApiUniversity | 'create'>(null);
  const [form, setForm] = useState<UniversityForm>(DEFAULT_FORM);
  const [savingUniversity, setSavingUniversity] = useState(false);

  const [clusterModal, setClusterModal] = useState<null | AdminUniversityCluster | 'create'>(null);
  const [clusterForm, setClusterForm] = useState<ClusterForm>(DEFAULT_CLUSTER_FORM);
  const [clusterSearch, setClusterSearch] = useState('');
  const [savingCluster, setSavingCluster] = useState(false);

  const [categoryModal, setCategoryModal] = useState<null | AdminUniversityCategoryItem | 'create'>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(DEFAULT_CATEGORY_FORM);
  const [savingCategory, setSavingCategory] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importInit, setImportInit] = useState<AdminUniversityImportInitResponse | null>(null);
  const [importJobId, setImportJobId] = useState('');
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importDefaults, setImportDefaults] = useState<Record<string, unknown>>({});
  const [importValidation, setImportValidation] = useState<AdminUniversityImportValidationResponse | null>(null);
  const [importCommit, setImportCommit] = useState<AdminUniversityImportCommitResponse | null>(null);
  const [importMode, setImportMode] = useState<'create-only' | 'update-existing'>('update-existing');
  const [initializingImport, setInitializingImport] = useState(false);
  const [validatingImport, setValidatingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [refreshingImportStatus, setRefreshingImportStatus] = useState(false);
  const [importMappingSearch, setImportMappingSearch] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  const pageAllSelected = universities.length > 0 && universities.every((u) => selectedIds.includes(u._id));
  const hasSelection = selectedIds.length > 0;
  const candidateFiltered = useMemo(() => {
    const q = clusterSearch.trim().toLowerCase();
    if (!q) return allCandidates;
    return allCandidates.filter((u) => `${u.name || ''} ${u.shortForm || ''} ${u.category || ''}`.toLowerCase().includes(q));
  }, [allCandidates, clusterSearch]);
  const categoryCountMap = useMemo(
    () => new Map(categoryFacets.map((item) => [item.name, Number(item.count || 0)])),
    [categoryFacets],
  );
  const homeCategoryOptions = useMemo(() => {
    const source = (categoryMaster.length > 0
      ? categoryMaster.map((item, index) => ({
        name: String(item.name || '').trim(),
        label: String(item.labelBn || item.name || '').trim(),
        count: categoryCountMap.get(item.name) || 0,
        order: index,
        isActive: item.isActive !== false,
      }))
      : categoryFacets.map((item, index) => ({
        name: String(item.name || '').trim(),
        label: String(item.name || '').trim(),
        count: Number(item.count || 0),
        order: index,
        isActive: true,
      })))
      .filter((item) => item.isActive !== false);

    const merged = new Map<string, { key: string; name: string; label: string; count: number; order: number }>();
    source.forEach((item) => {
      if (!item.name) return;
      const key = item.name.toLowerCase();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          key,
          name: item.name,
          label: item.label || item.name,
          count: item.count,
          order: item.order,
        });
        return;
      }
      existing.count += item.count;
      if (!existing.label && item.label) existing.label = item.label;
      existing.order = Math.min(existing.order, item.order);
    });

    return Array.from(merged.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [categoryMaster, categoryFacets, categoryCountMap]);
  const categorySelectOptions = useMemo(() => {
    const pool = [...homeCategoryOptions.map((item) => item.name), String(form.category || '').trim()];
    const merged = new Map<string, string>();
    pool.forEach((name) => {
      if (!name) return;
      const normalized = name.toLowerCase();
      if (!merged.has(normalized)) merged.set(normalized, name);
    });
    return Array.from(merged.values());
  }, [homeCategoryOptions, form.category]);
  const featuredHomeUniversities = useMemo(
    () => [...homeFeaturedUniversities]
      .filter((item) => item.enabled !== false && String(item.universityId || '').trim())
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [homeFeaturedUniversities],
  );
  const homeFeaturedOrderMap = useMemo(
    () => new Map(featuredHomeUniversities.map((item, index) => [String(item.universityId), index + 1])),
    [featuredHomeUniversities],
  );
  const visibleCategoryItems = useMemo(() => {
    if (categoryStatusView === 'active') return categoryMaster.filter((item) => item.isActive !== false);
    if (categoryStatusView === 'inactive') return categoryMaster.filter((item) => item.isActive === false);
    return categoryMaster;
  }, [categoryMaster, categoryStatusView]);
  const visibleClusterItems = useMemo(() => {
    if (clusterStatusView === 'active') return clusters.filter((item) => item.isActive !== false);
    if (clusterStatusView === 'inactive') return clusters.filter((item) => item.isActive === false);
    return clusters;
  }, [clusterStatusView, clusters]);
  const mappedImportFields = useMemo(
    () => IMPORT_FIELDS.filter((field) => Boolean(importMapping[field]) || importDefaults[field] !== undefined),
    [importDefaults, importMapping],
  );
  const mappedImportPreviewRows = useMemo(() => {
    const rows = importInit?.sampleRows || [];
    const visibleFields = mappedImportFields.filter((field) => Boolean(importMapping[field]) || importDefaults[field] !== undefined);
    return rows.slice(0, 5).map((row) => visibleFields.reduce<Record<string, unknown>>((acc, field) => {
      const sourceHeader = importMapping[field];
      if (sourceHeader && row[sourceHeader] !== undefined && row[sourceHeader] !== null && row[sourceHeader] !== '') {
        acc[field] = row[sourceHeader];
      } else if (importDefaults[field] !== undefined) {
        acc[field] = importDefaults[field];
      } else {
        acc[field] = '';
      }
      return acc;
    }, {}));
  }, [importDefaults, importInit?.sampleRows, importMapping, mappedImportFields]);

  const importStep: 'upload' | 'mapping' | 'validated' | 'committed' = importCommit ? 'committed' : importValidation ? 'validated' : importInit ? 'mapping' : 'upload';
  const importMappedCount = mappedImportFields.length;
  const importTotalFields = IMPORT_FIELDS.length;
  const importAutoMappedCount = useMemo(() => {
    if (!importInit) return 0;
    return Object.keys(importInit.suggestedMapping || {}).length;
  }, [importInit]);

  const filteredImportFields = useMemo(() => {
    if (!importMappingSearch.trim()) return IMPORT_FIELDS;
    const q = importMappingSearch.trim().toLowerCase();
    return IMPORT_FIELDS.filter((f) => f.toLowerCase().includes(q) || (importMapping[f] || '').toLowerCase().includes(q));
  }, [importMappingSearch, importMapping]);

  const resetImport = () => {
    setImportFile(null);
    setImportInit(null);
    setImportJobId('');
    setImportMapping({});
    setImportDefaults({});
    setImportValidation(null);
    setImportCommit(null);
    setImportMode('update-existing');
    setImportMappingSearch('');
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const autoMapAll = () => {
    if (!importInit) return;
    const guessed: Record<string, string> = {};
    IMPORT_FIELDS.forEach((f) => {
      const m = (importInit.headers || []).find((h) => h.trim().toLowerCase() === f.toLowerCase());
      if (m) guessed[f] = m;
    });
    if (importInit.suggestedMapping) {
      Object.entries(importInit.suggestedMapping).forEach(([k, v]) => { if (v) guessed[k] = v; });
    }
    setImportMapping((prev) => ({ ...prev, ...guessed }));
    toast.success(`Auto-mapped ${Object.keys(guessed).length} fields`);
  };

  const clearAllMappings = () => {
    setImportMapping({});
    toast.success('All mappings cleared');
  };

  const buildActiveFilterPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = { status: statusFilter, sortBy, sortOrder };
    if (query.trim()) payload.q = query.trim();
    if (categoryFilter) payload.category = categoryFilter;
    if (clusterFilter) payload.clusterId = clusterFilter;
    return payload;
  };

  const getBulkTarget = (): string[] | AdminBulkTargetOptions => {
    if (bulkScope === 'all') return { applyToFiltered: true, filter: { status: 'all' } };
    if (bulkScope === 'filtered') return { applyToFiltered: true, filter: buildActiveFilterPayload() };
    return selectedIds;
  };

  const isIdsArrayRequiredError = (error: unknown): boolean => {
    const response = (error as { response?: { status?: number; data?: { message?: string; code?: string } } })?.response;
    const status = Number(response?.status || 0);
    const code = String(response?.data?.code || '').toLowerCase();
    const message = String(response?.data?.message || '').toLowerCase();
    if (status !== 400) return false;
    return (
      message.includes('array of ids')
      || message.includes('ids provided')
      || message.includes('target selection')
      || message.includes('no university targets')
      || code.includes('invalid_ids')
    );
  };

  const collectBulkScopeIds = async (): Promise<string[]> => {
    if (bulkScope === 'selected') return [...selectedIds];
    const baseParams: Record<string, string | number> = {
      page: 1,
      limit: 500,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: bulkScope === 'all' ? 'all' : statusFilter,
    };
    if (bulkScope === 'filtered') {
      if (query.trim()) baseParams.q = query.trim();
      if (categoryFilter) baseParams.category = categoryFilter;
      if (clusterFilter) baseParams.clusterId = clusterFilter;
    }

    const firstPage = await adminGetUniversities(baseParams);
    const fp = firstPage.data as any;
    const firstItems = fp.universities || fp.items || (Array.isArray(fp.data) ? fp.data : Array.isArray(fp) ? fp : []);
    const totalPages = Number(fp.pagination?.pages || fp.meta?.pages || fp.pages || Math.ceil((fp.pagination?.total || fp.meta?.total || fp.total || firstItems.length) / 500) || 1);
    const ids = new Set<string>(firstItems.map((u: ApiUniversity) => String(u._id || '')).filter(Boolean));

    for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
      const pageResponse = await adminGetUniversities({ ...baseParams, page: pageNo });
      const pp = pageResponse.data as any;
      const pageItems = pp.universities || pp.items || (Array.isArray(pp.data) ? pp.data : Array.isArray(pp) ? pp : []);
      pageItems
        .map((u: ApiUniversity) => String(u._id || ''))
        .filter(Boolean)
        .forEach((id: string) => ids.add(id));
    }

    return Array.from(ids);
  };

  const serializeExamCentersText = (centers?: Array<{ city?: string; address?: string }> | string): string => {
    if (typeof centers === 'string') return centers;
    return (centers || [])
      .map((center) => [String(center.city || '').trim(), String(center.address || '').trim()].filter(Boolean).join(' - '))
      .filter(Boolean)
      .join(' | ');
  };

  const invalidateUniversityQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['universities'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['home-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['home_settings'] }),
    ]);
  };

  const loadUniversities = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25, sortBy, sortOrder, status: statusFilter };
      if (query.trim()) params.q = query.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (clusterFilter) params.clusterId = clusterFilter;
      const r = await adminGetUniversities(params);
      const payload = r.data as any;
      // Interceptor unwraps envelope: { items, page, total, pages } or legacy { universities, pagination }
      const items = payload.universities || payload.items || (Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : []);
      const pagination = payload.pagination || payload.meta || payload;
      setUniversities(items);
      setTotalCount(Number(pagination.total || items.length || 0));
      setTotalPages(Number(pagination.pages || Math.ceil((pagination.total || items.length) / 25) || 1));
    } catch {
      toast.error('Failed to load universities');
    } finally { setLoading(false); }
  };

  const loadFacets = async () => {
    try { const r = await adminGetUniversityCategories({ status: statusFilter }); setCategoryFacets(r.data.categories || []); } catch { setCategoryFacets([]); }
  };
  const loadCategoryMaster = async () => {
    try {
      const r = await adminGetUniversityCategoryMaster({ status: 'all' });
      const nextCategories = r.data.categories || [];
      setCategoryMaster(nextCategories);
      setSelectedHomeCategories(
        nextCategories
          .filter((item) => item.isActive !== false && item.homeHighlight)
          .sort((a, b) => Number(a.homeOrder || 0) - Number(b.homeOrder || 0))
          .map((item) => String(item.name || '').trim())
          .filter(Boolean),
      );
    } catch {
      setCategoryMaster([]);
      setSelectedHomeCategories([]);
    }
  };

  const loadClusters = async () => { try { const r = await adminGetUniversityClusters(); setClusters(r.data.clusters || []); } catch { setClusters([]); } };
  const loadCandidates = async () => { try { const r = await adminGetUniversities({ page: 1, limit: 500, status: 'all', sortBy: 'name', sortOrder: 'asc' }); const p = r.data as any; setAllCandidates(p.universities || p.items || (Array.isArray(p.data) ? p.data : Array.isArray(p) ? p : [])); } catch { setAllCandidates([]); } };
  const loadHomeFeaturedUniversities = async () => {
    try {
      const response = await adminGetHomeSettings();
      setHomeFeaturedUniversities(response.data.homeSettings?.featuredUniversities || []);
    } catch {
      setHomeFeaturedUniversities([]);
    }
  };

  useEffect(() => { loadUniversities(); setSelectedIds([]); }, [page, query, categoryFilter, statusFilter, clusterFilter, sortBy, sortOrder]);
  useEffect(() => { loadFacets(); }, [statusFilter]);
  useEffect(() => { loadClusters(); loadCandidates(); void loadCategoryMaster(); void loadHomeFeaturedUniversities(); }, []);

  const toggleSort = (field: string) => {
    if (sortBy === field) { setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc')); return; }
    setSortBy(field); setSortOrder('asc');
  };

  const toggleRowSelection = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleSelectAllCurrentPage = () => {
    const ids = universities.map((u) => u._id);
    if (ids.every((id) => selectedIds.includes(id))) { setSelectedIds((prev) => prev.filter((id) => !ids.includes(id))); return; }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const openCreate = () => { setForm({ ...DEFAULT_FORM }); setModalUniversity('create'); };
  const openEdit = (u: ApiUniversity) => {
    setForm({
      ...DEFAULT_FORM, ...u,
      applicationStartDate: dateInput(u.applicationStartDate),
      applicationEndDate: dateInput(u.applicationEndDate),
      clusterDateOverrides: {
        applicationStartDate: dateInput((u as unknown as { clusterDateOverrides?: { applicationStartDate?: string } }).clusterDateOverrides?.applicationStartDate),
        applicationEndDate: dateInput((u as unknown as { clusterDateOverrides?: { applicationEndDate?: string } }).clusterDateOverrides?.applicationEndDate),
        scienceExamDate: (u as unknown as { clusterDateOverrides?: { scienceExamDate?: string } }).clusterDateOverrides?.scienceExamDate || '',
        artsExamDate: (u as unknown as { clusterDateOverrides?: { artsExamDate?: string } }).clusterDateOverrides?.artsExamDate || '',
        businessExamDate: (u as unknown as { clusterDateOverrides?: { businessExamDate?: string } }).clusterDateOverrides?.businessExamDate || '',
      },
      categorySyncLocked: Boolean((u as unknown as { categorySyncLocked?: boolean }).categorySyncLocked),
      clusterSyncLocked: Boolean((u as unknown as { clusterSyncLocked?: boolean }).clusterSyncLocked),
    });
    setModalUniversity(u);
  };

  const saveUniversity = async () => {
    const validation = universityFormSchema.safeParse({
      name: (form.name || '').trim(),
      shortForm: (form.shortForm || '').trim(),
      category: (form.category || '').trim(),
    });
    if (!validation.success) {
      const zodError = (validation as any).error;
      const issues: Array<{ message: string }> = zodError?.issues ?? [];
      const firstError = issues[0];
      toast.error(firstError?.message || 'Validation failed');
      return;
    }
    setSavingUniversity(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        shortDescription: String(form.shortDescription || '').trim(),
        description: String(form.description || '').trim(),
        established: numOrUndef(form.established),
        featuredOrder: numOrUndef(form.featuredOrder),
        applicationStartDate: form.applicationStartDate || null,
        applicationEndDate: form.applicationEndDate || null,
        clusterDateOverrides: {
          applicationStartDate: form.clusterDateOverrides?.applicationStartDate || null,
          applicationEndDate: form.clusterDateOverrides?.applicationEndDate || null,
          scienceExamDate: form.clusterDateOverrides?.scienceExamDate || '',
          artsExamDate: form.clusterDateOverrides?.artsExamDate || '',
          businessExamDate: form.clusterDateOverrides?.businessExamDate || '',
        },
      };
      if (modalUniversity === 'create') { await adminCreateUniversity(payload); toast.success('University created'); }
      else if (modalUniversity && typeof modalUniversity === 'object') { await adminUpdateUniversity(modalUniversity._id, payload); toast.success('University updated'); }
      await invalidateUniversityQueries();
      setModalUniversity(null); await loadUniversities(); await loadFacets(); await loadCandidates();
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Save failed';
      toast.error(message);
    } finally { setSavingUniversity(false); }
  };

  const deleteOne = async (id: string) => {
    const confirmed = await showConfirmDialog({
      title: 'Delete university?',
      message: 'This will remove the university record. Related data in other collections may be affected.',
      description: 'Deleting this university may impact:\n• Student applications referencing this university\n• Exam questions linked to this university\n• Exams assigned to this university\n• Cluster memberships containing this university',
      confirmLabel: 'Delete university',
      cancelLabel: 'Keep record',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const proof = await promptForSensitiveActionProof({
        actionLabel: 'delete university record',
        defaultReason: `Delete university ${id}`,
        requireOtpHint: true,
      });
      if (!proof) return;
      await adminDeleteUniversity(id, proof);
      toast.success('Deleted');
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadFacets();
      await loadCandidates();
    }
    catch (error: unknown) { toast.error(readErrorMessage(error, 'Delete failed')); }
  };

  const handleBulkAction = async () => {
    if ((bulkScope === 'selected' && !hasSelection) || !bulkAction) return;

    setBulkLoading(true);
    try {
      const target = getBulkTarget();
      if (bulkAction === 'softDelete' || bulkAction === 'hardDelete') {
        const mode = bulkAction === 'softDelete' ? 'soft' : 'hard';
        if (mode === 'hard') {
          if (runtimeFlags.requireDeleteKeywordConfirm) {
            const typed = await showPromptDialog({
              title: 'Confirm permanent delete',
              message: `Type DELETE to permanently remove ${bulkScope === 'selected' ? selectedIds.length : totalCount} universities.`,
              expectedValue: 'DELETE',
              confirmLabel: 'Delete permanently',
              cancelLabel: 'Cancel',
              inputLabel: 'Confirmation keyword',
              tone: 'danger',
            });
            if (typed !== 'DELETE') {
              toast.error('Bulk delete cancelled');
              return;
            }
          } else {
            const confirmed = await showConfirmDialog({
              title: 'Permanently delete universities?',
              message: 'This action cannot be undone.',
              confirmLabel: 'Delete permanently',
              cancelLabel: 'Cancel',
              tone: 'danger',
            });
            if (!confirmed) {
              return;
            }
          }
        }
        let response: Awaited<ReturnType<typeof adminBulkDeleteUniversities>>;
        try {
          response = await adminBulkDeleteUniversities(target, mode, mode === 'hard' ? 'uni-taxonomy' : 'none');
        } catch (error: unknown) {
          const canFallbackToIds = bulkScope !== 'selected' && !Array.isArray(target) && isIdsArrayRequiredError(error);
          if (!canFallbackToIds) throw error;
          const fallbackIds = await collectBulkScopeIds();
          if (fallbackIds.length === 0) {
            toast.error('No universities matched this bulk delete request');
            return;
          }
          response = await adminBulkDeleteUniversities(fallbackIds, mode, mode === 'hard' ? 'uni-taxonomy' : 'none');
        }
        if (response.status === 202 || response.data?.code === 'PENDING_SECOND_APPROVAL') {
          toast.success(response.data?.message || 'Bulk delete request queued for second approval');
        } else if (Number(response.data?.affected || 0) === 0) {
          toast.error('No universities matched this bulk delete request');
        } else {
          toast.success(response.data?.message || `Bulk ${mode} delete successful`);
        }
      } else if (bulkAction === 'setCluster') {
        if (!targetClusterId) { toast.error('Please select a target cluster'); return; }
        await adminBulkUpdateUniversities(target, { clusterId: targetClusterId });
        toast.success('Cluster assigned to selected items');
      } else if (bulkAction === 'setCategory') {
        if (!targetCategory) { toast.error('Please select a target category'); return; }
        await adminBulkUpdateUniversities(target, { category: targetCategory });
        toast.success('Category updated for selected items');
      } else if (bulkAction === 'setStatus') {
        await adminBulkUpdateUniversities(target, { isActive: targetStatus === 'active' });
        toast.success('Status updated for selected items');
      } else if (bulkAction === 'setFeatured') {
        await adminBulkUpdateUniversities(target, { featured: targetFeatured === 'featured' });
        toast.success('Featured flag updated');
      } else if (bulkAction === 'setDescriptions') {
        const shortDescription = bulkShortDescription.trim();
        const description = bulkDescription.trim();
        const descriptionUpdates: Record<string, string> = {};
        if (shortDescription) descriptionUpdates.shortDescription = shortDescription;
        if (description) descriptionUpdates.description = description;
        if (Object.keys(descriptionUpdates).length === 0) {
          toast.error('Enter a short description or full description first');
          return;
        }
        await adminBulkUpdateUniversities(target, descriptionUpdates);
        toast.success('Descriptions updated for selected items');
      }

      setSelectedIds([]);
      setBulkAction('');
      setBulkScope('selected');
      setTargetClusterId('');
      setTargetCategory('');
      setTargetStatus('active');
      setTargetFeatured('featured');
      setBulkShortDescription('');
      setBulkDescription('');
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadFacets();
      await loadCandidates();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Bulk operation failed'));
    } finally {
      setBulkLoading(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const doExport = async (format: 'csv' | 'xlsx') => {
    if (exportScope === 'selected' && selectedIds.length === 0) {
      toast.error('Select at least one university before exporting selected items');
      return;
    }
    setExporting(true);
    try {
      const params: Record<string, string> = { format, sortBy, sortOrder, status: statusFilter };
      if (exportScope !== 'all') {
        if (query.trim()) params.q = query.trim();
        if (categoryFilter) params.category = categoryFilter;
        if (clusterFilter) params.clusterId = clusterFilter;
      }
      if (exportScope === 'selected' && selectedIds.length > 0) params.selectedIds = selectedIds.join(',');
      if (exportScope === 'all') params.status = 'all';
      const r = await adminExportUniversitiesSheet(params);
      const filename = downloadFile(r, { filename: `universities_export.${format}` });
      toast.success(`Exported as ${filename}`);
    } catch (error: unknown) {
      const msg = (error instanceof Error && error.message === 'Sensitive action cancelled')
        ? 'Export cancelled'
        : readErrorMessage(error, 'Export failed — check permissions or try again');
      toast.error(msg);
    } finally { setExporting(false); }
  };

  const saveHomeCategories = async () => {
    setSavingHomeSelection(true);
    try {
      const orderMap = new Map(selectedHomeCategories.map((category, index) => [category, index + 1]));
      await Promise.all(
        categoryMaster.map((item) => {
          const name = String(item.name || '').trim();
          return adminUpdateUniversityCategory(item._id, {
            homeHighlight: orderMap.has(name),
            homeOrder: orderMap.get(name) || 0,
          });
        }),
      );
      await invalidateUniversityQueries();
      await loadCategoryMaster();
      await loadUniversities();
      await loadFacets();
      toast.success('Home categories saved');
    }
    catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Home categories save failed'));
    }
    finally { setSavingHomeSelection(false); }
  };

  const normalizeFeaturedHomeEntries = (entries: FeaturedUniversityEntry[]): FeaturedUniversityEntry[] => entries
    .filter((item) => String(item.universityId || '').trim())
    .map((item, index) => ({
      universityId: String(item.universityId || '').trim(),
      order: index + 1,
      badgeText: String(item.badgeText || 'Featured').trim() || 'Featured',
      enabled: item.enabled !== false,
    }));

  const saveHomeFeaturedUniversities = async (nextEntries: FeaturedUniversityEntry[], successMessage: string) => {
    setSavingHomeFeaturedSelection(true);
    try {
      const normalizedEntries = normalizeFeaturedHomeEntries(nextEntries);
      const response = await adminUpdateHomeSettings({ featuredUniversities: normalizedEntries });
      setHomeFeaturedUniversities(response.data.homeSettings?.featuredUniversities || normalizedEntries);
      await invalidateUniversityQueries();
      await loadUniversities();
      toast.success(successMessage);
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Home featured update failed'));
    } finally {
      setSavingHomeFeaturedSelection(false);
    }
  };

  const toggleUniversityHomeFeatured = async (university: ApiUniversity) => {
    const universityId = String(university._id || '').trim();
    if (!universityId) return;
    const exists = featuredHomeUniversities.some((item) => String(item.universityId) === universityId);
    if (exists) {
      await saveHomeFeaturedUniversities(
        featuredHomeUniversities.filter((item) => String(item.universityId) !== universityId),
        'University removed from Home featured list',
      );
      return;
    }
    await saveHomeFeaturedUniversities(
      [
        ...featuredHomeUniversities,
        {
          universityId,
          order: featuredHomeUniversities.length + 1,
          badgeText: 'Featured',
          enabled: true,
        },
      ],
      'University added to Home featured list',
    );
  };

  const moveUniversityHomeFeatured = async (universityId: string, direction: 'up' | 'down') => {
    const currentIndex = featuredHomeUniversities.findIndex((item) => String(item.universityId) === universityId);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= featuredHomeUniversities.length) return;
    const nextEntries = [...featuredHomeUniversities];
    const [moved] = nextEntries.splice(currentIndex, 1);
    nextEntries.splice(targetIndex, 0, moved);
    await saveHomeFeaturedUniversities(nextEntries, 'Home featured order updated');
  };

  const openClusterCreate = () => { setClusterForm({ ...DEFAULT_CLUSTER_FORM }); setClusterModal('create'); };
  const openClusterEdit = async (cluster: AdminUniversityCluster) => {
    try {
      const r = await adminGetUniversityClusterById(cluster._id);
      const payload = r.data as { cluster?: AdminUniversityCluster & { categoryRuleIds?: string[] }; members?: Array<{ _id: string }> };
      const source = payload.cluster || cluster;
      const memberIds = (payload.members || []).map((m) => String(m._id));
      setClusterForm({
        name: source.name || '', slug: source.slug || '', description: source.description || '', heroImageUrl: source.heroImageUrl || '', isActive: source.isActive !== false,
        categoryRules: source.categoryRules || [],
        categoryRuleIds: source.categoryRuleIds || [],
        manualMembers: memberIds.length ? memberIds : source.memberUniversityIds || [],
        dates: {
          applicationStartDate: dateInput(source.dates?.applicationStartDate),
          applicationEndDate: dateInput(source.dates?.applicationEndDate),
          scienceExamDate: dateInput(source.dates?.scienceExamDate),
          businessExamDate: dateInput(source.dates?.businessExamDate || source.dates?.commerceExamDate),
          commerceExamDate: dateInput(source.dates?.commerceExamDate || source.dates?.businessExamDate),
          artsExamDate: dateInput(source.dates?.artsExamDate),
          admissionWebsite: source.dates?.admissionWebsite || '',
          examCentersText: serializeExamCentersText(source.dates?.examCenters),
        }, homeVisible: Boolean(source.homeVisible), homeOrder: Number(source.homeOrder || 0),
        homeFeedMode: (['cluster_only', 'members_only', 'both'].includes(String((source as { homeFeedMode?: string }).homeFeedMode || '')) ? (source as { homeFeedMode?: string }).homeFeedMode! : 'both') as ClusterForm['homeFeedMode'],
      });
      setClusterModal(source);
    } catch { toast.error('Cluster details load failed'); }
  };

  const saveCluster = async () => {
    if (!clusterForm.name.trim()) { toast.error('Cluster name required'); return; }
    setSavingCluster(true);
    try {
      const payload = {
        name: clusterForm.name, slug: clusterForm.slug, description: clusterForm.description, heroImageUrl: clusterForm.heroImageUrl, isActive: clusterForm.isActive,
        categoryRules: clusterForm.categoryRules,
        categoryRuleIds: clusterForm.categoryRuleIds,
        memberUniversityIds: clusterForm.manualMembers,
        dates: {
          applicationStartDate: clusterForm.dates.applicationStartDate || undefined,
          applicationEndDate: clusterForm.dates.applicationEndDate || undefined,
          scienceExamDate: clusterForm.dates.scienceExamDate || '',
          businessExamDate: clusterForm.dates.businessExamDate || clusterForm.dates.commerceExamDate || '',
          commerceExamDate: clusterForm.dates.businessExamDate || clusterForm.dates.commerceExamDate || '',
          artsExamDate: clusterForm.dates.artsExamDate || '',
          admissionWebsite: String(clusterForm.dates.admissionWebsite || '').trim(),
          examCenters: clusterForm.dates.examCentersText || '',
        },
        homeVisible: clusterForm.homeVisible, homeOrder: Number(clusterForm.homeOrder || 0),
        homeFeedMode: clusterForm.homeFeedMode,
      };
      if (clusterModal === 'create') await adminCreateUniversityCluster(payload);
      else if (clusterModal && typeof clusterModal === 'object') await adminUpdateUniversityCluster(clusterModal._id, payload);
      toast.success('Cluster saved');
      await invalidateUniversityQueries();
      setClusterModal(null);
      await loadClusters();
      await loadUniversities();
      await loadCandidates();
      await loadCategoryMaster();
    } catch (error: unknown) { toast.error(readErrorMessage(error, 'Cluster save failed')); }
    finally { setSavingCluster(false); }
  };

  const resolveCluster = async (id: string) => {
    try {
      await adminResolveUniversityClusterMembers(id);
      toast.success('Resolved');
      await invalidateUniversityQueries();
      await loadClusters();
      await loadUniversities();
      await loadCandidates();
    } catch (e) { toast.error('Resolve failed'); }
  };
  const syncCluster = async (id: string, dates?: ClusterForm['dates']) => {
    try {
      const p = dates ? {
        applicationStartDate: dates.applicationStartDate || null,
        applicationEndDate: dates.applicationEndDate || null,
        scienceExamDate: dates.scienceExamDate || '',
        businessExamDate: dates.businessExamDate || dates.commerceExamDate || '',
        commerceExamDate: dates.businessExamDate || dates.commerceExamDate || '',
        artsExamDate: dates.artsExamDate || '',
        admissionWebsite: String(dates.admissionWebsite || '').trim(),
        examCenters: dates.examCentersText || '',
      } : undefined;
      await adminSyncUniversityClusterDates(id, p);
      toast.success('Cluster shared config synced');
      await invalidateUniversityQueries();
      await loadUniversities();
    } catch (e) { toast.error('Cluster sync failed'); }
  };
  const deactivateCluster = async (id: string) => {
    const confirmed = await showConfirmDialog({
      title: 'Deactivate cluster?',
      message: 'The cluster will stop being treated as active in admin and public cluster views.',
      confirmLabel: 'Deactivate cluster',
      cancelLabel: 'Keep active',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const proof = await promptForSensitiveActionProof({
        actionLabel: 'deactivate university cluster',
        defaultReason: `Deactivate university cluster ${id}`,
        requireOtpHint: true,
      });
      if (!proof) return;
      await adminDeleteUniversityCluster(id, proof);
      toast.success('Cluster deactivated');
      await invalidateUniversityQueries();
      await loadClusters();
      await loadUniversities();
      await loadCandidates();
    } catch (error: unknown) { toast.error(readErrorMessage(error, 'Deactivate failed')); }
  };
  const permanentDeleteCluster = async (cluster: AdminUniversityCluster) => {
    const memberCount = Number(cluster.memberCount || cluster.memberUniversityIds?.length || 0);

    let deleteMode: 'cluster_only' | 'cascade' | 'detach' = 'cluster_only';

    if (memberCount > 0) {
      // Show choice dialog for non-empty clusters
      const choice = await showConfirmDialog({
        title: `Delete cluster "${cluster.name}"?`,
        message: `This cluster has ${memberCount} linked ${memberCount === 1 ? 'university' : 'universities'}. Choose how to proceed:`,
        description: '• "Delete All" — Cluster and all linked universities will be archived.\n• "Detach & Delete" — Cluster is deleted, universities are kept but detached.\n• Cancel to abort.',
        confirmLabel: 'Delete All (Cascade)',
        cancelLabel: 'Cancel',
        tone: 'danger',
      });
      if (!choice) {
        // Try detach option
        const detachChoice = await showConfirmDialog({
          title: `Detach universities instead?`,
          message: `Keep all ${memberCount} universities safe and only delete the cluster "${cluster.name}"?`,
          description: 'Universities will be detached from this cluster but remain active.',
          confirmLabel: 'Detach & Delete Cluster',
          cancelLabel: 'Cancel',
          tone: 'danger',
        });
        if (!detachChoice) return;
        deleteMode = 'detach';
      } else {
        deleteMode = 'cascade';
      }
    } else {
      const confirmed = await showConfirmDialog({
        title: 'Permanently delete cluster?',
        message: `This will permanently remove "${cluster.name}".`,
        description: 'This empty cluster will be permanently deleted.',
        confirmLabel: 'Delete permanently',
        cancelLabel: 'Cancel',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    try {
      const proof = await promptForSensitiveActionProof({
        actionLabel: 'permanently delete university cluster',
        defaultReason: deleteMode === 'cascade'
          ? `Permanently delete cluster ${cluster._id} and all ${memberCount} linked universities`
          : deleteMode === 'detach'
            ? `Delete cluster ${cluster._id}, detach ${memberCount} universities`
            : `Permanently delete empty cluster ${cluster._id}`,
        requireOtpHint: true,
      });
      if (!proof) return;
      await adminDeleteUniversityClusterPermanent(cluster._id, proof, deleteMode);
      toast.success(
        deleteMode === 'cascade'
          ? `Cluster and ${memberCount} universities deleted`
          : deleteMode === 'detach'
            ? `Cluster deleted, ${memberCount} universities detached`
            : 'Cluster permanently deleted',
      );
      await invalidateUniversityQueries();
      await loadClusters();
      await loadUniversities();
      await loadCandidates();
      await loadCategoryMaster();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Permanent delete failed'));
    }
  };

  const initImport = async () => {
    if (!importFile) { toast.error('Please choose a CSV/XLSX file'); return; }
    setInitializingImport(true);
    try {
      const r = await adminInitUniversityImport(importFile);
      setImportInit(r.data); setImportJobId(r.data.importJobId); setImportValidation(null); setImportCommit(null);
      const guessed: Record<string, string> = { ...(r.data.suggestedMapping || {}) };
      if (Object.keys(guessed).length === 0) {
        IMPORT_FIELDS.forEach((f) => {
          const m = (r.data.headers || []).find((h) => h.trim().toLowerCase() === f.toLowerCase());
          if (m) guessed[f] = m;
        });
      }
      setImportMapping(guessed); setImportDefaults({}); toast.success('Import initialized');
    } catch (e: unknown) { toast.error(readErrorMessage(e, 'Import init failed')); }
    finally { setInitializingImport(false); }
  };

  const validateImport = async () => {
    if (!importJobId) { toast.error('Job id missing'); return; }
    setValidatingImport(true);
    try {
      const r = await adminValidateUniversityImport(importJobId, importMapping, importDefaults);
      setImportValidation(r.data);
      setImportCommit(null);
      toast.success('Validated');
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Validation failed'));
    } finally { setValidatingImport(false); }
  };
  const commitImport = async () => {
    if (!importJobId) { toast.error('Job id missing'); return; }
    setCommittingImport(true);
    try {
      const r = await adminCommitUniversityImportWithMode(importJobId, importMode);
      setImportCommit(r.data);
      toast.success('Commit complete');
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadFacets();
      await loadCandidates();
      await loadCategoryMaster();
      await loadClusters();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Commit failed'));
    } finally { setCommittingImport(false); }
  };
  const refreshImport = async () => {
    if (!importJobId) { toast.error('Job id missing'); return; }
    setRefreshingImportStatus(true);
    try {
      const r = await adminGetUniversityImportJob(importJobId);
      setImportValidation(r.data);
      if (r.data.commitSummary) setImportCommit(r.data);
      if (r.data.mapping) setImportMapping(r.data.mapping);
      if (r.data.defaults) setImportDefaults(r.data.defaults);
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Refresh failed'));
    } finally { setRefreshingImportStatus(false); }
  };
  const downloadErrors = async () => { if (!importJobId) return; try { const r = await adminDownloadUniversityImportErrors(importJobId); downloadFile(r, { filename: `university_import_errors_${importJobId}.csv` }); } catch (e) { toast.error('Download failed'); } };
  const downloadTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      const r = await adminDownloadUniversityImportTemplate(format);
      downloadFile(r, { filename: `university_import_template.${format}` });
      toast.success('Template downloaded');
    } catch {
      toast.error('Template download failed');
    }
  };

  const openCategoryCreate = () => { setCategoryForm({ ...DEFAULT_CATEGORY_FORM }); setCategoryModal('create'); };
  const openCategoryEdit = (item: AdminUniversityCategoryItem) => {
    setCategoryForm({
      name: item.name || '',
      slug: item.slug || '',
      labelBn: item.labelBn || '',
      labelEn: item.labelEn || '',
      homeOrder: Number(item.homeOrder || 0),
      homeHighlight: Boolean(item.homeHighlight),
      isActive: item.isActive !== false,
      sharedConfig: {
        applicationStartDate: dateInput(item.sharedConfig?.applicationStartDate || undefined),
        applicationEndDate: dateInput(item.sharedConfig?.applicationEndDate || undefined),
        scienceExamDate: item.sharedConfig?.scienceExamDate || '',
        artsExamDate: item.sharedConfig?.artsExamDate || '',
        businessExamDate: item.sharedConfig?.businessExamDate || '',
        examCentersText: serializeExamCentersText(item.sharedConfig?.examCenters),
      },
    });
    setCategoryModal(item);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) { toast.error('Category name required'); return; }
    setSavingCategory(true);
    try {
      const payload = {
        ...categoryForm,
        homeOrder: Number(categoryForm.homeOrder || 0),
        sharedConfig: {
          applicationStartDate: categoryForm.sharedConfig.applicationStartDate || null,
          applicationEndDate: categoryForm.sharedConfig.applicationEndDate || null,
          scienceExamDate: categoryForm.sharedConfig.scienceExamDate || '',
          artsExamDate: categoryForm.sharedConfig.artsExamDate || '',
          businessExamDate: categoryForm.sharedConfig.businessExamDate || '',
          examCenters: categoryForm.sharedConfig.examCentersText || '',
        },
      };
      if (categoryModal === 'create') await adminCreateUniversityCategory(payload);
      else if (categoryModal && typeof categoryModal === 'object') await adminUpdateUniversityCategory(categoryModal._id, payload);
      toast.success('Category saved');
      await invalidateUniversityQueries();
      setCategoryModal(null);
      await loadUniversities();
      await loadCategoryMaster();
      await loadFacets();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Category save failed'));
    } finally {
      setSavingCategory(false);
    }
  };

  const syncCategory = async () => {
    if (!categoryModal || categoryModal === 'create') return;
    try {
      const response = await adminSyncUniversityCategoryConfig(categoryModal._id, {
        sharedConfig: {
          applicationStartDate: categoryForm.sharedConfig.applicationStartDate || null,
          applicationEndDate: categoryForm.sharedConfig.applicationEndDate || null,
          scienceExamDate: categoryForm.sharedConfig.scienceExamDate || '',
          artsExamDate: categoryForm.sharedConfig.artsExamDate || '',
          businessExamDate: categoryForm.sharedConfig.businessExamDate || '',
          examCenters: categoryForm.sharedConfig.examCentersText || '',
        },
      } as Partial<AdminUniversityCategoryItem>);
      toast.success(`Category synced: ${response.data.syncResult.synced} updated, ${response.data.syncResult.skipped} skipped`);
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadCategoryMaster();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Category sync failed'));
    }
  };

  const syncCategoryItem = async (item: AdminUniversityCategoryItem) => {
    try {
      const response = await adminSyncUniversityCategoryConfig(item._id, {
        sharedConfig: {
          applicationStartDate: item.sharedConfig?.applicationStartDate || null,
          applicationEndDate: item.sharedConfig?.applicationEndDate || null,
          scienceExamDate: item.sharedConfig?.scienceExamDate || '',
          artsExamDate: item.sharedConfig?.artsExamDate || '',
          businessExamDate: item.sharedConfig?.businessExamDate || '',
          examCenters: serializeExamCentersText(item.sharedConfig?.examCenters),
        },
      } as Partial<AdminUniversityCategoryItem>);
      toast.success(`Category synced: ${response.data.syncResult.synced} updated, ${response.data.syncResult.skipped} skipped`);
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadCategoryMaster();
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Category sync failed'));
    }
  };

  const toggleCategory = async (id: string) => {
    try {
      await adminToggleUniversityCategory(id);
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadCategoryMaster();
      await loadFacets();
      toast.success('Category status updated');
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Update failed'));
    }
  };

  const archiveCategory = async (id: string) => {
    const confirmed = await showConfirmDialog({
      title: 'Archive category?',
      message: 'The category will be marked inactive and removed from normal browse ordering.',
      confirmLabel: 'Archive category',
      cancelLabel: 'Keep category',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const proof = await promptForSensitiveActionProof({
        actionLabel: 'archive university category',
        defaultReason: `Archive university category ${id}`,
        requireOtpHint: true,
      });
      if (!proof) return;
      await adminDeleteUniversityCategory(id, proof);
      await invalidateUniversityQueries();
      await loadUniversities();
      await loadCategoryMaster();
      await loadFacets();
      toast.success('Category archived');
    } catch (error: unknown) {
      toast.error(readErrorMessage(error, 'Archive failed'));
    }
  };

  const sortArrow = (key: string) => sortBy !== key ? <ChevronDown className="w-3 h-3 opacity-40" /> : (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-indigo-500/15 bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 backdrop-blur-md p-4 md:p-5 shadow-xl shadow-indigo-900/20 ring-1 ring-indigo-500/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">University Management <span className="text-xs font-medium text-indigo-300/80">(Admin Console)</span></h2>
            <p className="text-sm text-slate-400">Manage university data, clusters, and bulk imports with premium glassmorphism.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadUniversities()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-all"><RefreshCw className="w-4 h-4" /> Refresh</button>
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all"><Plus className="w-4 h-4" /> Add University</button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(['universities', 'categories', 'clusters', 'import'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${tab === t ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/10' : 'border border-slate-700/40 bg-slate-900/40 text-slate-400 hover:text-white hover:border-indigo-500/30'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'universities' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <label className="xl:col-span-2 relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name/short form/category" className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 py-2 pl-9 pr-3 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
              </label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                <option value="">All categories</option>
                {homeCategoryOptions.map((cat) => <option key={cat.key} value={cat.name}>{cat.label} ({cat.count})</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                <option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
              </select>
              <select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)} className="rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                <option value="">All Clusters</option>
                {clusters.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={exportScope} onChange={(e) => setExportScope(e.target.value as BulkScope)} className="rounded-lg border border-slate-700/40 bg-slate-950/50 px-3 py-1.5 text-xs text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                <option value="selected">Export Selected</option>
                <option value="filtered">Export Filtered</option>
                <option value="all">Export All</option>
              </select>
              <button type="button" disabled={exporting} onClick={() => void doExport('csv')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-40 transition-all">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} CSV</button>
              <button type="button" disabled={exporting} onClick={() => void doExport('xlsx')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-40 transition-all">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} XLSX</button>
              <p className="text-xs text-slate-400 ml-auto">Selected: {selectedIds.length} | Total: {totalCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03]">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Home Category Highlight</h3>
              <button type="button" disabled={savingHomeSelection} onClick={() => void saveHomeCategories()} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 disabled:opacity-60 transition-all">{savingHomeSelection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {homeCategoryOptions.map((cat) => {
                const active = selectedHomeCategories.includes(cat.name);
                return <button key={cat.key} type="button" onClick={() => setSelectedHomeCategories((prev) => prev.includes(cat.name) ? prev.filter((x) => x !== cat.name) : [...prev, cat.name])} className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-lg shadow-indigo-500/20' : 'border border-slate-700/40 bg-slate-950/50 text-slate-400 hover:text-white hover:border-indigo-500/30'}`}>{cat.label} ({cat.count})</button>;
              })}
            </div>
          </div>

          {(
            <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Bulk Action</label>
                  <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as BulkAction)} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                    <option value="">Select Action</option>
                    <option value="softDelete">Soft Delete</option>
                    <option value="hardDelete">Hard Delete</option>
                    <option value="setCluster">Set Cluster</option>
                    <option value="setCategory">Set Category</option>
                    <option value="setStatus">Set Status</option>
                    <option value="setFeatured">Set Featured Flag</option>
                    <option value="setDescriptions">Set Descriptions</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Apply Scope</label>
                  <select value={bulkScope} onChange={(e) => setBulkScope(e.target.value as BulkScope)} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                    <option value="selected">Selected Items</option>
                    <option value="filtered">All Filtered Results</option>
                    <option value="all">All Universities</option>
                  </select>
                </div>
                {bulkAction === 'setCluster' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Target Cluster</label>
                    <select value={targetClusterId} onChange={(e) => setTargetClusterId(e.target.value)} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                      <option value="">Choose...</option>{clusters.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {bulkAction === 'setCategory' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Target Category</label>
                    <select value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                      <option value="">Choose...</option>{categorySelectOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                )}
                {bulkAction === 'setStatus' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Target Status</label>
                    <select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as 'active' | 'inactive')} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
                {bulkAction === 'setFeatured' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Featured</label>
                    <select value={targetFeatured} onChange={(e) => setTargetFeatured(e.target.value as 'featured' | 'not_featured')} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                      <option value="featured">Featured</option>
                      <option value="not_featured">Not Featured</option>
                    </select>
                  </div>
                )}
                {bulkAction === 'setDescriptions' && (
                  <div className="sm:col-span-2 lg:col-span-4 xl:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Description Content</label>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <textarea
                        value={bulkShortDescription}
                        onChange={(e) => setBulkShortDescription(e.target.value)}
                        rows={3}
                        placeholder="Short description for cards, search snippets, and SEO summary"
                        className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y"
                      />
                      <textarea
                        value={bulkDescription}
                        onChange={(e) => setBulkDescription(e.target.value)}
                        rows={3}
                        placeholder="Full description for the public university details page"
                        className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y"
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Only the boxes you fill in will overwrite existing values. Leave a box empty to keep that field unchanged.
                    </p>
                  </div>
                )}
                <button type="button" disabled={(bulkScope === 'selected' && selectedIds.length === 0) || !bulkAction || bulkLoading} onClick={() => void handleBulkAction()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 hover:opacity-90 disabled:opacity-40 transition-all">
                  {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Apply to {bulkScope === 'selected' ? selectedIds.length : bulkScope === 'filtered' ? 'filtered results' : 'all universities'}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm overflow-hidden ring-1 ring-white/[0.03] shadow-lg shadow-black/10">
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-950/60 text-slate-300/90">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <button type="button" onClick={toggleSelectAllCurrentPage} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        {pageAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    {SORT_COLUMNS.map((k) => (
                      <th key={k} className={`px-3 py-3 text-left whitespace-nowrap font-bold tracking-wider uppercase ${COLUMN_VISIBILITY[k] || ''}`}>
                        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 group">
                          {COLUMN_MAP[k]}
                          <span className="transition-all duration-200 group-hover:scale-110">{sortArrow(k)}</span>
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-left sticky right-0 bg-slate-900/90 backdrop-blur-md z-10 shadow-[-4px_0_10px_rgba(0,0,0,0.2)] font-bold tracking-wider uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {loading ? (
                    <tr><td colSpan={SORT_COLUMNS.length + 2} className="px-3 py-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" /> Loading data...</td></tr>
                  ) : universities.length === 0 ? (
                    <tr><td colSpan={SORT_COLUMNS.length + 2} className="px-3 py-12 text-center text-slate-500">No universities found</td></tr>
                  ) : (
                    universities.map((u) => {
                      const isAdmissionOpen = u.applicationEndDate && new Date(u.applicationEndDate) > new Date();
                      return (
                        <tr key={u._id} className="hover:bg-indigo-500/[0.05] transition-colors group">
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => toggleRowSelection(u._id)} className="text-indigo-400/60 group-hover:text-indigo-400 transition-colors">
                              {selectedIds.includes(u._id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                          </td>
                          {SORT_COLUMNS.map((k) => {
                            const val = (u as any)[k];
                            let display: React.ReactNode = val || '-';
                            if (k === 'name') {
                              display = (
                                <div className="flex items-center gap-2 min-w-[160px]">
                                  {u.logoUrl ? (
                                    <img src={u.logoUrl.startsWith('http') ? u.logoUrl : `https://campusway-backend.onrender.com/${u.logoUrl}`} alt="" className="w-6 h-6 rounded-md object-cover ring-1 ring-white/10 flex-shrink-0" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-indigo-300">{(u.shortForm || u.name || '?').slice(0, 2).toUpperCase()}</div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-white font-bold truncate">{u.name || '-'}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${u.isActive !== false ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                      <span className={`text-[9px] ${u.isActive !== false ? 'text-emerald-400' : 'text-slate-500'}`}>{u.isActive !== false ? 'Active' : 'Inactive'}</span>
                                      {isAdmissionOpen && <span className="text-[9px] text-cyan-400 ml-1">• Open</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            } else if (k === 'category') {
                              display = <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 whitespace-nowrap">{val || '-'}</span>;
                            } else if (k === 'clusterGroup') {
                              display = val ? <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 whitespace-nowrap">{val}</span> : <span className="text-slate-600">—</span>;
                            } else if (k === 'totalSeats' || k === 'seatsScienceEng' || k === 'seatsArtsHum' || k === 'seatsBusiness') {
                              const num = Number(val);
                              display = Number.isFinite(num) && num > 0 ? num.toLocaleString() : <span className="text-slate-600">N/A</span>;
                            } else if (k.toLowerCase().includes('date') && !k.toLowerCase().includes('desc')) {
                              display = dateText(val);
                            } else if (k === 'updatedAt') {
                              display = dateText(val);
                            }
                            return (
                              <td key={k} className={`px-3 py-2.5 ${COLUMN_VISIBILITY[k] || ''} ${k === 'name' ? '' : 'text-slate-400'} max-w-[200px] truncate`} title={String(val || '')}>
                                {display}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 sticky right-0 bg-slate-900/90 backdrop-blur-md shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.3)] z-10">
                            <div className="flex flex-col gap-1 min-w-[90px]">
                              <div className="flex items-center gap-1">
                                {homeFeaturedOrderMap.has(u._id) ? (
                                  <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-200">
                                    #{homeFeaturedOrderMap.get(u._id)}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={savingHomeFeaturedSelection}
                                  onClick={() => void toggleUniversityHomeFeatured(u)}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-all disabled:opacity-40 ${homeFeaturedOrderMap.has(u._id) ? 'bg-cyan-500/10 text-cyan-300' : 'bg-sky-500/10 text-sky-300'}`}
                                >
                                  {homeFeaturedOrderMap.has(u._id) ? 'Hide' : 'Show'}
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => openEdit(u)} className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">Edit</button>
                                <button type="button" onClick={() => void adminToggleUniversityStatus(u._id).then(async () => { await invalidateUniversityQueries(); await loadUniversities(); })} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${u.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{u.isActive ? 'Off' : 'On'}</button>
                                <button type="button" onClick={() => void deleteOne(u._id)} className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">Del</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-700/20">
              <div className="flex items-center justify-between gap-3 border-b border-slate-700/20 bg-slate-950/40 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Mobile Selection</p>
                  <p className="mt-1 text-sm font-semibold text-white">{selectedIds.length} selected on this view</p>
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAllCurrentPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200"
                >
                  {pageAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  {pageAllSelected ? 'Unselect Page' : 'Select Page'}
                </button>
              </div>
              {loading ? (
                <div className="p-8 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto opacity-50" /></div>
              ) : universities.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No data found</div>
              ) : (
                universities.map((u) => (
                  <article key={u._id} className="p-4 space-y-3 hover:bg-indigo-500/[0.03] transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => toggleRowSelection(u._id)} className="text-indigo-400">
                          {selectedIds.includes(u._id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        </button>
                        <div>
                          <p className="text-sm font-bold text-white tracking-tight">{u.name || '-'}</p>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-400/80">{u.shortForm || '-'} | {u.category || '-'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(u)} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-all"><Edit className="w-3.5 h-3.5" /> Edit</button>
                        <button type="button" onClick={() => void deleteOne(u._id)} className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-700/20 bg-slate-950/30 p-3 text-[11px] sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-slate-500">App Start</p><p className="text-emerald-400 font-bold">{dateText(u.applicationStartDate)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">App End</p><p className="text-rose-400 font-bold">{dateText(u.applicationEndDate)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Seats</p><p className="text-slate-100 font-medium">{u.totalSeats || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Cluster</p><p className="text-indigo-300 font-bold italic">{u.clusterName || u.clusterGroup || 'None'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-500">Home</p>
                        <p className="font-bold text-cyan-200">{homeFeaturedOrderMap.has(u._id) ? `Featured #${homeFeaturedOrderMap.get(u._id)}` : 'Not on Home'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingHomeFeaturedSelection}
                        onClick={() => void toggleUniversityHomeFeatured(u)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-40 ${homeFeaturedOrderMap.has(u._id) ? 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20' : 'bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'}`}
                      >
                        {homeFeaturedOrderMap.has(u._id) ? 'Hide Home' : 'Show Home'}
                      </button>

                      {homeFeaturedOrderMap.has(u._id) && (
                        <>
                          <button
                            type="button"
                            disabled={savingHomeFeaturedSelection || (homeFeaturedOrderMap.get(u._id) || 0) <= 1}
                            onClick={() => void moveUniversityHomeFeatured(u._id, 'up')}
                            className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40"
                          >
                            Move Up
                          </button>
                          <button
                            type="button"
                            disabled={savingHomeFeaturedSelection || (homeFeaturedOrderMap.get(u._id) || 0) >= featuredHomeUniversities.length}
                            onClick={() => void moveUniversityHomeFeatured(u._id, 'down')}
                            className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40"
                          >
                            Move Down
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => void adminToggleUniversityStatus(u._id).then(async () => { await invalidateUniversityQueries(); await loadUniversities(); })} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${u.isActive ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/20'}`}>{u.isActive ? 'Disable' : 'Enable'}</button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-2 pt-2 text-[11px] font-bold tracking-widest uppercase text-slate-500">
            <span>Page {page} of {Math.max(1, totalPages)}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2 text-white hover:bg-indigo-500/20 disabled:opacity-30 transition-all shadow-lg">Prev</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2 text-white hover:bg-indigo-500/20 disabled:opacity-30 transition-all shadow-lg">Next</button>
            </div>
          </div>
        </section>
      )}

      {tab === 'categories' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03] flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Category Management</h3>
            <button
              type="button"
              onClick={openCategoryCreate}
              disabled={!canManageTaxonomy}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 p-4 text-sm text-amber-100">
            Archive only hides a category from active use. Linked universities stay intact and can be managed or reassigned later.
            <div className="mt-3 flex flex-wrap gap-2">
              {(['all', 'active', 'inactive'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCategoryStatusView(view)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${categoryStatusView === view ? 'bg-white text-slate-900' : 'border border-white/15 text-amber-100 hover:bg-white/10'}`}
                >
                  {view === 'all' ? 'All' : view === 'active' ? 'Active' : 'Archived / Inactive'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleCategoryItems.length === 0 ? (
              <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-12 text-center text-slate-500">No categories found.</div>
            ) : visibleCategoryItems.map((item) => (
              <article key={item._id} className="rounded-xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-4 space-y-3 ring-1 ring-white/[0.03] hover:border-indigo-500/25 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.labelBn || item.name}</p>
                    <p className="text-[10px] text-slate-500 tracking-wider">{item.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${item.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                    {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-700/20 bg-slate-950/30 p-3 text-[11px] sm:grid-cols-2">
                  <p className="text-slate-500 font-medium">Universities</p><p className="text-indigo-300 font-bold">{item.count || 0}</p>
                  <p className="text-slate-500 font-medium">Home</p><p className="text-slate-300 font-bold">{item.homeHighlight ? `Highlighted (#${item.homeOrder || 0})` : 'Normal'}</p>
                  <p className="text-slate-500 font-medium">Last Sync</p><p className="text-slate-300 font-bold">{item.syncMeta?.lastSyncedAt ? dateText(item.syncMeta.lastSyncedAt) : 'Never'}</p>
                  <p className="text-slate-500 font-medium">Shared Centers</p><p className="text-slate-300 font-bold">{item.sharedConfig?.examCenters?.length || 0}</p>
                </div>
                <div className="rounded-xl border border-slate-700/20 bg-slate-950/30 px-3 py-2 text-[11px] text-slate-400">
                  Archive does not delete universities. Use Enable to restore visibility later.
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => openCategoryEdit(item)} className="rounded-full bg-indigo-500/10 px-2 py-1.5 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => void syncCategoryItem(item)} className="rounded-full bg-cyan-500/10 px-2 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Sync</button>
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => void toggleCategory(item._id)} className="rounded-full bg-emerald-500/10 px-2 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">{item.isActive ? 'Disable' : 'Enable'}</button>
                  <button type="button" disabled={!canDeleteTaxonomy} onClick={() => void archiveCategory(item._id)} className="rounded-full bg-rose-500/10 px-2 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Archive</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'clusters' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03] flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Cluster Management</h3>
            <button type="button" onClick={openClusterCreate} disabled={!canManageTaxonomy} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40"><Plus className="w-4 h-4" /> New Cluster</button>
          </div>
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 p-4 text-sm text-amber-100">
            Disable keeps linked universities safe. Permanent Delete supports cascade (delete all) or detach (keep universities) modes.
            <div className="mt-3 flex flex-wrap gap-2">
              {(['all', 'active', 'inactive'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setClusterStatusView(view)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${clusterStatusView === view ? 'bg-white text-slate-900' : 'border border-white/15 text-amber-100 hover:bg-white/10'}`}
                >
                  {view === 'all' ? 'All' : view === 'active' ? 'Active' : 'Disabled'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleClusterItems.length === 0 ? <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-12 text-center text-slate-500">No clusters found.</div> : visibleClusterItems.map((c) => (
              <article key={c._id} className="rounded-xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-4 space-y-3 ring-1 ring-white/[0.03] hover:border-indigo-500/25 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-500 tracking-wider">SLUG: {c.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${c.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>{c.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-700/20 bg-slate-950/30 p-3 text-[11px] sm:grid-cols-2">
                  <p className="text-slate-500 font-medium">Members</p><p className="text-indigo-300 font-bold">{c.memberCount || c.memberUniversityIds?.length || 0}</p>
                  <p className="text-slate-500 font-medium">Home Feed</p><p className="text-slate-300 font-bold">{c.homeVisible ? `Visible (#${c.homeOrder})` : 'Hidden'}</p>
                  <p className="text-slate-500 font-medium">Feed Mode</p><p className="text-slate-300 font-bold">{c.homeFeedMode === 'cluster_only' ? '🏷️ Cluster Only' : c.homeFeedMode === 'members_only' ? '🎓 Members Only' : '📋 Both'}</p>
                  <p className="text-slate-500 font-medium">Warnings</p><p className="text-amber-300 font-bold">{c.resolution?.warnings?.length || 0}</p>
                  <p className="text-slate-500 font-medium">Centers</p><p className="text-slate-300 font-bold">{c.dates?.examCenters?.length || 0}</p>
                  <p className="text-slate-500 font-medium">Total Seats</p><p className="text-cyan-300 font-bold">{(c as any).seatStats?.totalSeats?.toLocaleString() || '—'}</p>
                  <p className="text-slate-500 font-medium">Sci / Arts / Com</p><p className="font-bold"><span className="text-emerald-300">{(c as any).seatStats?.scienceSeats || 0}</span> / <span className="text-violet-300">{(c as any).seatStats?.artsSeats || 0}</span> / <span className="text-amber-300">{(c as any).seatStats?.commerceSeats || 0}</span></p>
                </div>
                {((c.categoryRules?.length ?? 0) > 0 || ((c as any).categoryRuleIds?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {(c.categoryRules || []).map((cat) => (
                      <span key={cat} className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">{cat}</span>
                    ))}
                  </div>
                )}
                <div className="rounded-xl border border-slate-700/20 bg-slate-950/30 px-3 py-2 text-[11px] text-slate-400">
                  Disable keeps linked universities untouched. Permanent Delete supports cascade (delete all) or detach (keep universities) modes.
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => void openClusterEdit(c)} className="rounded-full bg-indigo-500/10 px-2 py-1.5 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => void syncCluster(c._id)} className="rounded-full bg-emerald-500/10 px-2 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Sync</button>
                  <button type="button" disabled={!canManageTaxonomy} onClick={() => void resolveCluster(c._id)} className="rounded-full bg-indigo-500/5 px-2 py-1.5 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/10 transition-all disabled:cursor-not-allowed disabled:opacity-40">Resolve</button>
                  <button type="button" disabled={!canDeleteTaxonomy} onClick={() => void deactivateCluster(c._id)} className="rounded-full bg-rose-500/10 px-2 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-40">Disable</button>
                  <button
                    type="button"
                    disabled={!canDeleteTaxonomy}
                    onClick={() => void permanentDeleteCluster(c)}
                    className="rounded-full bg-red-600/15 px-2 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-600/25 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Permanent Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'import' && (
        <section className="space-y-4">
          {/* ── Step Indicator ── */}
          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-4 shadow-xl shadow-indigo-900/20 ring-1 ring-white/[0.03]">
            <div className="flex items-center gap-1 sm:gap-2">
              {(['upload', 'mapping', 'validated', 'committed'] as const).map((step, idx) => {
                const labels = ['Upload File', 'Map Columns', 'Validate', 'Commit'];
                const icons = ['📁', '🔗', '✅', '🚀'];
                const isActive = step === importStep;
                const isPast = (['upload', 'mapping', 'validated', 'committed'] as const).indexOf(importStep) > idx;
                return (
                  <div key={step} className="flex items-center gap-1 sm:gap-2 flex-1">
                    <div className={`flex items-center gap-1.5 rounded-xl px-2 sm:px-3 py-2 text-[11px] font-bold transition-all w-full justify-center ${isActive ? 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 shadow-lg shadow-indigo-500/10' : isPast ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-slate-950/30 border border-slate-700/20 text-slate-500'}`}>
                      <span>{isPast ? '✓' : icons[idx]}</span>
                      <span className="hidden sm:inline">{labels[idx]}</span>
                    </div>
                    {idx < 3 && <div className={`hidden sm:block w-4 h-px flex-shrink-0 ${isPast ? 'bg-emerald-500/40' : 'bg-slate-700/30'}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Step 1: Upload ── */}
          <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 space-y-4 ring-1 ring-white/[0.03]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Step 1: Upload Data File</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">CSV, XLSX, XLS supported — max 10MB</p>
              </div>
              {importJobId && (
                <button type="button" onClick={resetImport} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 transition-all">
                  <X className="w-3.5 h-3.5" /> New Import
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-slate-950/40 rounded-xl p-4 border border-indigo-500/5 transition-all hover:border-indigo-500/20">
              <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e: ChangeEvent<HTMLInputElement>) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
              <button type="button" onClick={() => importFileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all"><Upload className="w-4 h-4" /> Choose File</button>
              <button type="button" onClick={() => void downloadTemplate('csv')} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all"><Download className="w-4 h-4" /> Demo CSV</button>
              <button type="button" onClick={() => void downloadTemplate('xlsx')} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all"><Download className="w-4 h-4" /> Demo XLSX</button>
              {importFile ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs text-indigo-200 font-medium">
                  📄 {importFile.name}
                  <span className="text-slate-500">({(importFile.size / 1024).toFixed(1)} KB)</span>
                </span>
              ) : <span className="text-xs text-slate-500 italic">No file selected</span>}
              <button type="button" disabled={initializingImport || !importFile} onClick={() => void initImport()} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-all">{initializingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Initialize Job</button>
            </div>
            {importJobId && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-300 flex items-center gap-3 font-medium animate-in fade-in slide-in-from-top-2">
                <Activity className="w-4 h-4" />
                <span>Job: <code className="bg-slate-950/50 px-2 py-0.5 rounded text-white font-mono text-[10px]">{importJobId}</code></span>
                <span className="text-slate-500">|</span>
                <span>File: <strong className="text-white">{importInit?.sampleRows?.length || 0}</strong> rows</span>
                <span className="text-slate-500">|</span>
                <span>Headers: <strong className="text-white">{importInit?.headers?.length || 0}</strong> columns</span>
                <button type="button" disabled={refreshingImportStatus} onClick={() => void refreshImport()} className="ml-auto inline-flex items-center gap-1 hover:text-white transition-colors">
                  {refreshingImportStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
              </div>
            )}
          </div>

          {importInit && (
            <div className="rounded-2xl border border-white/10 bg-[#0f1d37] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Step 2: Column Mapping</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Map your file columns to database fields. Only mapped columns will be imported.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${importMappedCount >= 3 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}`}>
                    {importMappedCount}/{importTotalFields} mapped
                  </span>
                  <button type="button" onClick={autoMapAll} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all">
                    <RefreshCw className="w-3 h-3" /> Auto-Map
                  </button>
                  <button type="button" onClick={clearAllMappings} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/30 bg-slate-800/50 px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-all">
                    <X className="w-3 h-3" /> Clear
                  </button>
                </div>
              </div>

              {importAutoMappedCount > 0 && importMappedCount === 0 && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200 flex items-center gap-2">
                  💡 <strong>{importAutoMappedCount}</strong> columns can be auto-mapped. Click &quot;Auto-Map&quot; to apply suggested mappings.
                </div>
              )}

              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  value={importMappingSearch}
                  onChange={(e) => setImportMappingSearch(e.target.value)}
                  placeholder="Filter fields..."
                  className="flex-1 rounded-lg border border-slate-700/40 bg-slate-950/50 px-3 py-1.5 text-xs text-white focus:border-indigo-400/60 outline-none transition-all"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-700/30 bg-slate-950/40 max-h-[420px] overflow-y-auto">
                <table className="min-w-[720px] w-full text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-700/30 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold uppercase tracking-wider w-[35%]">Target Field</th>
                      <th className="px-4 py-3 text-left font-bold uppercase tracking-wider">Source Column (from File)</th>
                      <th className="px-2 py-3 text-center font-bold uppercase tracking-wider w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/20">
                    {filteredImportFields.map((field) => {
                      const isMapped = Boolean(importMapping[field]);
                      const isRequired = field === 'name' || field === 'category';
                      return (
                        <tr key={field} className={`transition-all ${isMapped ? 'bg-emerald-500/[0.03]' : isRequired ? 'bg-rose-500/[0.03]' : 'hover:bg-indigo-500/[0.02]'}`}>
                          <td className="px-4 py-2.5">
                            <span className="text-slate-200 font-medium">{field}</span>
                            {isRequired && <span className="ml-1.5 text-[9px] font-bold text-rose-400 uppercase">required</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <select value={importMapping[field] || ''} onChange={(e) => setImportMapping((prev) => ({ ...prev, [field]: e.target.value }))} className={`w-full rounded-lg border px-3 py-1.5 text-white focus:border-indigo-500/40 outline-none transition-all ${isMapped ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/40 bg-slate-900/65'}`}>
                              <option value="">-- unmapped --</option>
                              {(importInit.headers || []).map((h) => <option key={`${field}-${h}`} value={h}>{h}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {isMapped ? <span className="text-emerald-400 text-sm">✓</span> : isRequired ? <span className="text-rose-400 text-sm">!</span> : <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-slate-700/30 bg-slate-950/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">Mapped Preview</p>
                    <p className="text-xs text-slate-400">
                      Fields that will be written to the database from your current mapping/defaults.
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-200">
                    {mappedImportFields.length} fields active
                  </span>
                </div>

                {mappedImportFields.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    No fields mapped yet. Map at least <strong>name</strong> and <strong>category</strong> before validation.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {mappedImportFields.map((field) => (
                        <span key={field} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-100">
                          {field} → {importMapping[field] || '(default)'}
                        </span>
                      ))}
                    </div>
                    {mappedImportPreviewRows.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {mappedImportPreviewRows.slice(0, 3).map((row, index) => (
                          <article key={`mapped-preview-${index}`} className="rounded-xl border border-slate-700/30 bg-slate-900/65 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Sample Row {index + 1}</p>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {mappedImportFields.slice(0, 10).map((field) => (
                                <div key={`${field}-${index}`} className="rounded-lg border border-indigo-500/5 bg-slate-950/45 px-2.5 py-1.5">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{field}</p>
                                  <p className="mt-0.5 break-words text-xs text-slate-100 truncate">{String(row[field] ?? '') || '—'}</p>
                                </div>
                              ))}
                              {mappedImportFields.length > 10 && (
                                <div className="rounded-lg border border-slate-700/20 bg-slate-950/30 px-2.5 py-1.5 text-[10px] text-slate-500 italic">
                                  +{mappedImportFields.length - 10} more fields
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Default Category</label>
                  <input value={String(importDefaults.category || '')} onChange={(e) => setImportDefaults((prev) => ({ ...prev, category: e.target.value }))} placeholder="Applied when column is empty" className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Default Cluster</label>
                  <input value={String(importDefaults.clusterGroup || '')} onChange={(e) => setImportDefaults((prev) => ({ ...prev, clusterGroup: e.target.value }))} placeholder="Applied when column is empty" className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Import Mode</label>
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as 'create-only' | 'update-existing')}
                    className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                  >
                    <option value="update-existing">Create or Update Existing</option>
                    <option value="create-only">Create Only (Skip Duplicates)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/20">
                <button
                  type="button"
                  disabled={validatingImport || !importMapping.name || !importMapping.category}
                  onClick={() => void validateImport()}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-5 py-2.5 text-xs font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all disabled:opacity-40"
                >
                  {validatingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />} Validate Mapping
                </button>
                <button
                  type="button"
                  disabled={committingImport || !importValidation}
                  onClick={() => void commitImport()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition-all"
                >
                  {committingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Commit Import
                </button>
                {(importValidation?.failedRowCount || importCommit?.failedRowCount) ? (
                  <button type="button" onClick={() => void downloadErrors()} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-all ml-auto"><Download className="w-4 h-4" /> Error Log</button>
                ) : null}
              </div>
            </div>
          )}

          {(importValidation || importCommit) && (
            <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 backdrop-blur-sm p-5 ring-1 ring-white/[0.03] space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  {importCommit ? '🚀 Import Complete' : '✅ Validation Results'}
                </h4>
                {importCommit && (
                  <button type="button" onClick={resetImport} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Start New Import
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-700/30 bg-slate-950/50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total Rows</p>
                  <p className="mt-2 text-2xl font-black text-white">{importValidation?.validationSummary?.totalRows || 0}</p>
                  <p className="text-[10px] text-slate-500">in source file</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">{importCommit ? 'Inserted' : 'Valid'}</p>
                  <p className="mt-2 text-2xl font-black text-emerald-300">{importCommit?.commitSummary?.inserted || importValidation?.validationSummary?.validRows || 0}</p>
                  <p className="text-[10px] text-slate-500">{importCommit ? 'new records' : 'ready to import'}</p>
                </div>
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Updated</p>
                  <p className="mt-2 text-2xl font-black text-cyan-300">{importCommit?.commitSummary?.updated || 0}</p>
                  <p className="text-[10px] text-slate-500">{importCommit ? 'existing records' : 'after commit'}</p>
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">Failed</p>
                  <p className="mt-2 text-2xl font-black text-rose-300">{importCommit?.failedRowCount || importValidation?.failedRowCount || 0}</p>
                  <p className="text-[10px] text-slate-500">need review</p>
                </div>
              </div>

              {importCommit && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100 flex items-center gap-2">
                    <span className="text-lg">📂</span> Auto-created categories: <strong>{importCommit.createdCategories || importCommit.commitSummary?.createdCategories || 0}</strong>
                  </div>
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100 flex items-center gap-2">
                    <span className="text-lg">🏷️</span> Auto-created clusters: <strong>{importCommit.createdClusters || importCommit.commitSummary?.createdClusters || 0}</strong>
                  </div>
                </div>
              )}

              {(importCommit?.warnings?.length || importValidation?.warnings?.length) ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">⚠️ Warnings</p>
                  {(importCommit?.warnings || importValidation?.warnings || []).map((warning) => (
                    <p key={warning} className="text-xs">{warning}</p>
                  ))}
                </div>
              ) : null}

              {importValidation?.duplicates && (importValidation.duplicates.inFile.length > 0 || importValidation.duplicates.inDatabase.length > 0) && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 text-sm text-slate-200 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-2">🔄 Duplicates Detected</p>
                  {importValidation.duplicates.inFile.length > 0 && (
                    <p className="text-xs">In file (rows): <span className="text-violet-300 font-mono">{importValidation.duplicates.inFile.join(', ')}</span></p>
                  )}
                  {importValidation.duplicates.inDatabase.length > 0 && (
                    <p className="text-xs">Already in database (rows): <span className="text-violet-300 font-mono">{importValidation.duplicates.inDatabase.join(', ')}</span></p>
                  )}
                </div>
              )}

              {(importCommit?.failedRows?.length || importValidation?.failedRows?.length) ? (
                <div className="rounded-xl border border-slate-700/30 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Failed Rows</p>
                    <button type="button" onClick={() => void downloadErrors()} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors">
                      <Download className="w-3 h-3" /> Download Full Log
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {(importCommit?.failedRows || importValidation?.failedRows || []).slice(0, 12).map((row) => (
                      <div key={`${row.rowNumber}-${row.reason}`} className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2 text-xs text-rose-100 flex items-start gap-2">
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 flex-shrink-0">Row {row.rowNumber}</span>
                        <span>{row.reason}</span>
                      </div>
                    ))}
                    {((importCommit?.failedRows?.length || importValidation?.failedRows?.length || 0) > 12) && (
                      <p className="text-[11px] text-slate-500 italic text-center pt-1">
                        +{(importCommit?.failedRows?.length || importValidation?.failedRows?.length || 0) - 12} more — download the full error log above
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      {modalUniversity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in transition-all">
          <div className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-700/30 bg-slate-900 shadow-2xl shadow-black/20 ring-1 ring-white/[0.03] flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/30 bg-slate-900/50">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight uppercase">{modalUniversity === 'create' ? 'Create University' : 'Edit University Profile'}</h3>
                <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Global Admin Data Console</p>
              </div>
              <button type="button" onClick={() => setModalUniversity(null)} className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-all"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Official Name</label><input value={form.name || ''} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Short Form</label><input value={form.shortForm || ''} onChange={(e) => setForm((prev) => ({ ...prev, shortForm: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Category</label>
                  <select value={form.category || ''} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                    <option value="">Select category</option>
                    {categorySelectOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>

                <AdminDateField label="App Start Date" value={form.applicationStartDate} onChange={(next) => setForm((prev) => ({ ...prev, applicationStartDate: next }))} />
                <AdminDateField label="App End Date" value={form.applicationEndDate} onChange={(next) => setForm((prev) => ({ ...prev, applicationEndDate: next }))} />

                <AdminDateField label="Science Exam Date" value={form.scienceExamDate} onChange={(next) => setForm((prev) => ({ ...prev, scienceExamDate: next }))} />
                <AdminDateField label="Business Exam Date" value={form.businessExamDate} onChange={(next) => setForm((prev) => ({ ...prev, businessExamDate: next }))} />
                <AdminDateField label="Humanities Exam Date" value={form.artsExamDate} onChange={(next) => setForm((prev) => ({ ...prev, artsExamDate: next }))} />

                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Contact Phone</label><input value={form.contactNumber || ''} onChange={(e) => setForm((prev) => ({ ...prev, contactNumber: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5 lg:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Full Address</label><input value={form.address || ''} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>

                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Email</label><input value={form.email || ''} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Main Website</label><input value={form.website || ''} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Admission Portal</label><input value={form.admissionWebsite || ''} onChange={(e) => setForm((prev) => ({ ...prev, admissionWebsite: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-700/30 bg-slate-950/25 p-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">University Description Content</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Short description helps cards and SEO. Full description appears on the public university details page and can also come from bulk import.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Short Description</label>
                  <textarea
                    value={form.shortDescription || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    rows={3}
                    placeholder="Write a concise summary for overview cards and metadata"
                    className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Full Description</label>
                  <textarea
                    value={form.description || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={6}
                    placeholder="Write the full university description that should appear on the public details page"
                    className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-slate-700/30 space-y-4">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Shared Synchronization Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${form.categorySyncLocked ? 'bg-cyan-600 border-cyan-500' : 'bg-slate-950/50'}`}>
                      {form.categorySyncLocked && <CheckSquare className="w-4 h-4 text-white" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={Boolean(form.categorySyncLocked)} onChange={(e) => setForm((prev) => ({ ...prev, categorySyncLocked: e.target.checked }))} />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Lock Category Shared Config</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${form.clusterSyncLocked ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950/50'}`}>
                      {form.clusterSyncLocked && <CheckSquare className="w-4 h-4 text-white" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={Boolean(form.clusterSyncLocked)} onChange={(e) => setForm((prev) => ({ ...prev, clusterSyncLocked: e.target.checked }))} />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Lock Cluster Shared Sync (Prevent Cluster Overwrites)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/30 bg-slate-900/50 flex justify-end gap-3">
              <button type="button" onClick={() => setModalUniversity(null)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all">Discard</button>
              <button type="button" disabled={savingUniversity} onClick={() => void saveUniversity()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:opacity-90 disabled:opacity-40 transition-all">
                {savingUniversity ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {modalUniversity === 'create' ? 'Create Permanently' : 'Update Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in transition-all">
          <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-700/30 bg-slate-900 shadow-2xl shadow-black/20 ring-1 ring-white/[0.03] flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/30 bg-slate-900/50">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight uppercase">{categoryModal === 'create' ? 'Create Category' : 'Edit Category'}</h3>
                <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Category Master Control</p>
              </div>
              <button type="button" onClick={() => setCategoryModal(null)} className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Category Name</label>
                  <input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Slug</label>
                  <input value={categoryForm.slug} onChange={(e) => setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Bangla Label</label>
                  <input value={categoryForm.labelBn} onChange={(e) => setCategoryForm((prev) => ({ ...prev, labelBn: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">English Label</label>
                  <input value={categoryForm.labelEn} onChange={(e) => setCategoryForm((prev) => ({ ...prev, labelEn: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Home Order</label>
                  <input type="number" value={String(categoryForm.homeOrder)} onChange={(e) => setCategoryForm((prev) => ({ ...prev, homeOrder: Number(e.target.value || 0) }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 p-4 rounded-2xl bg-indigo-500/5 border border-slate-700/30">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${categoryForm.homeHighlight ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950/50'}`}>
                    {categoryForm.homeHighlight && <CheckSquare className="w-4 h-4 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={categoryForm.homeHighlight} onChange={(e) => setCategoryForm((prev) => ({ ...prev, homeHighlight: e.target.checked }))} />
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors uppercase font-bold tracking-wider">Highlight on Home</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${categoryForm.isActive ? 'bg-cyan-600 border-cyan-500' : 'bg-slate-950/50'}`}>
                    {categoryForm.isActive && <CheckSquare className="w-4 h-4 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors uppercase font-bold tracking-wider">Category Active</span>
                </label>
              </div>

              <div className="rounded-2xl border border-cyan-500/10 bg-cyan-500/5 p-4 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Shared Category Config</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <AdminDateField label="Shared App Start" value={categoryForm.sharedConfig.applicationStartDate} onChange={(next) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, applicationStartDate: next } }))} />
                  <AdminDateField label="Shared App End" value={categoryForm.sharedConfig.applicationEndDate} onChange={(next) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, applicationEndDate: next } }))} />
                  <AdminDateField label="Science Exam" value={categoryForm.sharedConfig.scienceExamDate} onChange={(next) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, scienceExamDate: next } }))} />
                  <AdminDateField label="Humanities Exam" value={categoryForm.sharedConfig.artsExamDate} onChange={(next) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, artsExamDate: next } }))} />
                  <AdminDateField label="Business Exam" value={categoryForm.sharedConfig.businessExamDate} onChange={(next) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, businessExamDate: next } }))} />
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Exam Centers</label>
                    <textarea value={categoryForm.sharedConfig.examCentersText || ''} onChange={(e) => setCategoryForm((prev) => ({ ...prev, sharedConfig: { ...prev.sharedConfig, examCentersText: e.target.value } }))} rows={3} placeholder="Dhaka - BUET Campus | Chattogram - CUET Campus" className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/30 bg-slate-900/50 flex justify-end gap-3">
              <button type="button" onClick={() => setCategoryModal(null)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
              {categoryModal !== 'create' && (
                <button type="button" onClick={() => void syncCategory()} className="px-6 py-2.5 rounded-xl text-sm font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">Sync Category Universities</button>
              )}
              <button type="button" disabled={savingCategory} onClick={() => void saveCategory()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:opacity-90 disabled:opacity-40 transition-all">
                {savingCategory ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {categoryModal === 'create' ? 'Create Category' : 'Save Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {clusterModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in transition-all">
          <div className="mx-auto w-full max-w-6xl rounded-3xl border border-slate-700/30 bg-slate-900 shadow-2xl shadow-black/20 ring-1 ring-white/[0.03] flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/30 bg-slate-900/50">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight uppercase">{clusterModal === 'create' ? 'Create University Cluster' : 'Edit Cluster Settings'}</h3>
                <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Cluster Logic & Date Synchronization</p>
              </div>
              <button type="button" onClick={() => setClusterModal(null)} className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-all"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Cluster Name</label><input value={clusterForm.name} onChange={(e) => setClusterForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">URL Slug</label><input value={clusterForm.slug} onChange={(e) => setClusterForm((p) => ({ ...p, slug: e.target.value }))} className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" /></div>
                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Description</label>
                  <textarea
                    value={clusterForm.description}
                    onChange={(e) => setClusterForm((p) => ({ ...p, description: e.target.value }))}
                    rows={4}
                    placeholder="Write a clear cluster description, rule summary, or public-facing explanation."
                    className="w-full rounded-2xl border border-slate-700/40 bg-slate-950/70 px-4 py-3 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y shadow-inner shadow-slate-950/20"
                  />
                </div>

                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Hero Background Image</label>
                  <div className="flex gap-2">
                    <input
                      value={clusterForm.heroImageUrl}
                      onChange={(e) => setClusterForm((p) => ({ ...p, heroImageUrl: e.target.value }))}
                      placeholder="Paste URL or upload an image"
                      className="flex-1 rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                    />
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/20">
                      <Upload className="h-4 w-4" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const uploadToast = toast.loading('Uploading image...');
                          try {
                            const res = await adminUploadMedia(file, { visibility: 'public', category: 'admin_upload' });
                            const url = res.data?.url || '';
                            if (url) {
                              setClusterForm((p) => ({ ...p, heroImageUrl: url }));
                              toast.success('Image uploaded', { id: uploadToast });
                            } else {
                              toast.error('Upload returned no URL', { id: uploadToast });
                            }
                          } catch {
                            toast.error('Upload failed', { id: uploadToast });
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {clusterForm.heroImageUrl && (
                    <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-700/30 h-28 group">
                      <img src={clusterForm.heroImageUrl} alt="Hero preview" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <button
                        type="button"
                        onClick={() => setClusterForm((p) => ({ ...p, heroImageUrl: '' }))}
                        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <AdminDateField label="Master App Start" value={clusterForm.dates.applicationStartDate} onChange={(next) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, applicationStartDate: next } }))} />
                <AdminDateField label="Master App End" value={clusterForm.dates.applicationEndDate} onChange={(next) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, applicationEndDate: next } }))} />
                <AdminDateField label="Master Science Exam" value={clusterForm.dates.scienceExamDate} onChange={(next) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, scienceExamDate: next } }))} />
                <AdminDateField label="Master Business Exam" value={clusterForm.dates.businessExamDate || clusterForm.dates.commerceExamDate} onChange={(next) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, businessExamDate: next, commerceExamDate: next } }))} />
                <AdminDateField label="Master Arts Exam" value={clusterForm.dates.artsExamDate} onChange={(next) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, artsExamDate: next } }))} />
                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Cluster Admission Portal</label>
                  <input
                    value={clusterForm.dates.admissionWebsite || ''}
                    onChange={(e) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, admissionWebsite: e.target.value } }))}
                    placeholder="https://gstadmission.example.edu"
                    className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Shared Exam Centers</label>
                  <textarea value={clusterForm.dates.examCentersText || ''} onChange={(e) => setClusterForm((p) => ({ ...p, dates: { ...p.dates, examCentersText: e.target.value } }))} rows={3} placeholder="Dhaka - BUET Campus | Chattogram - CUET Campus" className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-4 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y" />
                </div>

                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Category Rules (Assistive)</label>
                  <div className="rounded-xl border border-slate-700/40 bg-slate-950/50 p-3">
                    <div className="flex flex-wrap gap-2">
                      {categoryMaster.map((cat) => {
                        const active = clusterForm.categoryRuleIds.includes(cat._id);
                        return (
                          <button
                            key={cat._id}
                            type="button"
                            onClick={() => setClusterForm((prev) => {
                              const exists = prev.categoryRuleIds.includes(cat._id);
                              const nextIds = exists
                                ? prev.categoryRuleIds.filter((id) => id !== cat._id)
                                : [...prev.categoryRuleIds, cat._id];
                              const nextRules = exists
                                ? prev.categoryRules.filter((name) => name !== cat.name)
                                : Array.from(new Set([...prev.categoryRules, cat.name]));
                              return { ...prev, categoryRuleIds: nextIds, categoryRules: nextRules };
                            })}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${active ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-lg shadow-indigo-500/20' : 'border border-indigo-500/20 bg-slate-900/60 text-slate-300 hover:border-indigo-500/40 hover:text-white'}`}
                          >
                            {cat.labelBn || cat.name}
                          </button>
                        );
                      })}
                      {categoryMaster.length === 0 && <p className="text-xs text-slate-500">No categories available.</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 p-4 rounded-2xl bg-indigo-500/5 border border-slate-700/30">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${clusterForm.isActive ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950/50'}`}>
                    {clusterForm.isActive && <CheckSquare className="w-4 h-4 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={clusterForm.isActive} onChange={(e) => setClusterForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors uppercase font-bold tracking-wider">Active Cluster</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border border-indigo-500/40 flex items-center justify-center transition-all ${clusterForm.homeVisible ? 'bg-cyan-600 border-cyan-500' : 'bg-slate-950/50'}`}>
                    {clusterForm.homeVisible && <CheckSquare className="w-4 h-4 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={clusterForm.homeVisible} onChange={(e) => setClusterForm((p) => ({ ...p, homeVisible: e.target.checked }))} />
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors uppercase font-bold tracking-wider">Show on Home Page</span>
                </label>
              </div>

              {/* Home Feed Mode selector */}
              {clusterForm.homeVisible && (
                <div className="rounded-2xl border border-slate-700/30 bg-slate-950/40 p-4 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Home Feed Display Mode</h4>
                  <p className="text-[11px] text-slate-400 ml-1">কিভাবে হোম পেজে দেখাবে — শুধু ক্লাস্টার কার্ড, শুধু ভার্সিটি কার্ড, নাকি দুটোই?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'cluster_only' as const, label: 'Cluster Only', emoji: '🏷️', hint: 'শুধু ক্লাস্টার কার্ড দেখাবে (গুচ্ছ ভর্তির মতো)। আলাদা ভার্সিটি কার্ড হোমে দেখাবে না।' },
                      { value: 'members_only' as const, label: 'Members Only', emoji: '🎓', hint: 'শুধু ভার্সিটি কার্ড আলাদা আলাদা দেখাবে। ক্লাস্টার কার্ড হোমে দেখাবে না।' },
                      { value: 'both' as const, label: 'Both', emoji: '📋', hint: 'ক্লাস্টার কার্ড এবং আলাদা ভার্সিটি কার্ড দুটোই দেখাবে।' },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClusterForm((p) => ({ ...p, homeFeedMode: opt.value }))}
                        className={`rounded-xl border p-3 text-left transition-all ${clusterForm.homeFeedMode === opt.value
                          ? 'border-cyan-500/40 bg-cyan-500/10 ring-1 ring-cyan-500/20'
                          : 'border-slate-700/30 bg-slate-900/40 hover:border-slate-600/40'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{opt.emoji}</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${clusterForm.homeFeedMode === opt.value ? 'text-cyan-300' : 'text-slate-400'}`}>{opt.label}</span>
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-700/30 bg-slate-950/40 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-xs font-black text-white uppercase tracking-widest">Manual Member Selection</h4>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input value={clusterSearch} onChange={(e) => setClusterSearch(e.target.value)} placeholder="Search universities..." className="w-full rounded-lg border border-slate-700/40 bg-slate-900/80 pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500/40" />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-2 custom-scrollbar">
                  {candidateFiltered.map((u) => (
                    <label key={u._id} className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${clusterForm.manualMembers.includes(u._id) ? 'bg-indigo-500/10 border-indigo-500/30 text-white' : 'bg-slate-900/40 border-indigo-500/5 text-slate-400 hover:border-indigo-500/20'}`}>
                      <input type="checkbox" className="hidden" checked={clusterForm.manualMembers.includes(u._id)} onChange={() => setClusterForm((p) => ({ ...p, manualMembers: p.manualMembers.includes(u._id) ? p.manualMembers.filter((x) => x !== u._id) : [...p.manualMembers, u._id] }))} />
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${clusterForm.manualMembers.includes(u._id) ? 'bg-indigo-500 border-indigo-400' : 'border-slate-600'}`}>
                        {clusterForm.manualMembers.includes(u._id) && <CheckSquare className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-[11px] font-medium truncate">{u.name} <span className="text-slate-500">({u.shortForm})</span></span>
                    </label>
                  ))}
                  {candidateFiltered.length === 0 && <p className="col-span-full py-8 text-center text-xs text-slate-600 font-medium">No results found matching your search</p>}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/30 bg-slate-900/50 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setClusterModal(null)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
              {clusterModal !== 'create' && typeof clusterModal === 'object' && (
                <button type="button" onClick={() => void syncCluster(clusterModal._id, clusterForm.dates)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">Sync Cluster Universities</button>
              )}
              <button type="button" disabled={savingCluster} onClick={() => void saveCluster()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:opacity-90 disabled:opacity-40 transition-all">
                {savingCluster ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {clusterModal === 'create' ? 'Create Cluster' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
