import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth';
import { validateBody } from '../validators/validateBody';
import {
    createGroupSchema,
    updateGroupSchema,
    createSubGroupSchema,
    createSubjectSchema,
    createChapterSchema,
    createTopicSchema,
    reorderSchema,
    mergeSchema,
} from '../validators/questionHierarchy.validator';
import {
    getTree,
    createGroup,
    updateGroup,
    deleteGroup,
    createSubGroup,
    updateSubGroup,
    createSubject,
    updateSubject,
    createChapter,
    updateChapter,
    createTopic,
    updateTopic,
    reorderNodes,
    mergeNodes,
} from '../controllers/questionHierarchyController';

// ── Question Hierarchy Routes ───────────────────────────────
// Mount at: /api/v1/question-hierarchy
// Middleware chain: authenticate → requirePermission('question_bank', action) → zodValidate → controller
// Requirements: 1.1, 17.1, 17.4, 17.5, 17.6

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /tree — Full hierarchy tree (view permission)
router.get(
    '/tree',
    requirePermission('question_bank', 'view'),
    getTree,
);

// POST /groups — Create group (create permission)
router.post(
    '/groups',
    requirePermission('question_bank', 'create'),
    validateBody(createGroupSchema),
    createGroup,
);

// PUT /groups/:id — Update group (edit permission)
router.put(
    '/groups/:id',
    requirePermission('question_bank', 'edit'),
    validateBody(updateGroupSchema),
    updateGroup,
);

// DELETE /groups/:id — Delete group (delete permission)
router.delete(
    '/groups/:id',
    requirePermission('question_bank', 'delete'),
    deleteGroup,
);

// POST /sub-groups — Create sub-group (create permission)
router.post(
    '/sub-groups',
    requirePermission('question_bank', 'create'),
    validateBody(createSubGroupSchema),
    createSubGroup,
);

// PUT /sub-groups/:id — Update sub-group (edit permission)
router.put(
    '/sub-groups/:id',
    requirePermission('question_bank', 'edit'),
    validateBody(updateGroupSchema),
    updateSubGroup,
);

// POST /subjects — Create subject (create permission)
router.post(
    '/subjects',
    requirePermission('question_bank', 'create'),
    validateBody(createSubjectSchema),
    createSubject,
);

// PUT /subjects/:id — Update subject (edit permission)
router.put(
    '/subjects/:id',
    requirePermission('question_bank', 'edit'),
    validateBody(updateGroupSchema),
    updateSubject,
);

// POST /chapters — Create chapter (create permission)
router.post(
    '/chapters',
    requirePermission('question_bank', 'create'),
    validateBody(createChapterSchema),
    createChapter,
);

// PUT /chapters/:id — Update chapter (edit permission)
router.put(
    '/chapters/:id',
    requirePermission('question_bank', 'edit'),
    validateBody(updateGroupSchema),
    updateChapter,
);

// POST /topics — Create topic (create permission)
router.post(
    '/topics',
    requirePermission('question_bank', 'create'),
    validateBody(createTopicSchema),
    createTopic,
);

// PUT /topics/:id — Update topic (edit permission)
router.put(
    '/topics/:id',
    requirePermission('question_bank', 'edit'),
    validateBody(updateGroupSchema),
    updateTopic,
);

// PUT /:level/:id/reorder — Reorder nodes at a hierarchy level (edit permission)
// The reorderSchema validates { level, orderedIds } in the body.
// The :level param is also in the URL for RESTful routing.
router.put(
    '/:level/:id/reorder',
    requirePermission('question_bank', 'edit'),
    validateBody(reorderSchema),
    reorderNodes,
);

// POST /:level/merge — Merge two nodes at the same hierarchy level (edit permission)
router.post(
    '/:level/merge',
    requirePermission('question_bank', 'edit'),
    validateBody(mergeSchema),
    mergeNodes,
);

export default router;
