import { Request, Response } from 'express';
import University from '../models/University';
import UniversitySettingsModel from '../models/UniversitySettings';
import {
    buildPublicUniversityExclusionQuery,
    combineMongoFilters,
} from '../utils/publicFixtureFilters';

export const getUniversityCategories = async (_req: Request, res: Response): Promise<void> => {
    try {
        const publicUniversityFilter = combineMongoFilters(
            { isActive: true, isArchived: { $ne: true } },
            buildPublicUniversityExclusionQuery(),
        );
        const [uniSettingsDoc, rawUniversities] = await Promise.all([
            UniversitySettingsModel.findOne().lean(),
            University.find(publicUniversityFilter)
                .select('category clusterGroup')
                .lean(),
        ]);

        // Build: { category -> { count, clusterGroups: Set } }
        const categoryMap = new Map<string, { count: number; clusters: Set<string> }>();

        for (const uni of rawUniversities as Array<{ category?: string; clusterGroup?: string }>) {
            const cat = (uni.category || 'Uncategorized').trim();
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { count: 0, clusters: new Set() });
            }
            const entry = categoryMap.get(cat)!;
            entry.count += 1;
            const cluster = (uni.clusterGroup || '').trim();
            if (cluster) {
                entry.clusters.add(cluster);
            }
        }

        // Order by categoryOrder from settings, then alphabetical for unlisted
        const categoryOrder: string[] = (uniSettingsDoc?.categoryOrder || []);
        const orderMap = new Map(categoryOrder.map((cat, i) => [cat, i]));

        const categories = Array.from(categoryMap.entries())
            .map(([categoryName, { count, clusters }]) => ({
                categoryName,
                count,
                clusterGroups: Array.from(clusters).sort((a, b) => a.localeCompare(b)),
            }))
            .sort((a, b) => {
                const aOrder = orderMap.get(a.categoryName) ?? 999;
                const bOrder = orderMap.get(b.categoryName) ?? 999;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.categoryName.localeCompare(b.categoryName);
            });

        res.json({ ok: true, data: categories });
    } catch (error) {
        console.error('getUniversityCategories error:', error);
        res.status(500).json({ ok: false, message: 'Internal Server Error' });
    }
};
