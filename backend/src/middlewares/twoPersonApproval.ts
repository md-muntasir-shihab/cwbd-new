import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { RiskyActionKey } from '../models/SecuritySettings';
import {
    buildApprovalRequestContextFromRequest,
    requestApproval,
    shouldRequireTwoPersonApproval,
} from '../services/actionApprovalService';

export function requireTwoPersonApproval(
    actionKey: RiskyActionKey,
    moduleName: string,
    actionName: string,
) {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.user?._id) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            if (req.user.role === 'superadmin') {
                next();
                return;
            }

            const enabled = await shouldRequireTwoPersonApproval(actionKey);
            if (!enabled) {
                next();
                return;
            }

            const approval = await requestApproval({
                actionKey,
                module: moduleName,
                action: actionName,
                routePath: req.originalUrl,
                method: req.method,
                paramsSnapshot: { ...(req.params || {}) },
                querySnapshot: { ...(req.query || {}) } as Record<string, unknown>,
                payloadSnapshot: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>,
                actor: {
                    userId: req.user._id,
                    role: req.user.role,
                },
                requestContext: buildApprovalRequestContextFromRequest(req),
            });

            res.status(202).json({
                message: 'Action requires second approval and is now queued.',
                code: 'PENDING_SECOND_APPROVAL',
                approvalId: approval._id,
                expiresAt: approval.expiresAt,
            });
        } catch (error) {
            console.error('requireTwoPersonApproval error:', error);
            res.status(500).json({ message: 'Failed to queue approval request.' });
        }
    };
}
