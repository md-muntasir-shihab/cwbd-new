import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowRightLeft,
    BookCopy,
    Clock3,
    CheckCircle2,
    ChevronLeft,
    ClipboardCheck,
    CreditCard,
    Download,
    Edit3,
    Eye,
    EyeOff,
    ExternalLink,
    FileCog,
    FileSpreadsheet,
    GraduationCap,
    Link2,
    ListOrdered,
    MapPin,
    Plus,
    RefreshCw,
    Rows3,
    Search,
    Shield,
    Settings2,
    Sparkles,
    Trash2,
    Upload,
    Users,
    X,
    Database,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    listAdminExams,
    getAdminExam,
    createAdminExam,
    updateAdminExam,
    deleteAdminExam,
    listAdminExamQuestions,
    createAdminQuestion,
    updateAdminQuestion,
    deleteAdminQuestion,
    getAdminExamResults,
    publishExamResults,
    listAdminPayments,
    verifyPayment,
    downloadQuestionTemplate,
} from '../../../api/adminExamApi';
import {
    commitExamImport,
    createExamCenter,
    createExamImportTemplate,
    createExamMappingProfile,
    deleteExamCenter,
    deleteExamImportTemplate,
    deleteExamMappingProfile,
    getExamCenterSettings,
    getExamCenters,
    getExamImportLogs,
    getExamImportTemplates,
    getExamMappingProfiles,
    getExamProfileSyncLogs,
    previewExamImport,
    runExamProfileSync,
    updateExamCenter,
    updateExamCenterSettings,
    updateExamImportTemplate,
    updateExamMappingProfile,
    type ExamCenterSettings,
    type ExamImportPreviewResponse,
    type ExamCenterSyncMode,
} from '../../../api/adminExamCenterApi';
import { getStudentGroups } from '../../../api/adminStudentApi';
import {
    adminDownloadExamResultImportTemplate,
    adminExportExamReport,
    adminExportExamResults,
    adminImportExternalExamResultsFile,
    adminImportExamResultsFile,
    adminGetExams,
    type AdminExamCard,
} from '../../../services/api';
import ModernToggle from '../../../components/ui/ModernToggle';
import { showConfirmDialog } from '../../../lib/appDialog';
import { downloadFile } from '../../../utils/download';
import { promptForSensitiveActionProof } from '../../../utils/sensitiveAction';
import AntiCheatPolicyForm from '../../../components/admin/AntiCheatPolicyForm';

type AdminTab = 'list' | 'create' | 'edit' | 'questions' | 'results' | 'payments';
type ExamCenterView = 'all' | 'external' | 'internal' | 'imports' | 'results' | 'templates' | 'centers' | 'sync-logs' | 'settings';

type TemplateFormState = {
    name: string;
    description: string;
    expectedColumns: string;
    requiredColumns: string;
    columnMappingJson: string;
    matchPriority: string;
    profileUpdateFields: string;
    recordOnlyFields: string;
    isActive: boolean;
};

type MappingProfileFormState = {
    name: string;
    description: string;
    matchPriority: string;
    fieldMappingJson: string;
    requiredColumns: string;
    isActive: boolean;
};

type ExamCenterFormState = {
    name: string;
    address: string;
    code: string;
    note: string;
    isActive: boolean;
};

const EXAM_CENTER_VIEW_OPTIONS: Array<{ key: ExamCenterView; label: string; icon: typeof Rows3 }> = [
    { key: 'all', label: 'All Exams', icon: Rows3 },
    { key: 'external', label: 'External Exams', icon: Link2 },
    { key: 'internal', label: 'Internal Exams', icon: BookCopy },
    { key: 'imports', label: 'Imports', icon: ArrowRightLeft },
    { key: 'results', label: 'Results', icon: ClipboardCheck },
    { key: 'templates', label: 'Templates', icon: FileCog },
    { key: 'centers', label: 'Exam Centers', icon: MapPin },
    { key: 'sync-logs', label: 'Sync Logs', icon: Clock3 },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

const DEFAULT_MATCH_PRIORITY = ['user_id', 'student_phone', 'roll_number', 'student_email', 'username', 'registration_number'];
const DEFAULT_PROFILE_UPDATE_FIELDS = ['serial_id', 'roll_number', 'registration_number', 'admit_card_number', 'exam_center', 'profile_update_note'];
const DEFAULT_EXAM_CENTER_SETTINGS: ExamCenterSettings = {
    defaultSyncMode: 'fill_missing_only',
    autoCreateExamCenters: true,
    notifyStudentsOnSync: true,
    notifyGuardiansOnResult: false,
    allowExternalImports: true,
};

const defaultExamFields: Record<string, unknown> = {
    title: '', title_bn: '', description: '', description_bn: '',
    slug: '',
    subject: '', examCategory: '',
    deliveryMode: 'internal',
    externalExamUrl: '',
    examCenterId: '',
    templateId: '',
    importProfileId: '',
    durationMinutes: 60,
    examWindowStartUTC: '', examWindowEndUTC: '',
    paymentRequired: false, priceBDT: 0,
    subscriptionRequired: false, subscriptionPlanId: '',
    attemptLimit: 1, allowReAttempt: false,
    negativeMarkingEnabled: false, negativePerWrong: 0,
    answerChangeLimit: null,
    shuffleQuestions: false, shuffleOptions: false,
    showTimer: true, showQuestionPalette: true, autoSubmitOnTimeout: true,
    solutionsEnabled: true, solutionReleaseRule: 'after_result_publish',
    resultPublishAtUTC: '',
    status: 'draft',
    // Visibility & audience
    visibilityMode: 'all_students',
    targetGroupIds: [] as string[],
    requiresActiveSubscription: false,
    requiresPayment: false,
    minimumProfileScore: 0,
    displayOnDashboard: true,
    displayOnPublicList: true,
    isActive: true,
};

const defaultQuestionFields: Record<string, unknown> = {
    question_en: '', question_bn: '',
    optionA_en: '', optionA_bn: '', optionB_en: '', optionB_bn: '',
    optionC_en: '', optionC_bn: '', optionD_en: '', optionD_bn: '',
    correctKey: 'A', marks: 1, negativeMarks: 0,
    explanation_en: '', explanation_bn: '',
    questionImageUrl: '', explanationImageUrl: '',
    orderIndex: 0,
};

const EXTERNAL_IMPORT_MAPPING_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
    { key: 'cw_ref', label: 'CampusWay Ref' },
    { key: 'registration_id', label: 'Registration ID' },
    { key: 'user_unique_id', label: 'Student ID' },
    { key: 'username', label: 'Username' },
    { key: 'email', label: 'Email' },
    { key: 'phone_number', label: 'Phone Number' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'obtained_marks', label: 'Obtained Marks', required: true },
    { key: 'total_marks', label: 'Total Marks' },
    { key: 'percentage', label: 'Percentage' },
    { key: 'time_taken_sec', label: 'Time Taken (sec)' },
    { key: 'submitted_at', label: 'Submitted At' },
    { key: 'correct_count', label: 'Correct Count' },
    { key: 'wrong_count', label: 'Wrong Count' },
    { key: 'unanswered_count', label: 'Unanswered Count' },
    { key: 'exam_name', label: 'Exam Name' },
    { key: 'subject', label: 'Subject' },
];

const EXTERNAL_IMPORT_FIELD_ALIASES: Record<string, string[]> = {
    cw_ref: ['cw_ref', 'attempt_ref', 'campusway_ref', 'campuswayref'],
    registration_id: ['registration_id', 'registrationid', 'reg_id', 'regid'],
    user_unique_id: ['user_unique_id', 'student_id', 'studentid', 'user_id'],
    username: ['username', 'user_name'],
    email: ['email', 'mail'],
    phone_number: ['phone_number', 'phone', 'mobile', 'phone_no'],
    full_name: ['full_name', 'fullname', 'name', 'student_name'],
    obtained_marks: ['obtained_marks', 'score', 'marks_obtained', 'obtained'],
    total_marks: ['total_marks', 'full_marks', 'maximum_marks', 'max_marks'],
    percentage: ['percentage', 'percent', 'result_percentage'],
    time_taken_sec: ['time_taken_sec', 'time_taken', 'duration_sec', 'time_spent_sec'],
    submitted_at: ['submitted_at', 'submission_time', 'completed_at'],
    correct_count: ['correct_count', 'correct'],
    wrong_count: ['wrong_count', 'wrong'],
    unanswered_count: ['unanswered_count', 'unanswered', 'skipped'],
    exam_name: ['exam_name', 'exam', 'test_name'],
    subject: ['subject', 'subject_name'],
};

const EXAM_CENTER_IMPORT_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
    { key: 'attempt_ref', label: 'Attempt Ref' },
    { key: 'user_id', label: 'User / Student ID' },
    { key: 'serial_id', label: 'Serial ID' },
    { key: 'roll_number', label: 'Roll Number' },
    { key: 'registration_number', label: 'Registration Number' },
    { key: 'admit_card_number', label: 'Admit Card Number' },
    { key: 'student_phone', label: 'Student Phone' },
    { key: 'student_email', label: 'Student Email' },
    { key: 'username', label: 'Username' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'score', label: 'Score', required: true },
    { key: 'total_marks', label: 'Total Marks' },
    { key: 'percentage', label: 'Percentage' },
    { key: 'rank', label: 'Rank / Merit' },
    { key: 'pass_fail', label: 'Pass / Fail' },
    { key: 'attendance_status', label: 'Attendance Status' },
    { key: 'subject_marks', label: 'Subject Marks JSON' },
    { key: 'exam_center', label: 'Exam Center' },
    { key: 'exam_center_code', label: 'Center Code' },
    { key: 'exam_center_address', label: 'Center Address' },
    { key: 'exam_result_note', label: 'Result Note' },
    { key: 'profile_update_note', label: 'Profile Update Note' },
    { key: 'attempt_no', label: 'Attempt No' },
    { key: 'submitted_at', label: 'Submitted At' },
    { key: 'time_taken_sec', label: 'Time Taken (sec)' },
    { key: 'correct_count', label: 'Correct Count' },
    { key: 'wrong_count', label: 'Wrong Count' },
    { key: 'skipped_count', label: 'Skipped Count' },
    { key: 'exam_status', label: 'Exam Status' },
];

const EXAM_CENTER_IMPORT_ALIASES: Record<string, string[]> = {
    attempt_ref: ['attempt_ref', 'cw_ref', 'reference', 'ref'],
    user_id: ['user_id', 'user_unique_id', 'student_id', 'student_unique_id'],
    serial_id: ['serial_id', 'serial', 'serial_no'],
    roll_number: ['roll_number', 'roll', 'roll_no'],
    registration_number: ['registration_number', 'registration_id', 'registration', 'reg_id', 'reg_no'],
    admit_card_number: ['admit_card_number', 'admit_card', 'admit_no'],
    student_phone: ['student_phone', 'phone', 'phone_number', 'mobile', 'mobile_number'],
    student_email: ['student_email', 'email', 'email_address'],
    username: ['username', 'user_name'],
    full_name: ['full_name', 'student_name', 'name'],
    score: ['score', 'obtained_marks', 'marks', 'obtained_mark'],
    total_marks: ['total_marks', 'full_marks', 'maximum_marks', 'max_marks'],
    percentage: ['percentage', 'percent', 'result_percentage'],
    rank: ['rank', 'merit', 'merit_rank'],
    pass_fail: ['pass_fail', 'result_status', 'passfail'],
    attendance_status: ['attendance_status', 'attendance'],
    subject_marks: ['subject_marks', 'subject_wise_marks'],
    exam_center: ['exam_center', 'center_name'],
    exam_center_code: ['exam_center_code', 'center_code'],
    exam_center_address: ['exam_center_address', 'center_address'],
    exam_result_note: ['exam_result_note', 'result_note', 'remarks', 'note'],
    profile_update_note: ['profile_update_note', 'profile_note'],
    attempt_no: ['attempt_no', 'attempt_number', 'attempt'],
    submitted_at: ['submitted_at', 'completed_at', 'finished_at', 'submitted_time'],
    time_taken_sec: ['time_taken_sec', 'time_taken_seconds', 'duration_sec', 'spent_seconds'],
    correct_count: ['correct_count', 'correct'],
    wrong_count: ['wrong_count', 'wrong'],
    skipped_count: ['skipped_count', 'unanswered_count', 'unattempted_count'],
    exam_status: ['exam_status', 'status'],
};

const createDefaultTemplateForm = (): TemplateFormState => ({
    name: '',
    description: '',
    expectedColumns: '',
    requiredColumns: '',
    columnMappingJson: '',
    matchPriority: DEFAULT_MATCH_PRIORITY.join(', '),
    profileUpdateFields: DEFAULT_PROFILE_UPDATE_FIELDS.join(', '),
    recordOnlyFields: '',
    isActive: true,
});

const createDefaultMappingProfileForm = (): MappingProfileFormState => ({
    name: '',
    description: '',
    matchPriority: DEFAULT_MATCH_PRIORITY.join(', '),
    fieldMappingJson: '',
    requiredColumns: '',
    isActive: true,
});

const createDefaultExamCenterForm = (): ExamCenterFormState => ({
    name: '',
    address: '',
    code: '',
    note: '',
    isActive: true,
});

function normalizeImportHeader(value: unknown): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function autoDetectExternalMapping(columns: string[]): Record<string, string> {
    const normalizedColumnMap = new Map(columns.map((column) => [normalizeImportHeader(column), column]));
    return EXTERNAL_IMPORT_MAPPING_FIELDS.reduce<Record<string, string>>((acc, field) => {
        const alias = (EXTERNAL_IMPORT_FIELD_ALIASES[field.key] || []).find((candidate) => normalizedColumnMap.has(normalizeImportHeader(candidate)));
        if (alias) {
            acc[field.key] = normalizedColumnMap.get(normalizeImportHeader(alias)) || '';
        }
        return acc;
    }, {});
}

function _autoDetectExamCenterMapping(columns: string[]): Record<string, string> {
    const normalizedColumnMap = new Map(columns.map((column) => [normalizeImportHeader(column), column]));
    return EXAM_CENTER_IMPORT_FIELDS.reduce<Record<string, string>>((acc, field) => {
        const alias = (EXAM_CENTER_IMPORT_ALIASES[field.key] || []).find((candidate) => normalizedColumnMap.has(normalizeImportHeader(candidate)));
        if (alias) {
            acc[field.key] = normalizedColumnMap.get(normalizeImportHeader(alias)) || '';
        }
        return acc;
    }, {});
}

function parseDelimitedList(value: string): string[] {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function _stringifyJsonBlock(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    return JSON.stringify(value, null, 2);
}

function parseJsonRecord(value: string, label: string): Record<string, string> {
    const raw = String(value || '').trim();
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`${label} must be a JSON object.`);
        }
        return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
            const normalizedKey = String(key || '').trim();
            const normalizedValue = String(item || '').trim();
            if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
            return acc;
        }, {});
    } catch (error) {
        const message = error instanceof Error ? error.message : `Invalid ${label}.`;
        throw new Error(message);
    }
}

function normalizeCenterViewParam(value: string | null): ExamCenterView {
    const matched = EXAM_CENTER_VIEW_OPTIONS.find((item) => item.key === value);
    return matched?.key || 'all';
}

function _examModeLabel(value: unknown): 'External Link' | 'Internal Exam' {
    return String(value || '').trim().toLowerCase() === 'external_link' ? 'External Link' : 'Internal Exam';
}

function _getExamCenterLabel(exam: Record<string, unknown>): string {
    const snapshot = exam.examCenterSnapshot && typeof exam.examCenterSnapshot === 'object'
        ? exam.examCenterSnapshot as Record<string, unknown>
        : null;
    return String(snapshot?.name || exam.examCenterName || '').trim();
}

const autoDetectExamCenterMapping = _autoDetectExamCenterMapping;
const stringifyJsonBlock = _stringifyJsonBlock;
const examModeLabel = _examModeLabel;
const getExamCenterLabel = _getExamCenterLabel;

async function extractImportPreview(file: File): Promise<{ columns: string[]; rows: Array<Record<string, unknown>> }> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { columns: [], rows: [] };
    const sheet = workbook.Sheets[sheetName];
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    const columns = (Array.isArray(headerRows[0]) ? headerRows[0] : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false }).slice(0, 3);
    return { columns, rows };
}

export function AdminExamsPage() {
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<AdminTab>('list');
    const [centerView, setCenterView] = useState<ExamCenterView>(() => normalizeCenterViewParam(searchParams.get('tab')));
    const [selectedExamId, setSelectedExamId] = useState('');
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState<Record<string, unknown>>({ ...defaultExamFields });
    const [questionForm, setQuestionForm] = useState<Record<string, unknown>>({ ...defaultQuestionFields });
    const [workspaceExamId, setWorkspaceExamId] = useState('');

    const [importWizardFile, _setImportWizardFile] = useState<File | null>(null);
    const [_importWizardColumns, _setImportWizardColumns] = useState<string[]>([]);
    const [_importWizardRows, _setImportWizardRows] = useState<Array<Record<string, unknown>>>([]);
    const [_importWizardMappingSelections, _setImportWizardMappingSelections] = useState<Record<string, string>>({});
    const [_importWizardManualMappingJson, _setImportWizardManualMappingJson] = useState('');
    const [_importWizardTemplateId, _setImportWizardTemplateId] = useState('');
    const [_importWizardMappingProfileId, _setImportWizardMappingProfileId] = useState('');
    const [_importWizardMatchPriority, _setImportWizardMatchPriority] = useState(DEFAULT_MATCH_PRIORITY.join(', '));
    const [_importWizardSyncMode, _setImportWizardSyncMode] = useState<Exclude<ExamCenterSyncMode, 'none'>>('overwrite_mapped_fields');
    const [importWizardPreview, setImportWizardPreview] = useState<ExamImportPreviewResponse | null>(null);

    const [_editingTemplateId, _setEditingTemplateId] = useState<string | null>(null);
    const [_templateForm, _setTemplateForm] = useState<TemplateFormState>(createDefaultTemplateForm());
    const [_editingMappingProfileId, _setEditingMappingProfileId] = useState<string | null>(null);
    const [_mappingProfileForm, _setMappingProfileForm] = useState<MappingProfileFormState>(createDefaultMappingProfileForm());
    const [_editingCenterId, _setEditingCenterId] = useState<string | null>(null);
    const [_examCenterForm, _setExamCenterForm] = useState<ExamCenterFormState>(createDefaultExamCenterForm());
    const [_settingsForm, _setSettingsForm] = useState<ExamCenterSettings>(DEFAULT_EXAM_CENTER_SETTINGS);
    const [_savedSettingsForm, _setSavedSettingsForm] = useState<ExamCenterSettings>(DEFAULT_EXAM_CENTER_SETTINGS);

    const importWizardTemplateId = _importWizardTemplateId;
    const setImportWizardTemplateId = _setImportWizardTemplateId;
    const importWizardMappingProfileId = _importWizardMappingProfileId;
    const setImportWizardMappingProfileId = _setImportWizardMappingProfileId;
    const importWizardMatchPriority = _importWizardMatchPriority;
    const setImportWizardMatchPriority = _setImportWizardMatchPriority;
    const importWizardSyncMode = _importWizardSyncMode;
    const setImportWizardSyncMode = _setImportWizardSyncMode;
    const importWizardColumns = _importWizardColumns;
    const setImportWizardColumns = _setImportWizardColumns;
    const importWizardRows = _importWizardRows;
    const setImportWizardRows = _setImportWizardRows;
    const importWizardMappingSelections = _importWizardMappingSelections;
    const setImportWizardMappingSelections = _setImportWizardMappingSelections;
    const importWizardManualMappingJson = _importWizardManualMappingJson;
    const setImportWizardManualMappingJson = _setImportWizardManualMappingJson;
    const setImportWizardFile = _setImportWizardFile;
    const editingTemplateId = _editingTemplateId;
    const setEditingTemplateId = _setEditingTemplateId;
    const templateForm = _templateForm;
    const setTemplateForm = _setTemplateForm;
    const editingMappingProfileId = _editingMappingProfileId;
    const setEditingMappingProfileId = _setEditingMappingProfileId;
    const mappingProfileForm = _mappingProfileForm;
    const setMappingProfileForm = _setMappingProfileForm;
    const editingCenterId = _editingCenterId;
    const setEditingCenterId = _setEditingCenterId;
    const examCenterForm = _examCenterForm;
    const setExamCenterForm = _setExamCenterForm;
    const settingsForm = _settingsForm;
    const setSettingsForm = _setSettingsForm;
    const savedSettingsForm = _savedSettingsForm;

    // --- Legacy state (kept for result import/export) ---
    const [groupId, setGroupId] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [groupSearch, setGroupSearch] = useState('');
    const [importMode, setImportMode] = useState<'internal' | 'external'>('internal');
    const [syncProfileMode, setSyncProfileMode] = useState<'none' | 'fill_missing_only' | 'overwrite_mapped_fields'>('fill_missing_only');
    const [mappingJson, setMappingJson] = useState('');
    const [detectedImportColumns, setDetectedImportColumns] = useState<string[]>([]);
    const [sampleImportRows, setSampleImportRows] = useState<Array<Record<string, unknown>>>([]);
    const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});

    // --- Queries ---
    const examsQuery = useQuery({ queryKey: ['admin-exams'], queryFn: listAdminExams });
    const examCenterTemplatesQuery = useQuery({
        queryKey: ['admin-exam-center-templates'],
        queryFn: getExamImportTemplates,
        enabled: tab === 'list' || tab === 'create' || tab === 'edit',
        staleTime: 60_000,
    });
    const examMappingProfilesQuery = useQuery({
        queryKey: ['admin-exam-center-mapping-profiles'],
        queryFn: getExamMappingProfiles,
        enabled: tab === 'list' || tab === 'create' || tab === 'edit',
        staleTime: 60_000,
    });
    const examCentersQuery = useQuery({
        queryKey: ['admin-exam-centers'],
        queryFn: getExamCenters,
        enabled: tab === 'list' || tab === 'create' || tab === 'edit',
        staleTime: 60_000,
    });
    const examCenterSettingsQuery = useQuery({
        queryKey: ['admin-exam-center-settings'],
        queryFn: getExamCenterSettings,
        enabled: tab === 'list' && centerView === 'settings',
        staleTime: 60_000,
    });
    const groupsQuery = useQuery({
        queryKey: ['admin-student-groups'],
        queryFn: () => getStudentGroups(),
        enabled: tab === 'create' || tab === 'edit',
        staleTime: 60_000,
    });
    const questionsQuery = useQuery({
        queryKey: ['admin-exam-questions', selectedExamId],
        queryFn: () => listAdminExamQuestions(selectedExamId),
        enabled: Boolean(selectedExamId) && tab === 'questions',
    });
    const resultsQuery = useQuery({
        queryKey: ['admin-exam-results', selectedExamId],
        queryFn: () => getAdminExamResults(selectedExamId),
        enabled: Boolean(selectedExamId) && tab === 'results',
    });
    const paymentsQuery = useQuery({
        queryKey: ['admin-payments'],
        queryFn: listAdminPayments,
        enabled: tab === 'payments',
    });

    // Legacy exam list for import/export
    const legacyExamsQuery = useQuery({
        queryKey: ['admin', 'exams', 'workspace'],
        queryFn: async () => (await adminGetExams({ limit: 200 })).data.exams || [],
        enabled: tab === 'results',
    });
    const legacyExams = useMemo<AdminExamCard[]>(
        () => (Array.isArray(legacyExamsQuery.data) ? legacyExamsQuery.data : []),
        [legacyExamsQuery.data],
    );

    const _examTemplates = useMemo(
        () => (Array.isArray(examCenterTemplatesQuery.data) ? examCenterTemplatesQuery.data : []),
        [examCenterTemplatesQuery.data],
    );
    const _examMappingProfiles = useMemo(
        () => (Array.isArray(examMappingProfilesQuery.data) ? examMappingProfilesQuery.data : []),
        [examMappingProfilesQuery.data],
    );
    const _examCenters = useMemo(
        () => (Array.isArray(examCentersQuery.data) ? examCentersQuery.data : []),
        [examCentersQuery.data],
    );
    const _examImportLogsQuery = useQuery({
        queryKey: ['admin-exam-import-logs', workspaceExamId],
        queryFn: () => getExamImportLogs(workspaceExamId),
        enabled: tab === 'list' && centerView === 'sync-logs' && Boolean(workspaceExamId),
    });
    const _examProfileSyncLogsQuery = useQuery({
        queryKey: ['admin-exam-profile-sync-logs', workspaceExamId],
        queryFn: () => getExamProfileSyncLogs(workspaceExamId),
        enabled: tab === 'list' && centerView === 'sync-logs' && Boolean(workspaceExamId),
    });
    const examTemplates = _examTemplates;
    const examMappingProfiles = _examMappingProfiles;
    const examCenters = _examCenters;
    const examImportLogsQuery = _examImportLogsQuery;
    const examProfileSyncLogsQuery = _examProfileSyncLogsQuery;

    // --- Mutations ---
    const createMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => createAdminExam(data),
        onSuccess: () => { toast.success('Exam created'); qc.invalidateQueries({ queryKey: ['admin-exams'] }); setTab('list'); },
        onError: () => toast.error('Failed to create exam'),
    });
    const updateMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => updateAdminExam(selectedExamId, data),
        onSuccess: () => { toast.success('Exam updated'); qc.invalidateQueries({ queryKey: ['admin-exams'] }); setTab('list'); },
        onError: () => toast.error('Failed to update exam'),
    });
    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminExam(id),
        onSuccess: () => { toast.success('Exam deleted'); qc.invalidateQueries({ queryKey: ['admin-exams'] }); },
        onError: () => toast.error('Failed to delete exam'),
    });
    const createQuestionMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => createAdminQuestion(selectedExamId, data),
        onSuccess: () => { toast.success('Question added'); qc.invalidateQueries({ queryKey: ['admin-exam-questions', selectedExamId] }); setQuestionForm({ ...defaultQuestionFields }); },
        onError: () => toast.error('Failed to add question'),
    });
    const updateQuestionMutation = useMutation({
        mutationFn: ({ qId, data }: { qId: string; data: Record<string, unknown> }) => updateAdminQuestion(selectedExamId, qId, data),
        onSuccess: () => { toast.success('Question updated'); qc.invalidateQueries({ queryKey: ['admin-exam-questions', selectedExamId] }); setEditingQuestionId(null); setQuestionForm({ ...defaultQuestionFields }); },
        onError: () => toast.error('Failed to update question'),
    });
    const deleteQuestionMutation = useMutation({
        mutationFn: (qId: string) => deleteAdminQuestion(selectedExamId, qId),
        onSuccess: () => { toast.success('Question deleted'); qc.invalidateQueries({ queryKey: ['admin-exam-questions', selectedExamId] }); },
        onError: () => toast.error('Failed to delete question'),
    });
    const publishMutation = useMutation({
        mutationFn: () => publishExamResults(selectedExamId),
        onSuccess: () => { toast.success('Results published'); qc.invalidateQueries({ queryKey: ['admin-exam-results', selectedExamId] }); },
        onError: () => toast.error('Publish failed'),
    });
    const verifyPaymentMutation = useMutation({
        mutationFn: ({ id, notes }: { id: string; notes?: string }) => verifyPayment(id, notes),
        onSuccess: () => { toast.success('Payment verified'); qc.invalidateQueries({ queryKey: ['admin-payments'] }); },
        onError: () => toast.error('Verification failed'),
    });
    const _previewExamImportMutation = useMutation({
        mutationFn: async () => {
            if (!workspaceExamId) throw new Error('Select an exam first.');
            if (!importWizardFile) throw new Error('Choose an import file first.');
            const manualMapping = parseJsonRecord(_importWizardManualMappingJson, 'manual mapping');
            const mapping = {
                ...Object.entries(_importWizardMappingSelections).reduce<Record<string, string>>((acc, [key, value]) => {
                    const normalizedKey = String(key || '').trim();
                    const normalizedValue = String(value || '').trim();
                    if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
                    return acc;
                }, {}),
                ...manualMapping,
            };

            return previewExamImport(workspaceExamId, importWizardFile, {
                templateId: _importWizardTemplateId || undefined,
                mappingProfileId: _importWizardMappingProfileId || undefined,
                mapping,
                matchPriority: parseDelimitedList(_importWizardMatchPriority),
                syncProfileMode: _importWizardSyncMode,
            });
        },
        onSuccess: (payload) => {
            setImportWizardPreview(payload);
            toast.success(`Preview ready: ${payload.job.summary.matchedRows} matched, ${payload.job.summary.invalidRows} invalid.`);
        },
        onError: (error: Error) => toast.error(error.message || 'Failed to preview import.'),
    });
    const _commitExamImportMutation = useMutation({
        mutationFn: async () => {
            if (!workspaceExamId) throw new Error('Select an exam first.');
            if (!importWizardPreview?.job.previewToken) throw new Error('Preview the import first.');
            return commitExamImport(workspaceExamId, importWizardPreview.job.previewToken, _importWizardSyncMode);
        },
        onSuccess: async () => {
            toast.success('Import committed and profiles synced.');
            setImportWizardPreview(null);
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['admin-exams'] }),
                qc.invalidateQueries({ queryKey: ['admin-exam-import-logs', workspaceExamId] }),
                qc.invalidateQueries({ queryKey: ['admin-exam-profile-sync-logs', workspaceExamId] }),
            ]);
        },
        onError: (error: Error) => toast.error(error.message || 'Import commit failed.'),
    });
    const _createTemplateMutation = useMutation({
        mutationFn: createExamImportTemplate,
        onSuccess: () => {
            toast.success('Import template saved.');
            _setEditingTemplateId(null);
            _setTemplateForm(createDefaultTemplateForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-center-templates'] });
        },
        onError: () => toast.error('Failed to save template.'),
    });
    const _updateTemplateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => updateExamImportTemplate(id, payload),
        onSuccess: () => {
            toast.success('Import template updated.');
            _setEditingTemplateId(null);
            _setTemplateForm(createDefaultTemplateForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-center-templates'] });
        },
        onError: () => toast.error('Failed to update template.'),
    });
    const _deleteTemplateMutation = useMutation({
        mutationFn: deleteExamImportTemplate,
        onSuccess: () => {
            toast.success('Template deleted.');
            qc.invalidateQueries({ queryKey: ['admin-exam-center-templates'] });
        },
        onError: () => toast.error('Failed to delete template.'),
    });
    const _createMappingProfileMutation = useMutation({
        mutationFn: createExamMappingProfile,
        onSuccess: () => {
            toast.success('Mapping profile saved.');
            _setEditingMappingProfileId(null);
            _setMappingProfileForm(createDefaultMappingProfileForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-center-mapping-profiles'] });
        },
        onError: () => toast.error('Failed to save mapping profile.'),
    });
    const _updateMappingProfileMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => updateExamMappingProfile(id, payload),
        onSuccess: () => {
            toast.success('Mapping profile updated.');
            _setEditingMappingProfileId(null);
            _setMappingProfileForm(createDefaultMappingProfileForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-center-mapping-profiles'] });
        },
        onError: () => toast.error('Failed to update mapping profile.'),
    });
    const _deleteMappingProfileMutation = useMutation({
        mutationFn: deleteExamMappingProfile,
        onSuccess: () => {
            toast.success('Mapping profile deleted.');
            qc.invalidateQueries({ queryKey: ['admin-exam-center-mapping-profiles'] });
        },
        onError: () => toast.error('Failed to delete mapping profile.'),
    });
    const _createExamCenterMutation = useMutation({
        mutationFn: createExamCenter,
        onSuccess: () => {
            toast.success('Exam center saved.');
            _setEditingCenterId(null);
            _setExamCenterForm(createDefaultExamCenterForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-centers'] });
        },
        onError: () => toast.error('Failed to save exam center.'),
    });
    const _updateExamCenterMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => updateExamCenter(id, payload),
        onSuccess: () => {
            toast.success('Exam center updated.');
            _setEditingCenterId(null);
            _setExamCenterForm(createDefaultExamCenterForm());
            qc.invalidateQueries({ queryKey: ['admin-exam-centers'] });
        },
        onError: () => toast.error('Failed to update exam center.'),
    });
    const _deleteExamCenterMutation = useMutation({
        mutationFn: deleteExamCenter,
        onSuccess: () => {
            toast.success('Exam center deleted.');
            qc.invalidateQueries({ queryKey: ['admin-exam-centers'] });
        },
        onError: () => toast.error('Failed to delete exam center.'),
    });
    const _runExamProfileSyncMutation = useMutation({
        mutationFn: () => {
            if (!workspaceExamId) throw new Error('Select an exam first.');
            return runExamProfileSync(workspaceExamId);
        },
        onSuccess: async (payload) => {
            toast.success(`Profile sync complete. Synced ${payload.synced}, failed ${payload.failed}.`);
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['admin-exam-profile-sync-logs', workspaceExamId] }),
                qc.invalidateQueries({ queryKey: ['admin-exam-import-logs', workspaceExamId] }),
            ]);
        },
        onError: (error: Error) => toast.error(error.message || 'Failed to run profile sync.'),
    });
    const _updateExamCenterSettingsMutation = useMutation({
        mutationFn: updateExamCenterSettings,
        onSuccess: async (payload) => {
            _setSettingsForm(payload);
            _setSavedSettingsForm(payload);
            toast.success('Exam Center settings updated.');
            await qc.invalidateQueries({ queryKey: ['admin-exam-center-settings'] });
        },
        onError: () => toast.error('Failed to update settings.'),
    });
    const previewExamImportMutation = _previewExamImportMutation;
    const commitExamImportMutation = _commitExamImportMutation;
    const createTemplateMutation = _createTemplateMutation;
    const updateTemplateMutation = _updateTemplateMutation;
    const deleteTemplateMutation = _deleteTemplateMutation;
    const createMappingProfileMutation = _createMappingProfileMutation;
    const updateMappingProfileMutation = _updateMappingProfileMutation;
    const deleteMappingProfileMutation = _deleteMappingProfileMutation;
    const createExamCenterMutation = _createExamCenterMutation;
    const updateExamCenterMutation = _updateExamCenterMutation;
    const deleteExamCenterMutation = _deleteExamCenterMutation;
    const runExamProfileSyncMutation = _runExamProfileSyncMutation;
    const updateExamCenterSettingsMutation = _updateExamCenterSettingsMutation;

    const exams: Array<Record<string, unknown>> = Array.isArray(examsQuery.data) ? examsQuery.data : [];
    const filteredExams = useMemo(() => {
        if (!searchTerm.trim()) return exams;
        const q = searchTerm.toLowerCase();
        return exams.filter((e) => String(e.title || '').toLowerCase().includes(q) || String(e.subject || '').toLowerCase().includes(q));
    }, [exams, searchTerm]);
    const _externalExams = useMemo(
        () => filteredExams.filter((exam) => String(exam.deliveryMode || '').trim().toLowerCase() === 'external_link'),
        [filteredExams],
    );
    const _internalExams = useMemo(
        () => filteredExams.filter((exam) => String(exam.deliveryMode || 'internal').trim().toLowerCase() !== 'external_link'),
        [filteredExams],
    );
    const _activeWorkspaceExam = useMemo(
        () => exams.find((exam) => String(exam._id || '') === workspaceExamId) || null,
        [exams, workspaceExamId],
    );
    const externalExams = _externalExams;
    const internalExams = _internalExams;
    const activeWorkspaceExam = _activeWorkspaceExam;

    useEffect(() => {
        const nextCenterView = normalizeCenterViewParam(searchParams.get('tab'));
        if (nextCenterView !== centerView) setCenterView(nextCenterView);
    }, [centerView, searchParams]);

    useEffect(() => {
        if (!workspaceExamId && exams.length > 0) {
            setWorkspaceExamId(String(exams[0]._id || ''));
        }
    }, [exams, workspaceExamId]);

    useEffect(() => {
        if (examCenterSettingsQuery.data) {
            _setSettingsForm(examCenterSettingsQuery.data);
            _setSavedSettingsForm(examCenterSettingsQuery.data);
        }
    }, [examCenterSettingsQuery.data]);

    const isExamCenterSettingsDirty = JSON.stringify(settingsForm) !== JSON.stringify(savedSettingsForm);
    const resetExamCenterSettings = () => _setSettingsForm(savedSettingsForm);

    const openEdit = useCallback(async (examId: string) => {
        setSelectedExamId(examId);
        setWorkspaceExamId(examId);
        try {
            const raw = await getAdminExam(examId);
            const data: Record<string, unknown> = { ...raw };
            const toLocalDT = (v: unknown) => v ? String(v).replace(/Z$/, '').slice(0, 16) : '';
            // Normalize legacy Exam.ts field names → form field names
            if (data.startDate && !data.examWindowStartUTC) data.examWindowStartUTC = toLocalDT(data.startDate);
            if (data.endDate && !data.examWindowEndUTC) data.examWindowEndUTC = toLocalDT(data.endDate);
            if (data.duration !== undefined && data.durationMinutes === undefined) data.durationMinutes = data.duration;
            if (data.resultPublishDate && !data.resultPublishAtUTC) data.resultPublishAtUTC = toLocalDT(data.resultPublishDate);
            if (data.group_category && !data.examCategory) data.examCategory = data.group_category;
            if (data.randomizeQuestions !== undefined && data.shuffleQuestions === undefined) data.shuffleQuestions = data.randomizeQuestions;
            if (data.randomizeOptions !== undefined && data.shuffleOptions === undefined) data.shuffleOptions = data.randomizeOptions;
            if (data.negativeMarking !== undefined && data.negativeMarkingEnabled === undefined) data.negativeMarkingEnabled = data.negativeMarking;
            if (data.negativeMarkValue !== undefined && data.negativePerWrong === undefined) data.negativePerWrong = data.negativeMarkValue;
            if (data.answerEditLimitPerQuestion !== undefined && data.answerChangeLimit === undefined) data.answerChangeLimit = data.answerEditLimitPerQuestion;
            if (data.showRemainingTime !== undefined && data.showTimer === undefined) data.showTimer = data.showRemainingTime;
            if (!data.deliveryMode && data.examType) data.deliveryMode = String(data.examType) === 'external_link' ? 'external_link' : 'internal';
            if (!data.deliveryMode) data.deliveryMode = 'internal';
            if (!data.slug) data.slug = '';
            if (data.examCenterId && typeof data.examCenterId === 'object') data.examCenterId = String((data.examCenterId as Record<string, unknown>)._id || '');
            if (data.templateId && typeof data.templateId === 'object') data.templateId = String((data.templateId as Record<string, unknown>)._id || '');
            if (data.importProfileId && typeof data.importProfileId === 'object') data.importProfileId = String((data.importProfileId as Record<string, unknown>)._id || '');
            if (!data.externalExamUrl) data.externalExamUrl = '';
            if (!data.examCenterId) data.examCenterId = '';
            if (!data.templateId) data.templateId = '';
            if (!data.importProfileId) data.importProfileId = '';
            // Normalize visibility fields
            if (!data.visibilityMode) data.visibilityMode = 'all_students';
            if (!Array.isArray(data.targetGroupIds)) data.targetGroupIds = [];
            else data.targetGroupIds = (data.targetGroupIds as Array<unknown>).map((id) => String(id));
            setFormData(data);
        } catch {
            toast.error('Failed to load exam');
        }
        setTab('edit');
    }, []);

    const openQuestions = useCallback((examId: string) => {
        setSelectedExamId(examId);
        setWorkspaceExamId(examId);
        setTab('questions');
    }, []);

    const openResults = useCallback((examId: string) => {
        setSelectedExamId(examId);
        setWorkspaceExamId(examId);
        setTab('results');
    }, []);

    const setField = (key: string, value: unknown) => setFormData((prev) => ({ ...prev, [key]: value }));
    const setQField = (key: string, value: unknown) => setQuestionForm((prev) => ({ ...prev, [key]: value }));

    const loadExternalImportPreview = useCallback(async (file: File | null) => {
        if (!file) {
            setDetectedImportColumns([]);
            setSampleImportRows([]);
            setMappingSelections({});
            return;
        }
        try {
            const preview = await extractImportPreview(file);
            setDetectedImportColumns(preview.columns);
            setSampleImportRows(preview.rows);
            setMappingSelections(autoDetectExternalMapping(preview.columns));
        } catch (error) {
            console.error('[AdminExamsPage external import preview]', error);
            setDetectedImportColumns([]);
            setSampleImportRows([]);
            setMappingSelections({});
            toast.error('Failed to read import file preview.');
        }
    }, []);

    useEffect(() => {
        if (importMode !== 'external') {
            setDetectedImportColumns([]);
            setSampleImportRows([]);
            setMappingSelections({});
            return;
        }
        if (uploadFile) {
            void loadExternalImportPreview(uploadFile);
        }
    }, [importMode, uploadFile, loadExternalImportPreview]);

    const changeCenterView = (nextView: ExamCenterView) => {
        setCenterView(nextView);
        const nextSearchParams = new URLSearchParams(searchParams);
        if (nextView === 'all') nextSearchParams.delete('tab');
        else nextSearchParams.set('tab', nextView);
        setSearchParams(nextSearchParams, { replace: true });
    };

    const loadImportWizardPreview = useCallback(async (file: File | null) => {
        if (!file) {
            setImportWizardColumns([]);
            setImportWizardRows([]);
            setImportWizardMappingSelections({});
            return;
        }
        try {
            const preview = await extractImportPreview(file);
            setImportWizardColumns(preview.columns);
            setImportWizardRows(preview.rows);
            setImportWizardMappingSelections(autoDetectExamCenterMapping(preview.columns));
        } catch (error) {
            console.error('[AdminExamsPage exam-center import preview]', error);
            setImportWizardColumns([]);
            setImportWizardRows([]);
            setImportWizardMappingSelections({});
            toast.error('Failed to read import wizard preview.');
        }
    }, [setImportWizardColumns, setImportWizardMappingSelections, setImportWizardRows]);

    useEffect(() => {
        if (importWizardFile) {
            void loadImportWizardPreview(importWizardFile);
            return;
        }
        setImportWizardColumns([]);
        setImportWizardRows([]);
        setImportWizardMappingSelections({});
    }, [importWizardFile, loadImportWizardPreview, setImportWizardColumns, setImportWizardMappingSelections, setImportWizardRows]);

    const buildExamMutationPayload = () => ({
        ...formData,
        deliveryMode: String(formData.deliveryMode || 'internal') === 'external_link' ? 'external_link' : 'internal',
        slug: String(formData.slug || '').trim() || undefined,
        externalExamUrl: String(formData.externalExamUrl || '').trim() || undefined,
        examCenterId: String(formData.examCenterId || '').trim() || undefined,
        templateId: String(formData.templateId || '').trim() || undefined,
        importProfileId: String(formData.importProfileId || '').trim() || undefined,
    });

    const submitTemplateForm = () => {
        try {
            const payload = {
                name: templateForm.name.trim(),
                description: templateForm.description.trim() || undefined,
                expectedColumns: parseDelimitedList(templateForm.expectedColumns),
                requiredColumns: parseDelimitedList(templateForm.requiredColumns),
                columnMapping: parseJsonRecord(templateForm.columnMappingJson, 'template mapping'),
                matchPriority: parseDelimitedList(templateForm.matchPriority),
                profileUpdateFields: parseDelimitedList(templateForm.profileUpdateFields),
                recordOnlyFields: parseDelimitedList(templateForm.recordOnlyFields),
                isActive: templateForm.isActive,
            };
            if (!payload.name) {
                toast.error('Template name is required.');
                return;
            }
            if (editingTemplateId) updateTemplateMutation.mutate({ id: editingTemplateId, payload });
            else createTemplateMutation.mutate(payload);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invalid template form.');
        }
    };

    const submitMappingProfileForm = () => {
        try {
            const payload = {
                name: mappingProfileForm.name.trim(),
                description: mappingProfileForm.description.trim() || undefined,
                matchPriority: parseDelimitedList(mappingProfileForm.matchPriority),
                fieldMapping: parseJsonRecord(mappingProfileForm.fieldMappingJson, 'mapping profile'),
                requiredColumns: parseDelimitedList(mappingProfileForm.requiredColumns),
                isActive: mappingProfileForm.isActive,
            };
            if (!payload.name) {
                toast.error('Mapping profile name is required.');
                return;
            }
            if (editingMappingProfileId) updateMappingProfileMutation.mutate({ id: editingMappingProfileId, payload });
            else createMappingProfileMutation.mutate(payload);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invalid mapping profile form.');
        }
    };

    const submitExamCenterForm = () => {
        const payload = {
            name: examCenterForm.name.trim(),
            address: examCenterForm.address.trim(),
            code: examCenterForm.code.trim() || undefined,
            note: examCenterForm.note.trim() || undefined,
            isActive: examCenterForm.isActive,
        };
        if (!payload.name || !payload.address) {
            toast.error('Exam center name and address are required.');
            return;
        }
        if (editingCenterId) updateExamCenterMutation.mutate({ id: editingCenterId, payload });
        else createExamCenterMutation.mutate(payload);
    };

    // --- Legacy helpers ---
    const downloadTemplate = async (format: 'xlsx' | 'csv') => {
        if (!selectedExamId) { toast.error('Select an exam first.'); return; }
        try {
            setBusy(true);
            const response = await adminDownloadExamResultImportTemplate(selectedExamId, format, importMode);
            downloadFile(response, { filename: `exam_results_${importMode}_import_template.${format}` });
        } catch { toast.error('Failed to download template.'); } finally { setBusy(false); }
    };
    const importResults = async () => {
        if (!selectedExamId) { toast.error('Select an exam first.'); return; }
        if (!uploadFile) { toast.error('Choose a file to import.'); return; }
        try {
            setBusy(true);
            let mapping: Record<string, string> | undefined;
            if (importMode === 'external') {
                mapping = Object.entries(mappingSelections).reduce<Record<string, string>>((acc, [key, value]) => {
                    const normalizedKey = String(key || '').trim();
                    const normalizedValue = String(value || '').trim();
                    if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
                    return acc;
                }, {});
                if (mappingJson.trim()) {
                    const parsed = JSON.parse(mappingJson) as unknown;
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        throw new Error('Mapping JSON must be an object.');
                    }
                    mapping = {
                        ...mapping,
                        ...Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
                            const normalizedKey = String(key || '').trim();
                            const normalizedValue = String(value || '').trim();
                            if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
                            return acc;
                        }, {}),
                    };
                }
            }

            const response = importMode === 'external'
                ? await adminImportExternalExamResultsFile(selectedExamId, uploadFile, {
                    mapping,
                    syncProfileMode,
                })
                : await adminImportExamResultsFile(selectedExamId, uploadFile);
            const payload = response.data as {
                imported?: number;
                invalid?: number;
                profileUpdates?: number;
                errors?: Array<{ rowNo?: number; registration_id?: string; reason?: string }>;
            };
            const message = importMode === 'external'
                ? `External import done. Imported: ${payload.imported || 0}, Invalid: ${payload.invalid || 0}, Profile updated: ${payload.profileUpdates || 0}`
                : `Import done. Imported: ${payload.imported || 0}, Invalid: ${payload.invalid || 0}`;
            toast.success(message);
            if (Array.isArray(payload.errors) && payload.errors.length > 0) {
                const lines = ['rowNo,registration_id,reason', ...payload.errors.map((row) =>
                    `${Number(row.rowNo || 0)},"${String(row.registration_id || '').replace(/"/g, '""')}","${String(row.reason || '').replace(/"/g, '""')}"`
                )];
                downloadFile(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), {
                    filename: 'import_errors.csv',
                    contentType: 'text/csv;charset=utf-8',
                });
            }
            setUploadFile(null);
            setDetectedImportColumns([]);
            setSampleImportRows([]);
            setMappingSelections({});
            setMappingJson('');
        } catch (error: any) {
            toast.error(error?.message || error?.response?.data?.message || 'Import failed.');
        } finally { setBusy(false); }
    };
    const exportReport = async (format: 'xlsx' | 'csv' | 'pdf') => {
        if (!selectedExamId) { toast.error('Select an exam first.'); return; }
        try {
            setBusy(true);
            const proof = await promptForSensitiveActionProof({
                actionLabel: `export ${format.toUpperCase()} exam report`,
                defaultReason: `Export exam report ${selectedExamId}`,
                requireOtpHint: true,
            });
            if (!proof) return;
            const response = await adminExportExamReport(selectedExamId, { format, groupId: groupId.trim() || undefined }, proof);
            downloadFile(response, { filename: `exam_report.${format}` });
        } catch { toast.error('Export failed.'); } finally { setBusy(false); }
    };
    const exportLegacyResult = async () => {
        if (!selectedExamId) { toast.error('Select an exam first.'); return; }
        try {
            setBusy(true);
            const proof = await promptForSensitiveActionProof({
                actionLabel: 'export exam results',
                defaultReason: `Export exam results ${selectedExamId}`,
                requireOtpHint: true,
            });
            if (!proof) return;
            const response = await adminExportExamResults(selectedExamId, proof);
            downloadFile(response, { filename: 'exam_results.xlsx' });
        } catch { toast.error('Legacy export failed.'); } finally { setBusy(false); }
    };

    const renderFormField = (label: string, key: string, type: 'text' | 'number' | 'datetime-local' | 'select' | 'checkbox' | 'textarea' = 'text', options?: string[]) => {
        if (type === 'checkbox') {
            return (
                <div key={key} className="pt-6">
                    <ModernToggle
                        label={label}
                        checked={Boolean(formData[key])}
                        onChange={(v) => setField(key, v)}
                        size="sm"
                    />
                </div>
            );
        }
        return (
            <label key={key} className="block">
                <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">{label}</span>
                {type === 'textarea' ? (
                    <textarea value={String(formData[key] ?? '')} onChange={(e) => setField(key, e.target.value)} className="admin-input mt-1" rows={3} />
                ) : type === 'select' ? (
                    <select value={String(formData[key] ?? '')} onChange={(e) => setField(key, e.target.value)} className="admin-input mt-1">
                        {options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                ) : (
                    <input type={type} value={type === 'number' ? Number(formData[key] ?? 0) : String(formData[key] ?? '')} onChange={(e) => setField(key, type === 'number' ? Number(e.target.value) : e.target.value)} className="admin-input mt-1" />
                )}
            </label>
        );
    };

    // ═══════════════════════════════════════════════
    // TAB: EXAM LIST
    // ═══════════════════════════════════════════════
    if (tab === 'list') {
        const listViewExams = centerView === 'external'
            ? externalExams
            : centerView === 'internal'
                ? internalExams
                : filteredExams;
        const importLogs = examImportLogsQuery.data?.logs ?? [];
        const importIssues = examImportLogsQuery.data?.issues ?? [];
        const syncLogs = Array.isArray(examProfileSyncLogsQuery.data) ? examProfileSyncLogsQuery.data : [];

        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg md:text-xl font-bold text-text dark:text-dark-text">Exam Center</h2>
                        <p className="text-xs md:text-sm text-text-muted dark:text-dark-text/60 line-clamp-2">Unified external and internal exam operations with imports, templates, sync, and center management.</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setTab('payments')} className="btn-secondary">
                            <CreditCard className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Payments</span>
                        </button>
                        <button type="button" onClick={() => { setFormData({ ...defaultExamFields }); setTab('create'); }} className="btn-primary">
                            <Plus className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Create Exam</span><span className="sm:hidden">New</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:gap-3 md:grid-cols-4">
                    <div className="admin-panel-bg rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Total Exams</p>
                        <p className="mt-2 text-2xl font-bold text-text dark:text-dark-text">{exams.length}</p>
                    </div>
                    <div className="admin-panel-bg rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">External</p>
                        <p className="mt-2 text-2xl font-bold text-sky-600">{externalExams.length}</p>
                    </div>
                    <div className="admin-panel-bg rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Internal</p>
                        <p className="mt-2 text-2xl font-bold text-emerald-600">{internalExams.length}</p>
                    </div>
                    <div className="admin-panel-bg rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Centers</p>
                        <p className="mt-2 text-2xl font-bold text-violet-600">{examCenters.length}</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                    {EXAM_CENTER_VIEW_OPTIONS.map((item) => {
                        const Icon = item.icon;
                        const active = centerView === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => changeCenterView(item.key)}
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${active
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-card-border bg-white text-text-muted hover:border-primary/30 hover:text-text dark:border-slate-700 dark:bg-slate-900 dark:text-dark-text/70'
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search exams..." className="admin-input pl-9" />
                </div>

                {examsQuery.isLoading ? <p className="text-sm text-text-muted">Loading exams...</p> : null}
                {examsQuery.isError ? (
                    <div className="flex items-center gap-2 text-sm text-danger">
                        <AlertTriangle className="h-4 w-4" />Failed to load exams.
                        <button type="button" onClick={() => examsQuery.refetch()} className="btn-ghost" title="Retry loading exams"><RefreshCw className="h-3.5 w-3.5" /></button>
                    </div>
                ) : null}

                {centerView === 'imports' ? (
                    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                        <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-900 dark:text-cyan-100">
                                Upload the result sheet, review the detected columns, then save reusable mapping profiles or templates for the next import run.
                            </div>
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">External Result Import Wizard</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Exam</span>
                                    <select value={workspaceExamId} onChange={(e) => setWorkspaceExamId(e.target.value)} className="admin-input mt-1">
                                        <option value="">Select exam...</option>
                                        {externalExams.map((exam) => (
                                            <option key={String(exam._id)} value={String(exam._id)}>{String(exam.title || 'Untitled Exam')}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Import Template</span>
                                    <select value={importWizardTemplateId} onChange={(e) => setImportWizardTemplateId(e.target.value)} className="admin-input mt-1">
                                        <option value="">Auto-detect</option>
                                        {examTemplates.map((template) => (
                                            <option key={template._id} value={template._id}>{template.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Mapping Profile</span>
                                    <select value={importWizardMappingProfileId} onChange={(e) => setImportWizardMappingProfileId(e.target.value)} className="admin-input mt-1">
                                        <option value="">No profile</option>
                                        {examMappingProfiles.map((profile) => (
                                            <option key={profile._id} value={profile._id}>{profile.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Sync Mode</span>
                                    <select value={importWizardSyncMode} onChange={(e) => setImportWizardSyncMode(e.target.value as Exclude<ExamCenterSyncMode, 'none'>)} className="admin-input mt-1">
                                        <option value="overwrite_mapped_fields">Overwrite mapped fields</option>
                                        <option value="fill_missing_only">Fill missing only</option>
                                    </select>
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Match Priority</span>
                                <input value={importWizardMatchPriority} onChange={(e) => setImportWizardMatchPriority(e.target.value)} className="admin-input mt-1" placeholder="user_id, student_phone, roll_number" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Upload CSV / XLSX</span>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setImportWizardFile(file);
                                        setImportWizardPreview(null);
                                    }}
                                    className="admin-input mt-1"
                                />
                            </label>
                            {importWizardColumns.length > 0 ? (
                                <div className="rounded-xl border border-card-border p-4">
                                    <p className="text-sm font-semibold text-text dark:text-dark-text">Column Mapping</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                        {EXAM_CENTER_IMPORT_FIELDS.map((field) => (
                                            <label key={field.key} className="block">
                                                <span className="text-xs font-medium text-text-muted">{field.label}{field.required ? ' *' : ''}</span>
                                                <select
                                                    value={importWizardMappingSelections[field.key] || ''}
                                                    onChange={(e) => setImportWizardMappingSelections((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                    className="admin-input mt-1"
                                                >
                                                    <option value="">Auto / not mapped</option>
                                                    {importWizardColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Manual Mapping JSON</span>
                                <textarea value={importWizardManualMappingJson} onChange={(e) => setImportWizardManualMappingJson(e.target.value)} className="admin-input mt-1 min-h-28" placeholder='{"score":"Marks", "roll_number":"Roll"}' />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => previewExamImportMutation.mutate()} disabled={previewExamImportMutation.isPending} className="btn-primary">
                                    {previewExamImportMutation.isPending ? 'Previewing...' : 'Preview Import'}
                                </button>
                                <button type="button" onClick={() => commitExamImportMutation.mutate()} disabled={commitExamImportMutation.isPending || !importWizardPreview} className="btn-secondary">
                                    {commitExamImportMutation.isPending ? 'Committing...' : 'Commit Import'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                                <div className="flex items-center gap-2">
                                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                                    <h3 className="text-lg font-semibold text-text dark:text-dark-text">Preview Summary</h3>
                                </div>
                                <p className="text-sm text-text-muted">
                                    Need a sample sheet first? Use the template buttons in the result import/export section or save a reusable import template below.
                                </p>
                                {importWizardPreview ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-xl bg-slate-500/5 p-3">
                                                <p className="text-xs text-text-muted">Total Rows</p>
                                                <p className="mt-1 text-xl font-bold text-text dark:text-dark-text">{importWizardPreview.job.summary.totalRows}</p>
                                            </div>
                                            <div className="rounded-xl bg-emerald-500/5 p-3">
                                                <p className="text-xs text-text-muted">Matched</p>
                                                <p className="mt-1 text-xl font-bold text-emerald-600">{importWizardPreview.job.summary.matchedRows}</p>
                                            </div>
                                            <div className="rounded-xl bg-amber-500/5 p-3">
                                                <p className="text-xs text-text-muted">Unmatched</p>
                                                <p className="mt-1 text-xl font-bold text-amber-600">{importWizardPreview.job.summary.unmatchedRows}</p>
                                            </div>
                                            <div className="rounded-xl bg-rose-500/5 p-3">
                                                <p className="text-xs text-text-muted">Invalid</p>
                                                <p className="mt-1 text-xl font-bold text-rose-600">{importWizardPreview.job.summary.invalidRows}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {importWizardPreview.job.rows.slice(0, 6).map((row) => (
                                                <div key={`${row.rowNumber}-${row.matchedStudentId || 'row'}`} className="rounded-xl border border-card-border p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold text-text dark:text-dark-text">Row {row.rowNumber}</p>
                                                        <span className={`text-xs font-semibold ${row.blocking ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {row.blocking ? 'Blocked' : 'Ready'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-xs text-text-muted">
                                                        {row.matchedStudentLabel ? `Matched: ${row.matchedStudentLabel}` : 'No matched student yet'}
                                                    </p>
                                                    {row.issues.length > 0 ? (
                                                        <div className="mt-2 space-y-1 text-xs text-rose-600">
                                                            {row.issues.map((issue, index) => <p key={`${row.rowNumber}-${index}`}>{issue.reason}</p>)}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm text-text-muted dark:text-dark-text/60">Upload a file and preview it to inspect match quality before committing.</p>
                                )}
                            </div>

                            {importWizardRows.length > 0 ? (
                                <div className="admin-panel-bg rounded-2xl p-5">
                                    <p className="text-sm font-semibold text-text dark:text-dark-text">Local File Sample</p>
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="min-w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-card-border text-text-muted">
                                                    {importWizardColumns.slice(0, 6).map((column) => <th key={column} className="pb-2 pr-3 font-semibold">{column}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importWizardRows.map((row, index) => (
                                                    <tr key={`sample-${index}`} className="border-b border-card-border/60 last:border-b-0">
                                                        {importWizardColumns.slice(0, 6).map((column) => <td key={`${index}-${column}`} className="py-2 pr-3 text-text dark:text-dark-text">{String(row[column] || '-')}</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {centerView === 'templates' ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <FileCog className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">Import Templates</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Name</span>
                                    <input value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} className="admin-input mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Expected Columns</span>
                                    <input value={templateForm.expectedColumns} onChange={(e) => setTemplateForm((prev) => ({ ...prev, expectedColumns: e.target.value }))} className="admin-input mt-1" placeholder="roll_number, score, rank" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Description</span>
                                <textarea value={templateForm.description} onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))} className="admin-input mt-1 min-h-20" />
                            </label>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Required Columns</span>
                                    <input value={templateForm.requiredColumns} onChange={(e) => setTemplateForm((prev) => ({ ...prev, requiredColumns: e.target.value }))} className="admin-input mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Match Priority</span>
                                    <input value={templateForm.matchPriority} onChange={(e) => setTemplateForm((prev) => ({ ...prev, matchPriority: e.target.value }))} className="admin-input mt-1" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Column Mapping JSON</span>
                                <textarea value={templateForm.columnMappingJson} onChange={(e) => setTemplateForm((prev) => ({ ...prev, columnMappingJson: e.target.value }))} className="admin-input mt-1 min-h-24" placeholder='{"score":"Marks"}' />
                            </label>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Profile Update Fields</span>
                                    <input value={templateForm.profileUpdateFields} onChange={(e) => setTemplateForm((prev) => ({ ...prev, profileUpdateFields: e.target.value }))} className="admin-input mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Record-only Fields</span>
                                    <input value={templateForm.recordOnlyFields} onChange={(e) => setTemplateForm((prev) => ({ ...prev, recordOnlyFields: e.target.value }))} className="admin-input mt-1" />
                                </label>
                            </div>
                            <ModernToggle
                                label="Template active"
                                checked={templateForm.isActive}
                                onChange={(isActive) => setTemplateForm((prev) => ({ ...prev, isActive }))}
                                size="sm"
                            />
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={submitTemplateForm} className="btn-primary">
                                    {editingTemplateId ? 'Update Template' : 'Save Template'}
                                </button>
                                <button type="button" onClick={() => { setEditingTemplateId(null); setTemplateForm(createDefaultTemplateForm()); }} className="btn-secondary">Reset</button>
                            </div>
                            <div className="space-y-2">
                                {examTemplates.map((template) => (
                                    <div key={template._id} className="rounded-xl border border-card-border p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-text dark:text-dark-text">{template.name}</p>
                                                <p className="text-xs text-text-muted">{template.description || 'No description'}</p>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button type="button" onClick={() => {
                                                    setEditingTemplateId(template._id);
                                                    setTemplateForm({
                                                        name: template.name,
                                                        description: template.description || '',
                                                        expectedColumns: template.expectedColumns.join(', '),
                                                        requiredColumns: template.requiredColumns.join(', '),
                                                        columnMappingJson: stringifyJsonBlock(template.columnMapping),
                                                        matchPriority: template.matchPriority.join(', '),
                                                        profileUpdateFields: template.profileUpdateFields.join(', '),
                                                        recordOnlyFields: template.recordOnlyFields.join(', '),
                                                        isActive: template.isActive,
                                                    });
                                                }} className="btn-ghost" title="Edit template"><Edit3 className="h-4 w-4" /></button>
                                                <button type="button" onClick={() => createTemplateMutation.mutate({
                                                    name: `${template.name} Copy`,
                                                    description: template.description,
                                                    expectedColumns: template.expectedColumns,
                                                    requiredColumns: template.requiredColumns,
                                                    columnMapping: template.columnMapping,
                                                    matchPriority: template.matchPriority,
                                                    profileUpdateFields: template.profileUpdateFields,
                                                    recordOnlyFields: template.recordOnlyFields,
                                                    isActive: template.isActive,
                                                })} className="btn-ghost" title="Copy template"><BookCopy className="h-4 w-4" /></button>
                                                <button type="button" onClick={async () => {
                                                    const confirmed = await showConfirmDialog({
                                                        title: 'Delete template',
                                                        message: 'Delete this template?',
                                                        confirmLabel: 'Delete',
                                                        tone: 'danger',
                                                    });
                                                    if (confirmed) deleteTemplateMutation.mutate(template._id);
                                                }} className="btn-ghost text-danger" title="Delete template"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">Mapping Profiles</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Name</span>
                                    <input value={mappingProfileForm.name} onChange={(e) => setMappingProfileForm((prev) => ({ ...prev, name: e.target.value }))} className="admin-input mt-1" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Match Priority</span>
                                    <input value={mappingProfileForm.matchPriority} onChange={(e) => setMappingProfileForm((prev) => ({ ...prev, matchPriority: e.target.value }))} className="admin-input mt-1" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Description</span>
                                <textarea value={mappingProfileForm.description} onChange={(e) => setMappingProfileForm((prev) => ({ ...prev, description: e.target.value }))} className="admin-input mt-1 min-h-20" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Required Columns</span>
                                <input value={mappingProfileForm.requiredColumns} onChange={(e) => setMappingProfileForm((prev) => ({ ...prev, requiredColumns: e.target.value }))} className="admin-input mt-1" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Field Mapping JSON</span>
                                <textarea value={mappingProfileForm.fieldMappingJson} onChange={(e) => setMappingProfileForm((prev) => ({ ...prev, fieldMappingJson: e.target.value }))} className="admin-input mt-1 min-h-24" placeholder='{"roll_number":"Roll"}' />
                            </label>
                            <ModernToggle
                                label="Profile active"
                                checked={mappingProfileForm.isActive}
                                onChange={(isActive) => setMappingProfileForm((prev) => ({ ...prev, isActive }))}
                                size="sm"
                            />
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={submitMappingProfileForm} className="btn-primary">
                                    {editingMappingProfileId ? 'Update Profile' : 'Save Profile'}
                                </button>
                                <button type="button" onClick={() => { setEditingMappingProfileId(null); setMappingProfileForm(createDefaultMappingProfileForm()); }} className="btn-secondary">Reset</button>
                            </div>
                            <div className="space-y-2">
                                {examMappingProfiles.map((profile) => (
                                    <div key={profile._id} className="rounded-xl border border-card-border p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-text dark:text-dark-text">{profile.name}</p>
                                                <p className="text-xs text-text-muted">{profile.description || 'No description'}</p>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button type="button" onClick={() => {
                                                    setEditingMappingProfileId(profile._id);
                                                    setMappingProfileForm({
                                                        name: profile.name,
                                                        description: profile.description || '',
                                                        matchPriority: profile.matchPriority.join(', '),
                                                        fieldMappingJson: stringifyJsonBlock(profile.fieldMapping),
                                                        requiredColumns: profile.requiredColumns.join(', '),
                                                        isActive: profile.isActive,
                                                    });
                                                }} className="btn-ghost" title="Edit mapping profile"><Edit3 className="h-4 w-4" /></button>
                                                <button type="button" onClick={async () => {
                                                    const confirmed = await showConfirmDialog({
                                                        title: 'Delete mapping profile',
                                                        message: 'Delete this mapping profile?',
                                                        confirmLabel: 'Delete',
                                                        tone: 'danger',
                                                    });
                                                    if (confirmed) deleteMappingProfileMutation.mutate(profile._id);
                                                }} className="btn-ghost text-danger" title="Delete mapping profile"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                {centerView === 'centers' ? (
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">Exam Centers</h3>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Name</span>
                                <input value={examCenterForm.name} onChange={(e) => setExamCenterForm((prev) => ({ ...prev, name: e.target.value }))} className="admin-input mt-1" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Address</span>
                                <textarea value={examCenterForm.address} onChange={(e) => setExamCenterForm((prev) => ({ ...prev, address: e.target.value }))} className="admin-input mt-1 min-h-24" />
                            </label>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Center Code</span>
                                    <input value={examCenterForm.code} onChange={(e) => setExamCenterForm((prev) => ({ ...prev, code: e.target.value }))} className="admin-input mt-1" />
                                </label>
                                <div className="self-end pb-1">
                                    <ModernToggle
                                        label="Center active"
                                        checked={examCenterForm.isActive}
                                        onChange={(isActive) => setExamCenterForm((prev) => ({ ...prev, isActive }))}
                                        size="sm"
                                    />
                                </div>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Note</span>
                                <textarea value={examCenterForm.note} onChange={(e) => setExamCenterForm((prev) => ({ ...prev, note: e.target.value }))} className="admin-input mt-1 min-h-20" />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={submitExamCenterForm} className="btn-primary">
                                    {editingCenterId ? 'Update Center' : 'Save Center'}
                                </button>
                                <button type="button" onClick={() => { setEditingCenterId(null); setExamCenterForm(createDefaultExamCenterForm()); }} className="btn-secondary">Reset</button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {examCenters.map((center) => (
                                <div key={center._id} className="admin-panel-bg rounded-2xl p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold text-text dark:text-dark-text">{center.name}</p>
                                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${center.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600'}`}>
                                                    {center.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-text-muted">{center.address}</p>
                                            <p className="mt-1 text-xs text-text-muted">{center.code ? `Code: ${center.code}` : 'No code'}{center.note ? ` · ${center.note}` : ''}</p>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button type="button" onClick={() => {
                                                setEditingCenterId(center._id);
                                                setExamCenterForm({
                                                    name: center.name,
                                                    address: center.address,
                                                    code: center.code || '',
                                                    note: center.note || '',
                                                    isActive: center.isActive,
                                                });
                                            }} className="btn-ghost" title="Edit exam center"><Edit3 className="h-4 w-4" /></button>
                                            <button type="button" onClick={async () => {
                                                const confirmed = await showConfirmDialog({
                                                    title: 'Delete exam center',
                                                    message: 'Delete this exam center?',
                                                    confirmLabel: 'Delete',
                                                    tone: 'danger',
                                                });
                                                if (confirmed) deleteExamCenterMutation.mutate(center._id);
                                            }} className="btn-ghost text-danger" title="Delete exam center"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {examCenters.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No exam centers created yet.</p> : null}
                        </div>
                    </div>
                ) : null}

                {centerView === 'sync-logs' ? (
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <Clock3 className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">Sync & Import Logs</h3>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Exam</span>
                                <select value={workspaceExamId} onChange={(e) => setWorkspaceExamId(e.target.value)} className="admin-input mt-1">
                                    <option value="">Select exam...</option>
                                    {exams.map((exam) => <option key={String(exam._id)} value={String(exam._id)}>{String(exam.title || 'Untitled Exam')}</option>)}
                                </select>
                            </label>
                            {activeWorkspaceExam ? (
                                <div className="rounded-xl border border-card-border p-4 text-sm text-text dark:text-dark-text">
                                    <p className="font-semibold">{String(activeWorkspaceExam.title || 'Untitled Exam')}</p>
                                    <p className="mt-1 text-xs text-text-muted">{examModeLabel(activeWorkspaceExam.deliveryMode)}{getExamCenterLabel(activeWorkspaceExam) ? ` · ${getExamCenterLabel(activeWorkspaceExam)}` : ''}</p>
                                </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => runExamProfileSyncMutation.mutate()} disabled={!workspaceExamId || runExamProfileSyncMutation.isPending} className="btn-primary">
                                    {runExamProfileSyncMutation.isPending ? 'Syncing...' : 'Run Profile Sync'}
                                </button>
                                <button type="button" onClick={() => { examImportLogsQuery.refetch(); examProfileSyncLogsQuery.refetch(); }} disabled={!workspaceExamId} className="btn-secondary">
                                    Refresh Logs
                                </button>
                            </div>
                            <div className="rounded-xl border border-card-border p-4">
                                <p className="text-sm font-semibold text-text dark:text-dark-text">Import Issues</p>
                                <div className="mt-3 space-y-2">
                                    {importIssues.slice(0, 8).map((issue) => (
                                        <div key={String(issue._id || `${issue.issueType}-${issue.rowNumber || 'row'}`)} className="rounded-lg bg-rose-500/5 p-3 text-xs text-rose-700">
                                            {String(issue.issueType || 'issue')}: {String(issue.reason || 'Unknown issue')}
                                        </div>
                                    ))}
                                    {importIssues.length === 0 ? <p className="text-sm text-text-muted">No import issues logged for this exam.</p> : null}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="admin-panel-bg rounded-2xl p-5">
                                <p className="text-sm font-semibold text-text dark:text-dark-text">Recent Sync Logs</p>
                                <div className="mt-3 space-y-2">
                                    {syncLogs.slice(0, 10).map((log) => (
                                        <div key={log._id} className="rounded-xl border border-card-border p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-text dark:text-dark-text">{String(log.source || 'sync')}</p>
                                                <span className={`text-xs font-semibold ${log.status === 'success' ? 'text-emerald-600' : log.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-text-muted">Mode: {log.syncMode} · Fields: {log.changedFields?.join(', ') || 'none'}</p>
                                            <p className="mt-1 text-xs text-text-muted">{new Date(log.createdAt).toLocaleString()}</p>
                                        </div>
                                    ))}
                                    {syncLogs.length === 0 ? <p className="text-sm text-text-muted">No sync logs yet.</p> : null}
                                </div>
                            </div>

                            <div className="admin-panel-bg rounded-2xl p-5">
                                <p className="text-sm font-semibold text-text dark:text-dark-text">Import Jobs</p>
                                <div className="mt-3 space-y-2">
                                    {importLogs.slice(0, 10).map((log) => {
                                        const summary = log.summary && typeof log.summary === 'object' ? log.summary as Record<string, unknown> : {};
                                        return (
                                            <div key={String(log._id || `${log.status}-${log.createdAt || ''}`)} className="rounded-xl border border-card-border p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-semibold text-text dark:text-dark-text">{String(log.status || 'unknown')}</p>
                                                    <span className="text-xs text-text-muted">{String(log.createdAt || '') ? new Date(String(log.createdAt)).toLocaleString() : ''}</span>
                                                </div>
                                                <p className="mt-1 text-xs text-text-muted">
                                                    Rows: {String(summary.totalRows || 0)} · Matched: {String(summary.matchedRows || 0)} · Updated: {String(summary.updatedProfiles || 0)}
                                                </p>
                                            </div>
                                        );
                                    })}
                                    {importLogs.length === 0 ? <p className="text-sm text-text-muted">No import jobs yet.</p> : null}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {centerView === 'settings' ? (
                    <div className="admin-panel-bg rounded-2xl p-5 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Settings2 className="h-4 w-4 text-primary" />
                                <div>
                                    <h3 className="text-lg font-semibold text-text dark:text-dark-text">Exam Center Settings</h3>
                                    <p className="text-xs text-text-muted">
                                        Import automation, profile sync defaults, notification triggers, and external import control.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {isExamCenterSettingsDirty ? (
                                    <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                                        Unsaved changes
                                    </span>
                                ) : (
                                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                                        Saved state
                                    </span>
                                )}
                                {isExamCenterSettingsDirty ? (
                                    <button type="button" onClick={resetExamCenterSettings} className="btn-secondary text-sm">
                                        Reset
                                    </button>
                                ) : null}
                                <button type="button" onClick={() => examCenterSettingsQuery.refetch()} className="btn-secondary text-sm">
                                    Reload
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateExamCenterSettingsMutation.mutate(settingsForm)}
                                    disabled={!isExamCenterSettingsDirty || updateExamCenterSettingsMutation.isPending}
                                    className="btn-primary text-sm disabled:opacity-50"
                                >
                                    {updateExamCenterSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm text-text-muted dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-dark-text/70">
                            These settings control how import runs create centers, sync mapped profile fields, and notify students after result operations.
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-card-border p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Sync Mode</p>
                                <p className="mt-2 text-sm font-semibold text-text dark:text-dark-text">
                                    {settingsForm.defaultSyncMode === 'fill_missing_only' ? 'Fill missing only' : 'Overwrite mapped fields'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-card-border p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Center Creation</p>
                                <p className="mt-2 text-sm font-semibold text-text dark:text-dark-text">
                                    {settingsForm.autoCreateExamCenters ? 'Auto-create enabled' : 'Manual only'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-card-border p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Student Alerts</p>
                                <p className="mt-2 text-sm font-semibold text-text dark:text-dark-text">
                                    {settingsForm.notifyStudentsOnSync ? 'Sync alerts on' : 'Sync alerts off'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-card-border p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">External Imports</p>
                                <p className="mt-2 text-sm font-semibold text-text dark:text-dark-text">
                                    {settingsForm.allowExternalImports ? 'Allowed' : 'Blocked'}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Default Sync Mode</span>
                                <select value={settingsForm.defaultSyncMode} onChange={(e) => setSettingsForm((prev) => ({ ...prev, defaultSyncMode: e.target.value as ExamCenterSettings['defaultSyncMode'] }))} className="admin-input mt-1">
                                    <option value="fill_missing_only">Fill missing only</option>
                                    <option value="overwrite_mapped_fields">Overwrite mapped fields</option>
                                </select>
                            </label>
                            <div className="space-y-4 rounded-xl border border-card-border p-5">
                                <ModernToggle
                                    label="Auto-create centers from import rows"
                                    checked={settingsForm.autoCreateExamCenters}
                                    onChange={(v) => setSettingsForm((prev) => ({ ...prev, autoCreateExamCenters: v }))}
                                    size="sm"
                                />
                                <ModernToggle
                                    label="Notify students after sync"
                                    checked={settingsForm.notifyStudentsOnSync}
                                    onChange={(v) => setSettingsForm((prev) => ({ ...prev, notifyStudentsOnSync: v }))}
                                    size="sm"
                                />
                                <ModernToggle
                                    label="Notify guardians on result"
                                    checked={settingsForm.notifyGuardiansOnResult}
                                    onChange={(v) => setSettingsForm((prev) => ({ ...prev, notifyGuardiansOnResult: v }))}
                                    size="sm"
                                />
                                <ModernToggle
                                    label="Allow external import flows"
                                    checked={settingsForm.allowExternalImports}
                                    onChange={(v) => setSettingsForm((prev) => ({ ...prev, allowExternalImports: v }))}
                                    size="sm"
                                />
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Anti-Cheat Policy — under Exam Settings */}
                {centerView === 'settings' ? (
                    <div className="mt-4">
                        <AntiCheatPolicyForm mode="global" />
                    </div>
                ) : null}

                {(centerView === 'all' || centerView === 'external' || centerView === 'internal' || centerView === 'results') ? (
                    <div className="space-y-2">
                        {listViewExams.map((exam) => (
                            <div key={String(exam._id)} className="admin-panel-bg flex flex-col gap-2 md:gap-3 rounded-xl p-3 md:p-4 sm:flex-row sm:flex-wrap sm:items-center">
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                                        <p className="font-semibold text-sm md:text-base text-text dark:text-dark-text truncate">{String(exam.title)}</p>
                                        <span className={`inline-flex rounded-full px-2 md:px-2.5 py-0.5 text-[10px] md:text-[11px] font-semibold ${String(exam.deliveryMode || '').trim().toLowerCase() === 'external_link'
                                            ? 'bg-sky-500/10 text-sky-600'
                                            : 'bg-emerald-500/10 text-emerald-600'
                                            }`}>
                                            {examModeLabel(exam.deliveryMode)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] md:text-xs text-text-muted dark:text-dark-text/60">
                                        {String(exam.subject || '')} &middot; {String(exam.status || 'draft')}
                                        {getExamCenterLabel(exam) ? ` · ${getExamCenterLabel(exam)}` : ''}
                                    </p>
                                    {String(exam.externalExamUrl || '').trim() ? (
                                        <a href={String(exam.externalExamUrl)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            External link
                                        </a>
                                    ) : null}
                                </div>
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => openEdit(String(exam._id))} className="btn-ghost" title="Edit">
                                        <Edit3 className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => openQuestions(String(exam._id))} className="btn-ghost" title="Questions">
                                        <ListOrdered className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => openResults(String(exam._id))} className="btn-ghost" title="Results">
                                        <GraduationCap className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => setWorkspaceExamId(String(exam._id))} className="btn-ghost" title="Use in workspace">
                                        <Sparkles className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const confirmed = await showConfirmDialog({
                                                title: 'Delete exam',
                                                message: 'Delete this exam?',
                                                confirmLabel: 'Delete',
                                                tone: 'danger',
                                            });
                                            if (confirmed) deleteMutation.mutate(String(exam._id));
                                        }}
                                        className="btn-ghost text-danger"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {!examsQuery.isLoading && listViewExams.length === 0 ? (
                            <p className="text-center text-sm text-text-muted dark:text-dark-text/60 py-8">No exams found.</p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // TAB: CREATE / EDIT EXAM
    // ═══════════════════════════════════════════════
    if (tab === 'create' || tab === 'edit') {
        const isEdit = tab === 'edit';
        const saving = createMutation.isPending || updateMutation.isPending;
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => setTab('list')} className="btn-ghost">
                    <ChevronLeft className="mr-1 h-4 w-4" />{isEdit ? 'Back to List' : 'Cancel'}
                </button>
                <h2 className="text-xl font-bold text-text dark:text-dark-text">{isEdit ? 'Edit Exam' : 'Create Exam'}</h2>

                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Basic Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFormField('Title (EN)', 'title')}
                        {renderFormField('Title (BN)', 'title_bn')}
                        {renderFormField('Subject', 'subject')}
                        {renderFormField('Category', 'examCategory')}
                        {renderFormField('Duration (min)', 'durationMinutes', 'number')}
                        {renderFormField('Status', 'status', 'select', ['draft', 'scheduled', 'live', 'closed'])}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFormField('Description (EN)', 'description', 'textarea')}
                        {renderFormField('Description (BN)', 'description_bn', 'textarea')}
                    </div>
                </div>

                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Exam Center Mode</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFormField('Slug', 'slug')}
                        {renderFormField('Delivery Mode', 'deliveryMode', 'select', ['internal', 'external_link'])}
                        <label className="block">
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">Exam Center</span>
                            <select value={String(formData.examCenterId ?? '')} onChange={(e) => setField('examCenterId', e.target.value)} className="admin-input mt-1">
                                <option value="">No exam center</option>
                                {examCenters.map((center) => <option key={center._id} value={center._id}>{center.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">Import Template</span>
                            <select value={String(formData.templateId ?? '')} onChange={(e) => setField('templateId', e.target.value)} className="admin-input mt-1">
                                <option value="">No template</option>
                                {examTemplates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">Mapping Profile</span>
                            <select value={String(formData.importProfileId ?? '')} onChange={(e) => setField('importProfileId', e.target.value)} className="admin-input mt-1">
                                <option value="">No profile</option>
                                {examMappingProfiles.map((profile) => <option key={profile._id} value={profile._id}>{profile.name}</option>)}
                            </select>
                        </label>
                    </div>
                    {String(formData.deliveryMode || 'internal') === 'external_link' ? (
                        <label className="block">
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">External Exam URL</span>
                            <input value={String(formData.externalExamUrl ?? '')} onChange={(e) => setField('externalExamUrl', e.target.value)} className="admin-input mt-1" placeholder="https://..." />
                        </label>
                    ) : null}
                </div>

                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Schedule & Access</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFormField('Window Start (UTC)', 'examWindowStartUTC', 'datetime-local')}
                        {renderFormField('Window End (UTC)', 'examWindowEndUTC', 'datetime-local')}
                        {renderFormField('Attempt Limit', 'attemptLimit', 'number')}
                        {renderFormField('Result Publish At (UTC)', 'resultPublishAtUTC', 'datetime-local')}
                    </div>
                    <div className="flex flex-wrap gap-6">
                        {renderFormField('Allow Re-attempt', 'allowReAttempt', 'checkbox')}
                        {renderFormField('Payment Required', 'paymentRequired', 'checkbox')}
                        {renderFormField('Subscription Required', 'subscriptionRequired', 'checkbox')}
                    </div>
                    {formData.paymentRequired ? renderFormField('Price (BDT)', 'priceBDT', 'number') : null}
                    {formData.subscriptionRequired ? renderFormField('Subscription Plan ID', 'subscriptionPlanId') : null}
                </div>

                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Rules</h3>
                    <div className="flex flex-wrap gap-6">
                        {renderFormField('Negative Marking', 'negativeMarkingEnabled', 'checkbox')}
                        {renderFormField('Shuffle Questions', 'shuffleQuestions', 'checkbox')}
                        {renderFormField('Shuffle Options', 'shuffleOptions', 'checkbox')}
                        {renderFormField('Show Timer', 'showTimer', 'checkbox')}
                        {renderFormField('Show Palette', 'showQuestionPalette', 'checkbox')}
                        {renderFormField('Auto-submit on Timeout', 'autoSubmitOnTimeout', 'checkbox')}
                        {renderFormField('Solutions Enabled', 'solutionsEnabled', 'checkbox')}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {formData.negativeMarkingEnabled ? renderFormField('Negative Per Wrong', 'negativePerWrong', 'number') : null}
                        {renderFormField('Answer Change Limit', 'answerChangeLimit', 'number')}
                        {renderFormField('Solution Release Rule', 'solutionReleaseRule', 'select', ['after_result_publish', 'immediately', 'never'])}
                    </div>
                </div>

                {/* ── Visibility & Audience ── */}
                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                        <Shield className="h-4 w-4" />Visibility & Audience
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderFormField('Visibility Mode', 'visibilityMode', 'select', ['all_students', 'group_only', 'subscription_only', 'custom'])}
                        {renderFormField('Min Profile Score (0-100)', 'minimumProfileScore', 'number')}
                    </div>

                    {/* Target Groups Selector */}
                    {(formData.visibilityMode === 'group_only' || formData.visibilityMode === 'custom') && (
                        <div>
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">Target Groups</span>
                            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                                {(Array.isArray(formData.targetGroupIds) ? formData.targetGroupIds as string[] : []).map((gId) => {
                                    const allGroups = Array.isArray(groupsQuery.data) ? groupsQuery.data as Array<Record<string, unknown>> : [];
                                    const g = allGroups.find((x) => String(x._id) === gId);
                                    const color = String(g?.color || '#6366f1');
                                    return (
                                        <span key={gId} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" ref={(el) => { if (el) { el.style.backgroundColor = `${color}20`; el.style.color = color; } }}>
                                            {String(g?.name || gId)}
                                            <button type="button" onClick={() => setField('targetGroupIds', (formData.targetGroupIds as string[]).filter((id) => id !== gId))} className="hover:opacity-70" title="Remove group">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                                <input type="text" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search groups to add..." className="admin-input pl-8 text-sm" />
                            </div>
                            {groupSearch.trim() && (
                                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-card-border bg-white dark:bg-slate-800 divide-y divide-card-border/50">
                                    {(Array.isArray(groupsQuery.data) ? groupsQuery.data as Array<Record<string, unknown>> : [])
                                        .filter((g) => {
                                            const selected = Array.isArray(formData.targetGroupIds) ? formData.targetGroupIds as string[] : [];
                                            return !selected.includes(String(g._id)) && String(g.name || '').toLowerCase().includes(groupSearch.toLowerCase());
                                        })
                                        .slice(0, 8)
                                        .map((g) => {
                                            const color = String(g.color || '#6366f1');
                                            return (
                                                <button
                                                    key={String(g._id)}
                                                    type="button"
                                                    onClick={() => {
                                                        const existing = Array.isArray(formData.targetGroupIds) ? formData.targetGroupIds as string[] : [];
                                                        setField('targetGroupIds', [...existing, String(g._id)]);
                                                        setGroupSearch('');
                                                    }}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-left"
                                                >
                                                    <Users className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                                                    <span className="truncate text-text dark:text-dark-text">{String(g.name)}</span>
                                                    <span className="ml-auto text-xs text-text-muted">{String(g.type || '')}</span>
                                                </button>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-6">
                        {renderFormField('Active', 'isActive', 'checkbox')}
                        {renderFormField('Requires Subscription', 'requiresActiveSubscription', 'checkbox')}
                        {renderFormField('Requires Payment', 'requiresPayment', 'checkbox')}
                    </div>

                    <div className="flex flex-wrap gap-8">
                        <ModernToggle
                            label="Show on Dashboard"
                            helper="Display this exam prominently to active students"
                            checked={Boolean(formData.displayOnDashboard)}
                            onChange={(v) => setField('displayOnDashboard', v)}
                            size="sm"
                        />
                        <ModernToggle
                            label="Show on Public List"
                            helper="Allow non-logged in users to see this exam"
                            checked={Boolean(formData.displayOnPublicList)}
                            onChange={(v) => setField('displayOnPublicList', v)}
                            size="sm"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                            const payload = buildExamMutationPayload();
                            if (isEdit) updateMutation.mutate(payload);
                            else createMutation.mutate(payload);
                        }}
                        className="btn-primary"
                    >
                        {saving ? 'Saving...' : isEdit ? 'Update Exam' : 'Create Exam'}
                    </button>
                    <button type="button" onClick={() => setTab('list')} className="btn-secondary">Cancel</button>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // TAB: QUESTIONS
    // ═══════════════════════════════════════════════
    if (tab === 'questions') {
        const questions: Array<Record<string, unknown>> = Array.isArray(questionsQuery.data) ? questionsQuery.data : [];
        const qSaving = createQuestionMutation.isPending || updateQuestionMutation.isPending;

        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" onClick={() => setTab('list')} className="btn-ghost">
                        <ChevronLeft className="mr-1 h-4 w-4" />Back
                    </button>
                    <div className="flex gap-2">
                        <a
                            href="/__cw_admin__/question-bank/sets"
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary inline-flex items-center gap-1.5"
                            title="Open Question Bank to create sets, then import them here"
                        >
                            <Database className="h-4 w-4" />Question Bank
                        </a>
                        <button type="button" disabled={busy} onClick={async () => {
                            setBusy(true);
                            try {
                                const response = await downloadQuestionTemplate(selectedExamId);
                                downloadFile(response, { filename: 'questions_template.xlsx' });
                            } catch { toast.error('Failed to download template.'); }
                            finally { setBusy(false); }
                        }} className="btn-secondary">
                            <Download className="mr-1.5 h-4 w-4" />Template
                        </button>
                    </div>
                </div>
                <h2 className="text-xl font-bold text-text dark:text-dark-text">Questions ({questions.length})</h2>

                {/* Question form */}
                <div className="admin-panel-bg rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-text-muted">{editingQuestionId ? 'Edit Question' : 'Add Question'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Question (EN)</span>
                            <textarea value={String(questionForm.question_en ?? '')} onChange={(e) => setQField('question_en', e.target.value)} className="admin-input mt-1" rows={2} />
                        </label>
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Question (BN)</span>
                            <textarea value={String(questionForm.question_bn ?? '')} onChange={(e) => setQField('question_bn', e.target.value)} className="admin-input mt-1" rows={2} />
                        </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(['A', 'B', 'C', 'D'] as const).map((key) => (
                            <label key={key} className="block">
                                <span className="text-xs font-semibold text-text-muted uppercase">Option {key} (EN)</span>
                                <input value={String(questionForm[`option${key}_en`] ?? '')} onChange={(e) => setQField(`option${key}_en`, e.target.value)} className="admin-input mt-1" />
                            </label>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Correct Key</span>
                            <select value={String(questionForm.correctKey ?? 'A')} onChange={(e) => setQField('correctKey', e.target.value)} className="admin-input mt-1">
                                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                            </select>
                        </label>
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Marks</span>
                            <input type="number" value={Number(questionForm.marks ?? 1)} onChange={(e) => setQField('marks', Number(e.target.value))} className="admin-input mt-1" />
                        </label>
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Neg. Marks</span>
                            <input type="number" step="0.25" value={Number(questionForm.negativeMarks ?? 0)} onChange={(e) => setQField('negativeMarks', Number(e.target.value))} className="admin-input mt-1" />
                        </label>
                        <label className="block"><span className="text-xs font-semibold text-text-muted uppercase">Order Index</span>
                            <input type="number" value={Number(questionForm.orderIndex ?? 0)} onChange={(e) => setQField('orderIndex', Number(e.target.value))} className="admin-input mt-1" />
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={qSaving}
                            onClick={() => {
                                if (editingQuestionId) {
                                    updateQuestionMutation.mutate({ qId: editingQuestionId, data: questionForm });
                                } else {
                                    createQuestionMutation.mutate(questionForm);
                                }
                            }}
                            className="btn-primary"
                        >
                            {qSaving ? 'Saving...' : editingQuestionId ? 'Update' : 'Add Question'}
                        </button>
                        {editingQuestionId ? (
                            <button type="button" onClick={() => { setEditingQuestionId(null); setQuestionForm({ ...defaultQuestionFields }); }} className="btn-secondary">Cancel</button>
                        ) : null}
                    </div>
                </div>

                {/* Question list */}
                {questionsQuery.isLoading ? <p className="text-sm text-text-muted">Loading questions...</p> : null}
                <div className="space-y-2">
                    {questions.map((q, idx) => (
                        <div key={String(q._id)} className="admin-panel-bg flex flex-wrap items-start gap-3 rounded-xl p-4">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-text dark:text-dark-text">{String(q.question_bn || q.question_en || q.question || 'No text')}</p>
                                <p className="text-xs text-text-muted mt-1">Correct: {String(q.correctKey ?? q.correctAnswer ?? '-')} · Marks: {String(q.marks)}</p>
                            </div>
                            <div className="flex gap-1">
                                <button type="button" onClick={() => {
                                    setEditingQuestionId(String(q._id));
                                    setQuestionForm({
                                        ...defaultQuestionFields,
                                        question_en: q.question_en || q.question || '',
                                        question_bn: q.question_bn || '',
                                        optionA_en: q.optionA_en || q.optionA || '',
                                        optionB_en: q.optionB_en || q.optionB || '',
                                        optionC_en: q.optionC_en || q.optionC || '',
                                        optionD_en: q.optionD_en || q.optionD || '',
                                        correctKey: q.correctKey || q.correctAnswer || 'A',
                                        marks: q.marks ?? 1,
                                        negativeMarks: q.negativeMarks ?? 0,
                                        explanation_en: q.explanation_en || q.explanation || '',
                                        explanation_bn: q.explanation_bn || '',
                                        orderIndex: q.orderIndex ?? q.order ?? 0,
                                    });
                                }} className="btn-ghost" title="Edit question"><Edit3 className="h-4 w-4" /></button>
                                <button type="button" onClick={async () => {
                                    const confirmed = await showConfirmDialog({
                                        title: 'Delete question',
                                        message: 'Delete this question?',
                                        confirmLabel: 'Delete',
                                        tone: 'danger',
                                    });
                                    if (confirmed) deleteQuestionMutation.mutate(String(q._id));
                                }} className="btn-ghost text-danger" title="Delete question"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // TAB: RESULTS
    // ═══════════════════════════════════════════════
    if (tab === 'results') {
        const results: Array<Record<string, unknown>> = Array.isArray(resultsQuery.data) ? resultsQuery.data : [];
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => setTab('list')} className="btn-ghost">
                    <ChevronLeft className="mr-1 h-4 w-4" />Back
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold text-text dark:text-dark-text">Results ({results.length})</h2>
                    <button type="button" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} className="btn-primary">
                        {publishMutation.isPending ? 'Publishing...' : 'Publish Results'}
                    </button>
                </div>

                {resultsQuery.isLoading ? <p className="text-sm text-text-muted">Loading results...</p> : null}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-card-border text-left text-xs uppercase text-text-muted">
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Student</th>
                                <th className="px-3 py-2">Score</th>
                                <th className="px-3 py-2">%</th>
                                <th className="px-3 py-2">Rank</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, idx) => (
                                <tr key={String(r._id)} className="border-b border-card-border/50">
                                    <td className="px-3 py-2">{idx + 1}</td>
                                    <td className="px-3 py-2">{String(r.studentName || r.userId || '')}</td>
                                    <td className="px-3 py-2">{String(r.obtainedMarks || 0)}/{String(r.totalMarks || 0)}</td>
                                    <td className="px-3 py-2">{String(r.percentage || 0)}%</td>
                                    <td className="px-3 py-2">{r.rank ? `#${String(r.rank)}` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Import/export section */}
                <div className="admin-panel-bg rounded-xl p-5 space-y-4">
                    <h3 className="text-base font-bold text-text dark:text-dark-text">Result Import/Export</h3>
                    <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/5 p-4 text-sm text-text-muted dark:text-dark-text/70">
                        Download a demo template first if you need a column layout example. External import mode supports mapping before final import.
                    </div>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-text-muted">Select Exam</span>
                        <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)} className="admin-input mt-1">
                            <option value="">Choose exam</option>
                            {legacyExams.map((exam) => <option key={String(exam._id)} value={String(exam._id)}>{exam.title}</option>)}
                        </select>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase text-text-muted">Import Mode</span>
                            <select value={importMode} onChange={(e) => setImportMode(e.target.value === 'external' ? 'external' : 'internal')} className="admin-input mt-1">
                                <option value="internal">Built-in Result Import</option>
                                <option value="external">External Link Result Import</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase text-text-muted">Profile Sync</span>
                            <select
                                value={syncProfileMode}
                                onChange={(e) => setSyncProfileMode((e.target.value as 'none' | 'fill_missing_only' | 'overwrite_mapped_fields') || 'fill_missing_only')}
                                className="admin-input mt-1"
                                disabled={importMode !== 'external'}
                            >
                                <option value="fill_missing_only">Fill Missing Only</option>
                                <option value="overwrite_mapped_fields">Overwrite Mapped Fields</option>
                                <option value="none">Do Not Sync Profile</option>
                            </select>
                        </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button type="button" disabled={busy} onClick={() => void downloadTemplate('xlsx')} className="btn-secondary"><FileSpreadsheet className="mr-1.5 h-4 w-4" />Import Template (XLSX)</button>
                        <button type="button" disabled={busy} onClick={() => void downloadTemplate('csv')} className="btn-secondary"><FileSpreadsheet className="mr-1.5 h-4 w-4" />Import Template (CSV)</button>
                    </div>
                    {importMode === 'external' ? (
                        <div className="space-y-4">
                            {detectedImportColumns.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-semibold text-text dark:text-dark-text">Column Mapping</h4>
                                            <p className="text-xs text-text-muted">Auto-detected from the uploaded file. Adjust any field before import.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setMappingSelections(autoDetectExternalMapping(detectedImportColumns))}
                                            className="btn-ghost"
                                        >
                                            Auto Detect Again
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {EXTERNAL_IMPORT_MAPPING_FIELDS.map((field) => (
                                            <label key={field.key} className="block">
                                                <span className="text-xs font-semibold uppercase text-text-muted">
                                                    {field.label}{field.required ? ' *' : ''}
                                                </span>
                                                <select
                                                    value={mappingSelections[field.key] || ''}
                                                    onChange={(e) => setMappingSelections((prev) => ({
                                                        ...prev,
                                                        [field.key]: e.target.value,
                                                    }))}
                                                    className="admin-input mt-1"
                                                >
                                                    <option value="">Do Not Map</option>
                                                    {detectedImportColumns.map((column) => (
                                                        <option key={`${field.key}-${column}`} value={column}>{column}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {sampleImportRows.length > 0 ? (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-semibold text-text dark:text-dark-text">File Preview</h4>
                                    <div className="overflow-x-auto rounded-xl border border-card-border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                                    {detectedImportColumns.map((column) => (
                                                        <th key={column} className="px-3 py-2 text-left font-semibold text-text-muted">{column}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sampleImportRows.map((row, index) => (
                                                    <tr key={`preview-row-${index}`} className="border-t border-card-border/60">
                                                        {detectedImportColumns.map((column) => (
                                                            <td key={`${index}-${column}`} className="px-3 py-2 text-text dark:text-dark-text">
                                                                {String(row[column] || '')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null}

                            <label className="block">
                                <span className="text-xs font-semibold uppercase text-text-muted">Advanced Mapping Override JSON</span>
                                <textarea
                                    value={mappingJson}
                                    onChange={(e) => setMappingJson(e.target.value)}
                                    placeholder={`{"cw_ref":"CampusWay Ref","username":"User Name","obtained_marks":"Score","time_taken_sec":"Time Taken"}`}
                                    className="admin-input mt-1 min-h-[120px] font-mono text-xs"
                                />
                            </label>
                        </div>
                    ) : null}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase text-text-muted">
                                {importMode === 'external' ? 'Import External Result File' : 'Import Result File'}
                            </span>
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => {
                                    const nextFile = e.target.files?.[0] || null;
                                    setUploadFile(nextFile);
                                    if (importMode === 'external') {
                                        void loadExternalImportPreview(nextFile);
                                    } else {
                                        setDetectedImportColumns([]);
                                        setSampleImportRows([]);
                                        setMappingSelections({});
                                    }
                                }}
                                className="admin-input mt-1"
                            />
                        </label>
                        <button type="button" disabled={busy || !uploadFile} onClick={() => void importResults()} className="btn-primary"><Upload className="mr-1.5 h-4 w-4" />Import</button>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-text-muted">Export Reports</h4>
                        <input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="Optional Group ID" className="admin-input" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <button type="button" disabled={busy} onClick={() => void exportReport('xlsx')} className="btn-secondary">XLSX</button>
                            <button type="button" disabled={busy} onClick={() => void exportReport('csv')} className="btn-secondary">CSV</button>
                            <button type="button" disabled={busy} onClick={() => void exportReport('pdf')} className="btn-secondary">PDF</button>
                            <button type="button" disabled={busy} onClick={() => void exportLegacyResult()} className="btn-secondary">Legacy XLSX</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // TAB: PAYMENTS
    // ═══════════════════════════════════════════════
    if (tab === 'payments') {
        const payments: Array<Record<string, unknown>> = Array.isArray(paymentsQuery.data) ? paymentsQuery.data : [];
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => setTab('list')} className="btn-ghost">
                    <ChevronLeft className="mr-1 h-4 w-4" />Back
                </button>
                <h2 className="text-xl font-bold text-text dark:text-dark-text">Payments ({payments.length})</h2>

                {paymentsQuery.isLoading ? <p className="text-sm text-text-muted">Loading payments...</p> : null}

                <div className="space-y-2">
                    {payments.map((payment) => {
                        const isPaid = payment.status === 'paid';
                        return (
                            <div key={String(payment._id)} className="admin-panel-bg flex flex-wrap items-center gap-3 rounded-xl p-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text dark:text-dark-text">{String(payment.userId || '')}</p>
                                    <p className="text-xs text-text-muted">{String(payment.method || '')} &middot; BDT {String(payment.amountBDT || payment.amount || 0)}</p>
                                </div>
                                <span className={isPaid ? 'badge-success' : 'badge-warning'}>{String(payment.status)}</span>
                                {!isPaid ? (
                                    <button
                                        type="button"
                                        disabled={verifyPaymentMutation.isPending}
                                        onClick={() => verifyPaymentMutation.mutate({ id: String(payment._id) })}
                                        className="btn-primary text-xs"
                                    >
                                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Verify
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return null;
}
