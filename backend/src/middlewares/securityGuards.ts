import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from './auth';
import { getClientIp } from '../utils/requestMeta';
import { getSecuritySettingsSnapshot, isIpAllowed } from '../services/securityCenterService';

function isAdminRole(role: string | undefined): boolean {
    return ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'].includes(String(role || '').toLowerCase());
}

function isMutatingMethod(method: string): boolean {
    const normalized = String(method || '').toUpperCase();
    return !['GET', 'HEAD', 'OPTIONS'].includes(normalized);
}

export async function enforceSiteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const security = await getSecuritySettingsSnapshot(false);
        const isHealthRoute = req.path === '/health' || req.path === '/api/health';
        const isAuthRoute = req.path.startsWith('/api/auth') || req.path.startsWith('/auth');
        const isAdminApiRoute = req.path.startsWith('/api/admin') || req.path.includes('/campusway-secure-admin');
        if (!security.siteAccess.maintenanceMode || isHealthRoute || isAuthRoute || isAdminApiRoute) {
            next();
            return;
        }

        const authReq = req as AuthRequest;
        const role = String(authReq.user?.role || '').toLowerCase();
        if (isAdminRole(role)) {
            next();
            return;
        }

        res.status(503).json({
            code: 'MAINTENANCE_MODE',
            message: 'The site is currently under maintenance. Please try again later.',
        });
    } catch {
        next();
    }
}

export async function enforceRegistrationPolicy(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const security = await getSecuritySettingsSnapshot(false);
        if (security.siteAccess.blockNewRegistrations) {
            res.status(403).json({
                code: 'REGISTRATION_BLOCKED',
                message: 'New registrations are currently disabled by administrator policy.',
            });
            return;
        }
        next();
    } catch {
        next();
    }
}

export async function enforceAdminPanelPolicy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const security = await getSecuritySettingsSnapshot(false);
        const role = String(req.user.role || '').toLowerCase();

        if (!security.adminAccess.adminPanelEnabled && role !== 'superadmin') {
            res.status(423).json({
                code: 'ADMIN_PANEL_LOCKED',
                message: 'Admin panel is temporarily locked by Security Center.',
            });
            return;
        }

        if (role !== 'superadmin') {
            const clientIp = getClientIp(req);
            if (!isIpAllowed(clientIp, security.adminAccess.allowedAdminIPs)) {
                res.status(403).json({
                    code: 'ADMIN_IP_BLOCKED',
                    message: 'Your IP is not allowed to access admin endpoints.',
                });
                return;
            }
        }

        next();
    } catch {
        next();
    }
}

export async function enforceAdminReadOnlyMode(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (!isMutatingMethod(req.method)) {
            next();
            return;
        }

        const security = await getSecuritySettingsSnapshot(false);
        const role = String(req.user.role || '').toLowerCase();
        if (security.panic.readOnlyMode && role !== 'superadmin') {
            res.status(423).json({
                code: 'READ_ONLY_MODE',
                message: 'Read-only mode is enabled. Only super admin can run mutations.',
            });
            return;
        }

        next();
    } catch {
        next();
    }
}
