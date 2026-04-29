/**
 * Public, unauthenticated integrations endpoints.
 * Currently exposes only the analytics client config (already designed to be
 * public per Umami / Plausible semantics). No secrets are ever returned here.
 */
import { Router, type Request, type Response } from 'express';
import { getPublicAnalyticsConfig } from '../services/integrations/analyticsHelper';

const router = Router();

router.get('/analytics-config', async (_req: Request, res: Response) => {
    const config = await getPublicAnalyticsConfig();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(config);
});

export default router;
