import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as qbApi from '../api/adminQuestionBankApi';
import type { BankQuestionFilters, BankQuestionListResponse } from '../types/questionBank';

/* ── Key factory ── */
export const qbKeys = {
    all: ['questionBankV2'] as const,
    list: (f: BankQuestionFilters) => [...qbKeys.all, 'list', f] as const,
    detail: (id: string) => [...qbKeys.all, 'detail', id] as const,
    facets: [...(['questionBankV2', 'facets'] as const)] as const,
    sets: ['questionBankV2', 'sets'] as const,
    setDetail: (id: string) => [...qbKeys.sets, id] as const,
    setResolve: (id: string) => [...qbKeys.sets, 'resolve', id] as const,
    analytics: (p?: Record<string, string>) => [...qbKeys.all, 'analytics', p] as const,
    settings: [...(['questionBankV2', 'settings'] as const)] as const,
    examSearch: (examId: string, f: BankQuestionFilters) => [...qbKeys.all, 'examSearch', examId, f] as const,
};

/* ── Settings ── */
export const useQBSettings = () =>
    useQuery({ queryKey: qbKeys.settings, queryFn: qbApi.getQBSettings });

export const useUpdateQBSettings = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.updateQBSettings,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.settings }),
    });
};

/* ── Questions CRUD ── */
export const useBankQuestionList = (filters: BankQuestionFilters) =>
    useQuery({
        queryKey: qbKeys.list(filters),
        queryFn: () => qbApi.listBankQuestions(filters),
        placeholderData: (prev: BankQuestionListResponse | undefined) => prev,
    });

export const useBankQuestionFacets = () =>
    useQuery({
        queryKey: qbKeys.facets,
        queryFn: qbApi.getFacets,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

export const useBankQuestionDetail = (id: string) =>
    useQuery({
        queryKey: qbKeys.detail(id),
        queryFn: () => qbApi.getBankQuestion(id),
        enabled: !!id,
    });

export const useCreateBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.createBankQuestion,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useUpdateBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
            qbApi.updateBankQuestion(id, payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useDeleteBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.deleteBankQuestion,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useArchiveBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.archiveBankQuestion,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useRestoreBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.restoreBankQuestion,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useDuplicateBankQuestion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.duplicateBankQuestion,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

/* ── Bulk ── */
export const useBulkArchive = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.bulkArchive,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useBulkActivate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ ids, active }: { ids: string[]; active: boolean }) =>
            qbApi.bulkActivate(ids, active),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useBulkUpdateTags = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ ids, tags, mode }: { ids: string[]; tags: string[]; mode: 'add' | 'set' }) =>
            qbApi.bulkUpdateTags(ids, tags, mode),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useBulkDelete = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.bulkDelete,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useBulkCopy = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.bulkCopy,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

/* ── Import ── */
export const useImportPreview = () =>
    useMutation({
        mutationFn: ({ file, mapping }: { file: File; mapping?: Record<string, string> }) =>
            qbApi.importPreview(file, mapping),
    });

export const useImportCommit = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ file, mapping, mode }: { file: File; mapping: Record<string, string>; mode: 'create' | 'upsert' }) =>
            qbApi.importCommit(file, mapping, mode),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

/* ── Sets ── */
export const useSetList = () =>
    useQuery({ queryKey: qbKeys.sets, queryFn: qbApi.listSets });

export const useSetDetail = (id: string) =>
    useQuery({ queryKey: qbKeys.setDetail(id), queryFn: () => qbApi.getSet(id), enabled: !!id });

export const useCreateSet = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.createSet,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.sets }),
    });
};

export const useUpdateSet = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
            qbApi.updateSet(id, payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.sets }),
    });
};

export const useDeleteSet = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.deleteSet,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.sets }),
    });
};

export const useResolveSetQuestions = (id: string) =>
    useQuery({ queryKey: qbKeys.setResolve(id), queryFn: () => qbApi.resolveSetQuestions(id), enabled: !!id });

/* ── Exam Integration ── */
export const useSearchBankForExam = (examId: string, filters: BankQuestionFilters) =>
    useQuery({
        queryKey: qbKeys.examSearch(examId, filters),
        queryFn: () => qbApi.searchBankForExam(examId, filters),
        enabled: !!examId,
    });

export const useAttachBankToExam = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ examId, bankQuestionIds }: { examId: string; bankQuestionIds: string[] }) =>
            qbApi.attachBankToExam(examId, bankQuestionIds),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useRemoveBankFromExam = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ examId, questionId }: { examId: string; questionId: string }) =>
            qbApi.removeBankFromExam(examId, questionId),
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useFinalizeExamSnapshot = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.finalizeExamSnapshot,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

/* ── Analytics ── */
export const useQBAnalytics = (params?: Record<string, string>) =>
    useQuery({ queryKey: qbKeys.analytics(params), queryFn: () => qbApi.getAnalytics(params) });

export const useRefreshQuestionAnalytics = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.refreshQuestionAnalytics,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};

export const useRefreshAllAnalytics = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: qbApi.refreshAllAnalytics,
        onSuccess: () => qc.invalidateQueries({ queryKey: qbKeys.all }),
    });
};
