import { Response } from 'express';

export interface StudentDashboardEvent {
    type:
    | 'exam_updated'
    | 'notification_updated'
    | 'featured_university_updated'
    | 'profile_updated'
    | 'dashboard_config_updated'
    | 'subscription-updated';
    timestamp: string;
    meta?: Record<string, unknown>;
}

const clients = new Set<Response>();

function writeEvent(res: Response, event: StudentDashboardEvent): void {
    res.write('event: dashboard-update\n');
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function addStudentDashboardStreamClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    clients.add(res);
    writeEvent(res, {
        type: 'dashboard_config_updated',
        timestamp: new Date().toISOString(),
        meta: { heartbeat: true, message: 'connected' },
    });

    const heartbeat = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(heartbeat);
            clients.delete(res);
            return;
        }
        res.write('event: ping\n');
        res.write(`data: {"ts":"${new Date().toISOString()}"}\n\n`);
    }, 20000);

    res.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
}

export function broadcastStudentDashboardEvent(event: Omit<StudentDashboardEvent, 'timestamp'>): void {
    const payload: StudentDashboardEvent = {
        ...event,
        timestamp: new Date().toISOString(),
    };

    for (const client of clients) {
        if (client.writableEnded) {
            clients.delete(client);
            continue;
        }
        writeEvent(client, payload);
    }
}
