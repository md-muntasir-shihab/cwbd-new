import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import {
    countAdminUnreadAlerts,
    markAdminAlertsRead,
    queryAdminAlerts,
} from '../services/adminAlertService';

function ensureAlertAdmin(
    req: AuthRequest,
    res: Response,
): 'superadmin' | 'admin' | 'moderator' | 'viewer' | 'support_agent' | 'finance_agent' | null {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return null;
    }
    if (!['superadmin', 'admin', 'moderator', 'viewer', 'support_agent', 'finance_agent'].includes(req.user.role)) {
        res.status(403).json({ message: 'Admin access required' });
        return null;
    }
    return req.user.role as 'superadmin' | 'admin' | 'moderator' | 'viewer' | 'support_agent' | 'finance_agent';
}

export async function adminGetActionableAlerts(req: AuthRequest, res: Response): Promise<void> {
    try {
        const role = ensureAlertAdmin(req, res);
        if (!role || !req.user) return;

        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
        const result = await queryAdminAlerts({
            userId: req.user._id,
            role,
            page,
            limit,
            unread: String(req.query.filter || '').trim().toLowerCase() === 'unread',
            type: String(req.query.type || '').trim(),
            group: String(req.query.group || '').trim(),
        });

        res.json(result);
    } catch (error) {
        console.error('adminGetActionableAlerts error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminMarkActionableAlertsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
        const role = ensureAlertAdmin(req, res);
        if (!role || !req.user) return;

        const idsRaw = Array.isArray((req.body as Record<string, unknown>).ids)
            ? ((req.body as Record<string, unknown>).ids as unknown[])
            : [];
        const ids = idsRaw.map((id) => String(id || '').trim()).filter(Boolean);

        const result = await markAdminAlertsRead(req.user._id, ids, role);
        res.json(result);
    } catch (error) {
        console.error('adminMarkActionableAlertsRead error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetActionableAlertsUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
        const role = ensureAlertAdmin(req, res);
        if (!role || !req.user) return;

        const result = await countAdminUnreadAlerts(
            req.user._id,
            role,
            String(req.query.type || '').trim(),
        );
        res.json(result);
    } catch (error) {
        console.error('adminGetActionableAlertsUnreadCount error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminMarkSingleActionableAlertRead(req: AuthRequest, res: Response): Promise<void> {
    try {
        const role = ensureAlertAdmin(req, res);
        if (!role || !req.user) return;

        const result = await markAdminAlertsRead(req.user._id, [String(req.params.id || '').trim()], role);
        res.json(result);
    } catch (error) {
        console.error('adminMarkSingleActionableAlertRead error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminMarkAllActionableAlertsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
        const role = ensureAlertAdmin(req, res);
        if (!role || !req.user) return;

        const result = await markAdminAlertsRead(req.user._id, [], role);
        res.json(result);
    } catch (error) {
        console.error('adminMarkAllActionableAlertsRead error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}
