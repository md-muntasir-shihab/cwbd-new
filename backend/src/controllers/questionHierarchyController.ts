import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { ResponseBuilder } from '../utils/responseBuilder';
import * as QuestionHierarchyService from '../services/QuestionHierarchyService';
import type { HierarchyLevel } from '../services/QuestionHierarchyService';

// ── Question Hierarchy Controller ───────────────────────────
// Thin handlers delegating to QuestionHierarchyService.
// Requirements: 1.1, 17.1, 17.4, 17.5, 17.6

/**
 * GET /tree — Return the full 5-level hierarchy tree.
 */
export async function getTree(_req: AuthRequest, res: Response): Promise<void> {
    try {
        const groups = await QuestionHierarchyService.getFullTree();
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ groups }));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

/**
 * POST /groups — Create a new question group.
 */
export async function createGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
        const group = await QuestionHierarchyService.createGroup(req.body);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(group, 'Group created successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('already exists') ? 409 : 500;
        const code = status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /groups/:id — Update an existing question group.
 */
export async function updateGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
        const group = await QuestionHierarchyService.updateGroup(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(group, 'Group updated successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * DELETE /groups/:id — Delete a question group (rejects if children exist).
 */
export async function deleteGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
        await QuestionHierarchyService.deleteGroup(String(req.params.id));
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Group deleted successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('Cannot delete') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /sub-groups/:id — Update an existing sub-group.
 */
export async function updateSubGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
        const subGroup = await QuestionHierarchyService.updateSubGroup(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(subGroup, 'Sub-group updated successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /subjects/:id — Update an existing subject.
 */
export async function updateSubject(req: AuthRequest, res: Response): Promise<void> {
    try {
        const subject = await QuestionHierarchyService.updateSubject(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(subject, 'Subject updated successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /chapters/:id — Update an existing chapter.
 */
export async function updateChapter(req: AuthRequest, res: Response): Promise<void> {
    try {
        const chapter = await QuestionHierarchyService.updateChapter(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(chapter, 'Chapter updated successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /topics/:id — Update an existing topic.
 */
export async function updateTopic(req: AuthRequest, res: Response): Promise<void> {
    try {
        const topic = await QuestionHierarchyService.updateTopic(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(topic, 'Topic updated successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * POST /sub-groups — Create a new sub-group under a group.
 */
export async function createSubGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
        const subGroup = await QuestionHierarchyService.createSubGroup(req.body);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(subGroup, 'Sub-group created successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * POST /subjects — Create a new subject under a sub-group.
 */
export async function createSubject(req: AuthRequest, res: Response): Promise<void> {
    try {
        const subject = await QuestionHierarchyService.createSubject(req.body);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(subject, 'Subject created successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * POST /chapters — Create a new chapter under a subject.
 */
export async function createChapter(req: AuthRequest, res: Response): Promise<void> {
    try {
        const chapter = await QuestionHierarchyService.createChapter(req.body);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(chapter, 'Chapter created successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * POST /topics — Create a new topic under a chapter.
 */
export async function createTopic(req: AuthRequest, res: Response): Promise<void> {
    try {
        const topic = await QuestionHierarchyService.createTopic(req.body);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(topic, 'Topic created successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * PUT /:level/:id/reorder — Reorder nodes at a given hierarchy level.
 * Expects body: { orderedIds: string[] }
 */
export async function reorderNodes(req: AuthRequest, res: Response): Promise<void> {
    try {
        const level = req.params.level as HierarchyLevel;
        const { orderedIds } = req.body;
        await QuestionHierarchyService.reorderNodes(level, orderedIds);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Nodes reordered successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('Unknown hierarchy level') ? 400 : 500;
        const code = status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

/**
 * POST /:level/merge — Merge two nodes at the same hierarchy level.
 * Expects body: { sourceId: string, targetId: string }
 */
export async function mergeNodes(req: AuthRequest, res: Response): Promise<void> {
    try {
        const level = req.params.level as HierarchyLevel;
        const { sourceId, targetId } = req.body;
        await QuestionHierarchyService.mergeNodes(level, sourceId, targetId);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Nodes merged successfully'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('Unknown hierarchy level') ? 400 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}
