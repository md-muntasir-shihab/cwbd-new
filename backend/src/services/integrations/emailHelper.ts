/**
 * SMTP / Listmonk helpers — feature-gated.
 * sendTransactionalEmail() prefers SMTP when ready; returns false when
 * disabled so callers can fall back to their existing channels.
 * subscribeToList() is a no-op if Listmonk is disabled.
 *
 * No SDK: nodemailer is dynamically required only when SMTP is enabled, so
 * if the project hasn't installed it the call still degrades gracefully.
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

export interface EmailMessage {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
}

export async function sendTransactionalEmail(msg: EmailMessage): Promise<boolean> {
    const ready = await isIntegrationReady('smtp');
    if (!ready) return false;
    const cfg = await getIntegrationConfig('smtp');
    if (!cfg) return false;
    const password = (await getDecryptedSecret('smtp', 'password')) ?? '';
    const host = String(cfg.host || '');
    const port = Number(cfg.port || 587);
    const user = String(cfg.user || '');
    const fromAddress = msg.from || String(cfg.fromAddress || user || '');
    const secure = port === 465;
    if (!host || !user || !password || !fromAddress) return false;

    try {
        // Dynamic require so the project doesn't take a hard dep on nodemailer
        // until an admin actually enables SMTP.
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
        const nodemailer = require('nodemailer') as any;
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass: password },
        });
        await transporter.sendMail({
            from: fromAddress,
            to: Array.isArray(msg.to) ? msg.to.join(',') : msg.to,
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
        });
        return true;
    } catch (err) {
        logger.warn(`[emailHelper] SMTP send failed: ${(err as Error).message}`);
        return false;
    }
}

export async function subscribeToList(email: string, name?: string): Promise<boolean> {
    const ready = await isIntegrationReady('listmonk');
    if (!ready) return false;
    const cfg = await getIntegrationConfig('listmonk');
    if (!cfg) return false;
    const host = String(cfg.host || '').replace(/\/$/, '');
    const listIdRaw = cfg.defaultListId;
    const listId = typeof listIdRaw === 'number' ? listIdRaw : Number(listIdRaw);
    const username = String(cfg.username || '');
    const password = (await getDecryptedSecret('listmonk', 'password')) ?? '';
    if (!host || !username || !password || !listId || Number.isNaN(listId)) return false;

    try {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const res = await fetch(`${host}/api/subscribers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({
                email,
                name: name || email,
                lists: [listId],
                preconfirm_subscriptions: true,
            }),
        });
        // 200 created or 409 already subscribed both count as success
        return res.status === 200 || res.status === 409;
    } catch (err) {
        logger.warn(`[emailHelper] Listmonk subscribe failed: ${(err as Error).message}`);
        return false;
    }
}
