import { Response } from 'express';

export type AdminLiveEventName =
    | 'attempt-connected'
    | 'attempt-updated'
    | 'violation'
    | 'warn-sent'
    | 'attempt-locked'
    | 'forced-submit'
    | 'autosave'
    | 'exam-metrics-updated'
    | 'approval-queue-updated'
    | 'result-publish-progress'
    | 'result-publish-complete'
    | 'ping';

const clients = new Set<Response>();

function writeEvent(res: Response, eventName: AdminLiveEventName, payload: Record<string, unknown>): void {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function addAdminLiveStreamClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    clients.add(res);
    writeEvent(res, 'attempt-connected', { connectedAt: new Date().toISOString() });

    const pingInterval = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(pingInterval);
            clients.delete(res);
            return;
        }
        writeEvent(res, 'ping', { ts: new Date().toISOString() });
    }, 20_000);

    res.on('close', () => {
        clearInterval(pingInterval);
        clients.delete(res);
    });
}

export function broadcastAdminLiveEvent(eventName: AdminLiveEventName, payload: Record<string, unknown>): number {
    let delivered = 0;
    for (const client of Array.from(clients)) {
        if (client.writableEnded) {
            clients.delete(client);
            continue;
        }
        writeEvent(client, eventName, {
            ...payload,
            timestamp: new Date().toISOString(),
        });
        delivered += 1;
    }
    return delivered;
}
