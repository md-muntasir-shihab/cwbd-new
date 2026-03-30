import { expect, test, type APIRequestContext } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy, loginAsAdmin, loginAsStudent, seededCreds } from './helpers';

type LoginResult = {
    token: string;
    role: string;
};

function authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

async function apiLogin(request: APIRequestContext, identifier: string, password: string): Promise<LoginResult> {
    const response = await request.post('/api/auth/login', {
        data: { identifier, password },
    });
    expect(response.status()).toBe(200);
    return response.json() as Promise<LoginResult>;
}

test.describe.serial('Notification centers', () => {
    let ticketId = '';
    let ticketMarker = '';

    test.beforeAll(async ({ request }) => {
        const adminLogin = await apiLogin(
            request,
            seededCreds.admin.desktop.email,
            seededCreds.admin.desktop.password,
        );
        const studentLogin = await apiLogin(
            request,
            seededCreds.student.desktop.email,
            seededCreds.student.desktop.password,
        );

        ticketMarker = `E2E notification ${Date.now()}`;

        const createTicket = await request.post('/api/student/support-tickets', {
            headers: authHeader(studentLogin.token),
            data: {
                subject: ticketMarker,
                message: 'Notification center regression support ticket.',
                priority: 'high',
            },
        });
        expect(createTicket.status()).toBe(201);
        const ticketBody = await createTicket.json();
        ticketId = String(ticketBody?.item?._id || '');
        expect(ticketId).not.toBe('');

        const replyTicket = await request.post(`/api/campusway-secure-admin/support-tickets/${ticketId}/reply`, {
            headers: authHeader(adminLogin.token),
            data: { message: 'Admin reply for notification center regression proof.' },
        });
        expect(replyTicket.status()).toBe(200);

        const contactResponse = await request.post('/api/contact', {
            data: {
                name: 'Notification Regression',
                email: `notification-${Date.now()}@campusway.local`,
                phone: '01755555555',
                subject: `Contact ${ticketMarker}`,
                message: 'Contact message for actionable alerts regression proof.',
            },
        });
        expect(contactResponse.status()).toBe(201);
    });

    test('student notification center shows support replies and reminder section', async ({ page }) => {
        const tracker = attachHealthTracker(page);
        await loginAsStudent(page, 'desktop');
        await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
        await expect(page.getByText(/Reminder Center/i)).toBeVisible();

        await page.getByRole('button', { name: 'Filter Support notifications' }).click();
        await expect(page.getByText(ticketMarker).first()).toBeVisible();

        const targetCard = page.locator('button').filter({ hasText: ticketMarker }).first();
        await targetCard.click();
        await expect(page).toHaveURL(new RegExp(`/support/${ticketId}$`));

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('admin actionable center groups support and contact alerts', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.includes('mobile'), 'Admin actionable alert browser proof runs on desktop.');

        const tracker = attachHealthTracker(page);
        await loginAsAdmin(page, 'desktop');
        await page.goto('/__cw_admin__/student-management/notifications', { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('heading', { name: /Actionable Alerts/i })).toBeVisible();

        await page.getByRole('button', { name: 'Filter Support alerts' }).click();
        await expect(page.getByText(ticketMarker).first()).toBeVisible();

        await page.getByRole('button', { name: 'Filter Contact alerts' }).click();
        await expect(page.getByText(new RegExp(`Contact ${ticketMarker}`)).first()).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });
});
