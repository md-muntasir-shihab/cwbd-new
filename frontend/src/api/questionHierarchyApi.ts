import api from '../services/api';
import type {
    ApiResponse,
    HierarchyTree,
    HierarchyNode,
    CreateGroupDto,
    UpdateGroupDto,
    CreateSubGroupDto,
    CreateSubjectDto,
    CreateChapterDto,
    CreateTopicDto,
    ReorderNodesDto,
    MergeNodesDto,
    HierarchyLevel,
} from '../types/exam-system';

const BASE = '/v1/question-hierarchy';

/** GET /tree — Full hierarchy tree. */
export const getTree = () =>
    api.get<HierarchyTree>(`${BASE}/tree`).then((r) => r.data as HierarchyTree);

/** POST /groups — Create a top-level group. */
export const createGroup = (payload: CreateGroupDto) =>
    api.post<ApiResponse<HierarchyNode>>(`${BASE}/groups`, payload).then((r) => r.data);

/** PUT /groups/:id — Update a group. */
export const updateGroup = (id: string, payload: UpdateGroupDto) =>
    api.put<ApiResponse<HierarchyNode>>(`${BASE}/groups/${id}`, payload).then((r) => r.data);

/** DELETE /groups/:id — Delete a group (rejected if children exist). */
export const deleteGroup = (id: string) =>
    api.delete<ApiResponse<null>>(`${BASE}/groups/${id}`).then((r) => r.data);

/** POST /sub-groups — Create a sub-group under a group. */
export const createSubGroup = (payload: CreateSubGroupDto) =>
    api.post<ApiResponse<HierarchyNode>>(`${BASE}/sub-groups`, payload).then((r) => r.data);

/** POST /subjects — Create a subject under a sub-group. */
export const createSubject = (payload: CreateSubjectDto) =>
    api.post<ApiResponse<HierarchyNode>>(`${BASE}/subjects`, payload).then((r) => r.data);

/** POST /chapters — Create a chapter under a subject. */
export const createChapter = (payload: CreateChapterDto) =>
    api.post<ApiResponse<HierarchyNode>>(`${BASE}/chapters`, payload).then((r) => r.data);

/** POST /topics — Create a topic under a chapter. */
export const createTopic = (payload: CreateTopicDto) =>
    api.post<ApiResponse<HierarchyNode>>(`${BASE}/topics`, payload).then((r) => r.data);

/** PUT /:level/:id/reorder — Reorder nodes at a hierarchy level. */
export const reorderNodes = (level: HierarchyLevel, id: string, payload: ReorderNodesDto) =>
    api.put<ApiResponse<null>>(`${BASE}/${level}/${id}/reorder`, payload).then((r) => r.data);

/** POST /:level/merge — Merge two nodes at the same hierarchy level. */
export const mergeNodes = (level: HierarchyLevel, payload: MergeNodesDto) =>
    api.post<ApiResponse<null>>(`${BASE}/${level}/merge`, payload).then((r) => r.data);
