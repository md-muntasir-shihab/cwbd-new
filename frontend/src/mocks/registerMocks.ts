/**
 * Mock handler registration for dev/QA mode.
 * Activated when VITE_USE_MOCK_API=true.
 *
 * Registers mock responses for the 3 public university endpoints.
 * No-op when mock mode is off (registerMock guards internally).
 */

import { registerMock, IS_MOCK_MODE } from '../lib/apiClient';
import {
    mockGetUniversityCategories,
    mockGetUniversities,
    mockGetUniversityBySlug,
} from './universities';
import { mockHomeResponse } from './home';
import type { AxiosResponse } from 'axios';

function mockResponse(data: unknown, status = 200): AxiosResponse {
    return {
        data,
        status,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosResponse['config'],
    };
}

export function registerAllMocks(): void {
    if (!IS_MOCK_MODE) return;

    // GET /university-categories
    registerMock(/\/university-categories/, () =>
        mockResponse({ categories: mockGetUniversityCategories() }),
    );

    // GET /universities/:slug  (must be before /universities to avoid false match)
    registerMock(/\/universities\/([^/?]+)$/, (url) => {
        const slug = url.split('/universities/')[1]?.split('?')[0] || '';
        try {
            const university = mockGetUniversityBySlug(decodeURIComponent(slug));
            return mockResponse({ university });
        } catch {
            return mockResponse({ message: 'Not found' }, 404);
        }
    });

    // GET /universities
    registerMock(/\/universities(\?|$)/, (url) => {
        const searchParams = new URLSearchParams(url.split('?')[1] || '');
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => { params[key] = value; });
        const result = mockGetUniversities(params);
        return mockResponse({
            universities: result.universities,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                pages: Math.ceil(result.total / result.limit),
            },
        });
    });

    // GET /settings/public
    registerMock(/\/settings\/public(\?|$)/, () =>
        mockResponse({
            websiteName: 'CampusWay',
            siteName: 'CampusWay',
            logoUrl: '',
            motto: 'Plan. Explore. Achieve.',
            contactEmail: 'support@campusway.local',
            contactPhone: '',
        }),
    );

    // GET /home
    registerMock(/\/home(\?|$)/, () => mockResponse(mockHomeResponse()));

    console.log('[MockAPI] University mock handlers registered.');
}
