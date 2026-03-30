/**
 * React Query hooks for the Universities module.
 * Supports optional mock-API mode via VITE_USE_MOCK_API.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  getUniversities,
  getUniversityBySlug,
  getPublicHomeSettings,
  type ApiUniversity,
  type HomeSettingsConfig,
} from '../services/api';

import {
  type UniversityCategoryDetail,
  type UniversityCard,
  normalizeUniversityCard,
  fetchUniversityCategories,
  toSlug,
} from '../lib/apiClient';
import {
  mockGetUniversityCategories,
  mockGetUniversities,
  mockGetUniversityBySlug,
} from '../mocks/universities';

const USE_MOCK = String(import.meta.env.VITE_USE_MOCK_API || '').toLowerCase() === 'true';

/* ── helpers ── */
function unpackUniversityList(payload: unknown): ApiUniversity[] {
  const data = payload as {
    universities?: ApiUniversity[];
    items?: ApiUniversity[];
    data?: ApiUniversity[];
  };
  if (Array.isArray(data?.universities)) return data.universities;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/* ── Categories ── */
export function useUniversityCategories() {
  return useQuery<UniversityCategoryDetail[]>({
    queryKey: ['universityCategories'],
    queryFn: async () => {
      if (USE_MOCK) {
        const raw = mockGetUniversityCategories();
        return raw.map(c => ({
          categoryName: c.categoryName,
          categorySlug: toSlug(c.categoryName),
          order: c.order,
          count: c.count,
          clusterGroups: c.clusterGroups,
        }));
      }
      return fetchUniversityCategories();
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
}

/* ── Universities list ── */
export interface UniversityListParams {
  category: string;
  clusterGroup?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export function useUniversities(params: UniversityListParams) {
  const { category, clusterGroup, q, sort = 'name_asc', page = 1, limit = 500 } = params;
  return useQuery<UniversityCard[]>({
    queryKey: ['universities', { category, clusterGroup: clusterGroup || '', q: q || '', sort, page, limit }],
    enabled: Boolean(category),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      if (USE_MOCK) {
        const res = mockGetUniversities({ category, clusterGroup, q, sort, page, limit });
        return (res.items as unknown as ApiUniversity[]).map(normalizeUniversityCard);
      }
      const apiParams: Record<string, string | number> = { category, sort, page, limit };
      if (q) apiParams.q = q;
      if (clusterGroup) apiParams.clusterGroup = clusterGroup;
      const response = await getUniversities(apiParams, signal);
      return unpackUniversityList(response.data).map(normalizeUniversityCard);
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
}

/* ── University detail ── */
export function useUniversityDetail(slug: string | undefined) {
  return useQuery<ApiUniversity>({
    queryKey: ['universityDetail', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      if (USE_MOCK) return mockGetUniversityBySlug(slug!) as unknown as ApiUniversity;
      const res = await getUniversityBySlug(slug!);
      const d = res.data as unknown as Record<string, unknown>;
      if (d && typeof d === 'object' && 'university' in d) return d.university as ApiUniversity;
      return d as unknown as ApiUniversity;
    },
    staleTime: 60_000,
  });
}

/* ── Home settings (for default category, card config, etc.) ── */
export function usePublicHomeSettings() {
  return useQuery<HomeSettingsConfig>({
    queryKey: ['home-settings-public'],
    queryFn: async () => (await getPublicHomeSettings()).data.homeSettings,
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
}
