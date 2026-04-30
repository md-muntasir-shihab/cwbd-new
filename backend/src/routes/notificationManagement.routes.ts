import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth';
import { validateBody } from '../validators/validateBody';
import {
    updateNotificationDefaultsSchema,
    sendAnnouncementSchema,
} from '../validators/notificationManagement.validator';
import {
    getSentNotifications,
    getNotificationDefaults,
    updateNotificationDefaults,
    sendAnnouncement,
} from '../controllers/notificationManagementController';

// ── Notification Management Routes ──────────────────────────
// Mount at: /api/v1/notifications
// Admin routes: authenticate → requirePermission('notifications', action) → zodValidate → controller
// Requirements: 4.4, 5.4, 6.3, 7.6, 9.1, 9.2, 9.3, 9.4, 9.6

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /admin/sent — List recently sent notifications
router.get(
    '/admin/sent',
    requirePermission('notifications', 'view'),
    getSentNotifications,
);

// GET /admin/defaults — Fetch notification channel defaults
router.get(
    '/admin/defaults',
    requirePermission('notifications', 'view'),
    getNotificationDefaults,
);

// PUT /admin/defaults — Update notification channel defaults
router.put(
    '/admin/defaults',
    requirePermission('notifications', 'edit'),
    validateBody(updateNotificationDefaultsSchema),
    updateNotificationDefaults,
);

// POST /admin/announce — Send an announcement notification
router.post(
    '/admin/announce',
    requirePermission('notifications', 'create'),
    validateBody(sendAnnouncementSchema),
    sendAnnouncement,
);

export default router;
