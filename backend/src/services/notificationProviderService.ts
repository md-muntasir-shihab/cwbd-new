import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { decrypt } from './cryptoService';
import NotificationProvider, { INotificationProvider } from '../models/NotificationProvider';
import NotificationTemplate from '../models/NotificationTemplate';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import StudentProfile from '../models/StudentProfile';
import User from '../models/User';

export interface SendSMSOptions {
    to: string;
    body: string;
    meta?: Record<string, unknown>;
}

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    meta?: Record<string, unknown>;
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

function decryptCredentials(provider: INotificationProvider): Record<string, string> {
    const raw = (provider as unknown as Record<string, string>).credentialsEncrypted;
    if (!raw) return {};
    try {
        return JSON.parse(decrypt(raw)) as Record<string, string>;
    } catch {
        return {};
    }
}

export async function sendSMS(
    options: SendSMSOptions,
    providerDoc: INotificationProvider,
): Promise<SendResult> {
    const creds = decryptCredentials(providerDoc);

    if (providerDoc.provider === 'local_bd_rest') {
        const apiUrl = creds.apiUrl ?? 'https://api.greenweb.com.bd/api.php';
        const params = new URLSearchParams({
            token: creds.token ?? creds.api_key ?? '',
            to: options.to,
            message: options.body,
        });
        const senderId = creds.senderid ?? providerDoc.senderConfig?.smsSenderId;
        if (senderId) params.set('from', senderId);
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        const text = await response.text();
        if (response.ok) return { success: true, messageId: text.trim() };
        return { success: false, error: `local_bd_rest error ${response.status}: ${text}` };
    }

    if (providerDoc.provider === 'twilio') {
        const { accountSid, authToken } = creds;
        const from = creds.fromNumber ?? providerDoc.senderConfig?.smsSenderId ?? '';
        if (!accountSid || !authToken)
            return { success: false, error: 'Twilio credentials missing (accountSid / authToken)' };
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const params = new URLSearchParams({ To: options.to, From: from, Body: options.body });
        const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${authHeader}`,
            },
            body: params.toString(),
        });
        const json = (await response.json()) as Record<string, unknown>;
        if (response.ok && json.sid) return { success: true, messageId: String(json.sid) };
        return { success: false, error: `Twilio error ${response.status}: ${JSON.stringify(json)}` };
    }

    if (providerDoc.provider === 'custom') {
        const { webhookUrl } = creds;
        if (!webhookUrl)
            return { success: false, error: 'Custom SMS provider missing webhookUrl credential' };
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: options.to, body: options.body, ...(options.meta ?? {}) }),
        });
        const text = await response.text();
        if (response.ok) return { success: true };
        return { success: false, error: `Custom SMS error ${response.status}: ${text}` };
    }

    return { success: false, error: `Unsupported SMS provider: ${providerDoc.provider}` };
}

export async function sendEmail(
    options: SendEmailOptions,
    providerDoc: INotificationProvider,
): Promise<SendResult> {
    const creds = decryptCredentials(providerDoc);
    const fromName = providerDoc.senderConfig?.fromName ?? creds.fromName ?? 'CampusWay';
    const fromEmail = providerDoc.senderConfig?.fromEmail ?? creds.fromEmail ?? '';

    if (providerDoc.provider === 'smtp') {
        const transport = nodemailer.createTransport({
            host: creds.host,
            port: Number(creds.port ?? 587),
            secure: creds.secure === 'true',
            auth: { user: creds.user, pass: creds.pass },
        });
        const info = await transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        });
        return { success: true, messageId: info.messageId };
    }

    if (providerDoc.provider === 'sendgrid') {
        const { apiKey } = creds;
        if (!apiKey) return { success: false, error: 'SendGrid apiKey credential missing' };
        const payload = {
            personalizations: [{ to: [{ email: options.to }] }],
            from: { email: fromEmail, name: fromName },
            subject: options.subject,
            content: [
                { type: 'text/html', value: options.html },
                ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
            ],
        };
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });
        if (response.ok) {
            const msgId = response.headers.get('x-message-id') ?? undefined;
            return { success: true, messageId: msgId };
        }
        const text = await response.text();
        return { success: false, error: `SendGrid error ${response.status}: ${text}` };
    }

    if (providerDoc.provider === 'custom') {
        const { webhookUrl } = creds;
        if (!webhookUrl)
            return { success: false, error: 'Custom email provider missing webhookUrl credential' };
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
                ...(options.meta ?? {}),
            }),
        });
        const text = await response.text();
        if (response.ok) return { success: true };
        return { success: false, error: `Custom email error ${response.status}: ${text}` };
    }

    return { success: false, error: `Unsupported email provider: ${providerDoc.provider}` };
}

/**
 * Returns the first enabled provider for the given channel.
 * Explicitly selects credentialsEncrypted because it is select:false.
 */
export async function getActiveProvider(
    channel: 'sms' | 'email',
): Promise<INotificationProvider | null> {
    return NotificationProvider.findOne({ type: channel, isEnabled: true })
        .select('+credentialsEncrypted')
        .lean<INotificationProvider>()
        .exec();
}

/**
 * Replace {placeholder} tokens in a template string with provided variable values.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match: string, key: string) => {
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
    });
}

/**
 * Resolves student contact info, active provider, and template;
 * renders and dispatches the message; then persists a NotificationDeliveryLog record.
 */
export async function sendNotificationToStudent(
    studentId: mongoose.Types.ObjectId | string,
    templateKey: string,
    channel: 'sms' | 'email',
    vars: Record<string, string>,
    jobId?: mongoose.Types.ObjectId | string,
): Promise<SendResult> {
    const studentOid =
        typeof studentId === 'string' ? new mongoose.Types.ObjectId(studentId) : studentId;

    const [user, profile] = await Promise.all([
        User.findById(studentOid).select('email phone_number full_name').lean(),
        StudentProfile.findOne({ user_id: studentOid })
            .select('email phone phone_number full_name')
            .lean(),
    ]);

    const p = (profile ?? {}) as Record<string, unknown>;
    const u = (user ?? {}) as Record<string, unknown>;
    const recipientEmail = (p.email ?? u.email ?? '') as string;
    const recipientPhone = (p.phone_number ?? p.phone ?? u.phone_number ?? '') as string;
    const recipientName = (p.full_name ?? u.full_name ?? '') as string;

    const to = channel === 'email' ? recipientEmail : recipientPhone;
    if (!to) {
        return {
            success: false,
            error: `Student ${studentOid} has no ${channel === 'email' ? 'email' : 'phone'} on record`,
        };
    }

    const template = await NotificationTemplate.findOne({
        key: templateKey.toUpperCase(),
        channel,
        isEnabled: true,
    }).lean();
    if (!template) {
        return {
            success: false,
            error: `Template '${templateKey}' not found for channel '${channel}'`,
        };
    }

    const provider = await getActiveProvider(channel);
    if (!provider) {
        return {
            success: false,
            error: `No active provider configured for channel '${channel}'`,
        };
    }

    const mergedVars: Record<string, string> = { student_name: recipientName, ...vars };
    const renderedBody = renderTemplate(template.body, mergedVars);
    const renderedSubject = template.subject
        ? renderTemplate(template.subject, mergedVars)
        : '';

    // Use htmlBody if available and format is html, otherwise fall back to plain body
    const tpl = template as Record<string, unknown>;
    const hasHtmlBody = tpl.bodyFormat === 'html' && typeof tpl.htmlBody === 'string' && (tpl.htmlBody as string).trim().length > 0;
    const renderedHtml = hasHtmlBody ? renderTemplate(tpl.htmlBody as string, mergedVars) : renderedBody;

    let result: SendResult;
    try {
        if (channel === 'sms') {
            result = await sendSMS({ to, body: renderedBody }, provider);
        } else {
            result = await sendEmail(
                { to, subject: renderedSubject, html: renderedHtml, text: renderedBody },
                provider,
            );
        }
    } catch (err: unknown) {
        result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    const resolvedJobId = jobId
        ? typeof jobId === 'string'
            ? new mongoose.Types.ObjectId(jobId)
            : jobId
        : new mongoose.Types.ObjectId();

    await NotificationDeliveryLog.create({
        jobId: resolvedJobId,
        studentId: studentOid,
        channel,
        providerUsed: provider.provider,
        to,
        status: result.success ? 'sent' : 'failed',
        providerMessageId: result.messageId,
        errorMessage: result.error,
        sentAtUTC: result.success ? new Date() : undefined,
    });

    return result;
}
