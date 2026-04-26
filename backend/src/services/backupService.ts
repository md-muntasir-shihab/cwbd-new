import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import mongoose from 'mongoose';
import BackupJob, { BackupType } from '../models/BackupJob';
import AnnouncementNotice from '../models/AnnouncementNotice';
import ExpenseEntry from '../models/ExpenseEntry';
import ManualPayment from '../models/ManualPayment';
import StaffPayout from '../models/StaffPayout';
import StudentDueLedger from '../models/StudentDueLedger';
import SubscriptionPlan from '../models/SubscriptionPlan';
import SupportTicket from '../models/SupportTicket';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';

/* ── Types ── */

export interface BackupConfig {
    retention: { daily: number; weekly: number; monthly: number };
    schedule: string; // cron expression
}

export interface BackupResult {
    type: 'full' | 'incremental';
    collections: number;
    documents: number;
    sizeBytes: number;
    checksum: string;
    verified: boolean;
}

export interface BackupRecord {
    id: string;
    filePath: string;
    createdAt: Date;
    sizeBytes: number;
    type: BackupType;
}

/* ── Defaults ── */

const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), 'backup-snapshots');

const DEFAULT_CONFIG: BackupConfig = {
    retention: { daily: 7, weekly: 4, monthly: 3 },
    schedule: '0 2 * * *', // 2 AM daily
};

/* ── Helpers ── */

function getBackupDir(): string {
    return process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : DEFAULT_BACKUP_DIR;
}

function safeBaseName(input: string): string {
    return input.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function computeChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export function getBackupConfig(): BackupConfig {
    const daily = parseInt(process.env.BACKUP_RETENTION_DAILY || '', 10);
    const weekly = parseInt(process.env.BACKUP_RETENTION_WEEKLY || '', 10);
    const monthly = parseInt(process.env.BACKUP_RETENTION_MONTHLY || '', 10);
    return {
        retention: {
            daily: Number.isFinite(daily) && daily > 0 ? daily : DEFAULT_CONFIG.retention.daily,
            weekly: Number.isFinite(weekly) && weekly > 0 ? weekly : DEFAULT_CONFIG.retention.weekly,
            monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : DEFAULT_CONFIG.retention.monthly,
        },
        schedule: process.env.BACKUP_CRON_SCHEDULE || DEFAULT_CONFIG.schedule,
    };
}


/* ── Snapshot Builder ── */

async function buildBackupSnapshot(type: BackupType) {
    const now = new Date();
    const [users, profiles, plans, payments, expenses, payouts, dues, tickets, notices] =
        await Promise.all([
            User.find().lean(),
            StudentProfile.find().lean(),
            SubscriptionPlan.find().lean(),
            ManualPayment.find().lean(),
            ExpenseEntry.find().lean(),
            StaffPayout.find().lean(),
            StudentDueLedger.find().lean(),
            SupportTicket.find().lean(),
            AnnouncementNotice.find().lean(),
        ]);

    return {
        metadata: {
            generatedAt: now.toISOString(),
            type,
            mongoDatabase: mongoose.connection.name,
            collectionCounts: {
                users: users.length,
                studentProfiles: profiles.length,
                subscriptionPlans: plans.length,
                manualPayments: payments.length,
                expenses: expenses.length,
                staffPayouts: payouts.length,
                dueLedgers: dues.length,
                supportTickets: tickets.length,
                notices: notices.length,
            },
        },
        data: {
            users,
            studentProfiles: profiles,
            subscriptionPlans: plans,
            manualPayments: payments,
            expenses,
            staffPayouts: payouts,
            dueLedgers: dues,
            supportTickets: tickets,
            notices,
        },
    };
}

/* ── Integrity Verification ── */

export function verifyBackupIntegrity(
    serialized: string,
    snapshot: { metadata: { collectionCounts: Record<string, number> }; data: Record<string, unknown[]> },
): { verified: boolean; sizeBytes: number; documents: number; collections: number; errors: string[] } {
    const errors: string[] = [];
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    if (sizeBytes === 0) {
        errors.push('Backup file is empty (0 bytes)');
    }

    const counts = snapshot.metadata.collectionCounts;
    const data = snapshot.data;
    let totalDocuments = 0;
    let totalCollections = 0;

    for (const [key, expectedCount] of Object.entries(counts)) {
        totalCollections++;
        totalDocuments += expectedCount;
        const actualArray = data[key];
        if (!Array.isArray(actualArray)) {
            errors.push(`Collection "${key}" missing from data`);
        } else if (actualArray.length !== expectedCount) {
            errors.push(`Collection "${key}": expected ${expectedCount} docs, got ${actualArray.length}`);
        }
    }

    return {
        verified: errors.length === 0,
        sizeBytes,
        documents: totalDocuments,
        collections: totalCollections,
        errors,
    };
}

/* ── Core Backup Execution ── */

export async function runBackup(type: BackupType = 'full'): Promise<BackupResult> {
    const backupDir = getBackupDir();
    await fs.mkdir(backupDir, { recursive: true });

    let snapshot;
    let serialized: string;
    let digest: string;
    let filePath: string;

    try {
        snapshot = await buildBackupSnapshot(type);
        serialized = JSON.stringify(snapshot);
        digest = computeChecksum(serialized);
        const fileName = safeBaseName(`campusway-backup-${type}-${Date.now()}.json`);
        filePath = path.join(backupDir, fileName);

        await fs.writeFile(filePath, serialized, 'utf8');
    } catch (writeError) {
        // Check for disk space errors (Bug 1.32)
        const errCode = (writeError as NodeJS.ErrnoException).code;
        const errMsg = writeError instanceof Error ? writeError.message : String(writeError);
        const isDiskSpaceError = errCode === 'ENOSPC' || errCode === 'ENOMEM' || errMsg.includes('ENOSPC') || errMsg.includes('ENOMEM');

        if (isDiskSpaceError) {
            console.error(`[BACKUP] CRITICAL: Backup failed due to insufficient disk space — ${errMsg}`);
            console.error(JSON.stringify({ event: 'backup_failure', reason: 'disk_space', severity: 'P0', error: errMsg }));
            // Skip retention cleanup on failure — do not delete older backups
        } else {
            console.error(`[BACKUP] Backup write failed: ${errMsg}`);
        }

        throw writeError;
    }

    // Integrity verification
    const integrity = verifyBackupIntegrity(serialized, snapshot);

    if (!integrity.verified) {
        console.error('[BACKUP] Integrity verification failed:', integrity.errors);
    } else {
        console.log(
            `[BACKUP] Verified: ${integrity.collections} collections, ${integrity.documents} documents, ${integrity.sizeBytes} bytes`,
        );
    }

    // Record in DB (use a system ObjectId for automated backups)
    const systemId = new mongoose.Types.ObjectId('000000000000000000000000');
    await BackupJob.create({
        type,
        storage: 'local',
        status: integrity.verified ? 'completed' : 'failed',
        localPath: filePath,
        checksum: digest,
        requestedBy: systemId,
        restoreMeta: {
            generatedAt: snapshot.metadata.generatedAt,
            collectionCounts: snapshot.metadata.collectionCounts,
            integrityErrors: integrity.errors.length > 0 ? integrity.errors : undefined,
        },
        error: integrity.verified ? '' : integrity.errors.join('; '),
    });

    return {
        type,
        collections: integrity.collections,
        documents: integrity.documents,
        sizeBytes: integrity.sizeBytes,
        checksum: digest,
        verified: integrity.verified,
    };
}


/* ── Retention Policy ── */

/**
 * Determines which backups to keep and which to delete based on the retention policy.
 * Keeps the N most recent daily backups, M most recent weekly (one per ISO week), and
 * K most recent monthly (one per calendar month). All others are marked for deletion.
 *
 * Exported for property-based testing.
 */
export function applyRetentionPolicy(
    records: BackupRecord[],
    retention: { daily: number; weekly: number; monthly: number },
): { keep: BackupRecord[]; remove: BackupRecord[] } {
    if (records.length === 0) return { keep: [], remove: [] };

    // Sort newest first
    const sorted = [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const keepSet = new Set<string>();

    // Daily: keep the N most recent
    for (let i = 0; i < Math.min(retention.daily, sorted.length); i++) {
        keepSet.add(sorted[i].id);
    }

    // Weekly: keep the most recent backup per ISO week, up to M weeks
    const weeklyBuckets = new Map<string, BackupRecord>();
    for (const rec of sorted) {
        const d = rec.createdAt;
        const weekKey = `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
        if (!weeklyBuckets.has(weekKey)) {
            weeklyBuckets.set(weekKey, rec);
        }
    }
    const weeklyKeep = Array.from(weeklyBuckets.values()).slice(0, retention.weekly);
    for (const rec of weeklyKeep) {
        keepSet.add(rec.id);
    }

    // Monthly: keep the most recent backup per calendar month, up to K months
    const monthlyBuckets = new Map<string, BackupRecord>();
    for (const rec of sorted) {
        const monthKey = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyBuckets.has(monthKey)) {
            monthlyBuckets.set(monthKey, rec);
        }
    }
    const monthlyKeep = Array.from(monthlyBuckets.values()).slice(0, retention.monthly);
    for (const rec of monthlyKeep) {
        keepSet.add(rec.id);
    }

    const keep = sorted.filter((r) => keepSet.has(r.id));
    const remove = sorted.filter((r) => !keepSet.has(r.id));

    return { keep, remove };
}

/** ISO week number (1-53) */
function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** ISO week-numbering year */
function getISOWeekYear(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return d.getUTCFullYear();
}

/**
 * Enforces the retention policy by deleting old backup files and their DB records.
 */
export async function enforceRetentionPolicy(): Promise<{ kept: number; removed: number }> {
    const config = getBackupConfig();
    const backupDir = getBackupDir();

    // Gather completed backup records from DB
    const jobs = await BackupJob.find({ status: 'completed', localPath: { $ne: '' } })
        .sort({ createdAt: -1 })
        .lean();

    const records: BackupRecord[] = jobs.map((j) => ({
        id: String(j._id),
        filePath: j.localPath || '',
        createdAt: j.createdAt,
        sizeBytes: 0,
        type: j.type as BackupType,
    }));

    const { keep, remove } = applyRetentionPolicy(records, config.retention);

    // Delete files and DB records for removed backups
    for (const rec of remove) {
        try {
            const absPath = path.resolve(rec.filePath);
            await fs.unlink(absPath);
        } catch (err) {
            // File may already be gone — that's fine
            console.warn(`[BACKUP] Could not delete file ${rec.filePath}:`, (err as Error).message);
        }
        await BackupJob.findByIdAndDelete(rec.id);
    }

    if (remove.length > 0) {
        console.log(`[BACKUP] Retention cleanup: kept ${keep.length}, removed ${remove.length}`);
    }

    return { kept: keep.length, removed: remove.length };
}
