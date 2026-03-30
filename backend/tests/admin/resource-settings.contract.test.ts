import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import ResourceSettings from '../../src/models/ResourceSettings';
import { adminGetResourceSettings, adminUpdateResourceSettings } from '../../src/controllers/cmsController';
import { getPublicResourceSettings } from '../../src/controllers/resourceController';

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction) => {
        handler(req, res).catch(next);
    };
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.get('/admin/resource-settings', wrap(adminGetResourceSettings));
    app.put('/admin/resource-settings', wrap(adminUpdateResourceSettings));
    app.get('/resources/settings/public', wrap(getPublicResourceSettings));
    return app;
}

describe('resource settings contract', () => {
    test('creates default admin settings when none exist', async () => {
        const app = buildApp();
        const response = await request(app).get('/admin/resource-settings').expect(200);

        expect(response.body.settings.pageTitle).toBe('Student Resources');
        expect(response.body.settings.publicPageEnabled).toBe(true);
        expect(await ResourceSettings.countDocuments({})).toBe(1);
    });

    test('returns sanitized shared settings on the public endpoint', async () => {
        const app = buildApp();

        await request(app)
            .put('/admin/resource-settings')
            .send({
                pageTitle: 'Open Library',
                pageSubtitle: 'Curated public learning assets',
                heroBadgeLabel: 'Library',
                publicPageEnabled: false,
                studentHubEnabled: false,
                showHero: false,
                showSearch: false,
                defaultSort: 'views',
                defaultType: 'pdf',
                defaultCategory: 'Question Banks',
                allowUserUploads: true,
                requireAdminApproval: false,
                maxFileSizeMB: 120,
                allowedCategories: ['Question Banks', 'Scholarships'],
                allowedTypes: ['pdf', 'video', 'unknown'],
                openLinksInNewTab: false,
                featuredSectionTitle: 'Staff Picks',
                emptyStateMessage: 'Nothing to show yet.',
            })
            .expect(200);

        const response = await request(app).get('/resources/settings/public').expect(200);

        expect(response.body.settings).toEqual(expect.objectContaining({
            pageTitle: 'Open Library',
            pageSubtitle: 'Curated public learning assets',
            heroBadgeLabel: 'Library',
            publicPageEnabled: false,
            studentHubEnabled: false,
            showHero: false,
            showSearch: false,
            defaultSort: 'views',
            defaultType: 'pdf',
            defaultCategory: 'Question Banks',
            allowedCategories: ['Question Banks', 'Scholarships'],
            allowedTypes: ['pdf', 'video'],
            openLinksInNewTab: false,
            featuredSectionTitle: 'Staff Picks',
            emptyStateMessage: 'Nothing to show yet.',
        }));
        expect(response.body.settings.allowUserUploads).toBeUndefined();
        expect(response.body.settings.requireAdminApproval).toBeUndefined();
        expect(response.body.settings.maxFileSizeMB).toBeUndefined();
    });
});
