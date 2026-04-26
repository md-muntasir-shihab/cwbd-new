import { Request, Response } from 'express';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import StudentImportJob from '../models/StudentImportJob';
import SubscriptionPlan from '../models/SubscriptionPlan';
import { broadcastUserEvent } from '../realtime/userStream';
import { ResponseBuilder } from '../utils/responseBuilder';

const TARGET_FIELDS = [
    'full_name',
    'email',
    'phone_number',
    'institution_name',
    'roll_number',
    'registration_id',
    'hsc_batch',
    'ssc_batch',
    'gender',
    'department',
    'guardian_name',
    'guardian_phone',
    'password',
    'planCode'
] as const;

const TEMPLATE_HEADERS = [
    'full_name',
    'email',
    'phone_number',
    'institution_name',
    'roll_number',
    'registration_id',
    'hsc_batch',
    'ssc_batch',
    'gender',
    'department',
    'guardian_name',
    'guardian_phone',
    'password',
    'planCode'
];

type TargetField = typeof TARGET_FIELDS[number];

type ValidationResult = {
    normalizedRows: Record<string, unknown>[];
    failedRows: Array<{ rowNumber: number; reason: string; payload?: Record<string, unknown> }>;
};

function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeValue(rawRow: Record<string, unknown>, mapping: Record<string, string>, defaults: Record<string, unknown>, field: TargetField): unknown {
    const mappedHeader = mapping[field];
    if (mappedHeader && rawRow[mappedHeader] !== undefined && rawRow[mappedHeader] !== null && rawRow[mappedHeader] !== '') {
        return rawRow[mappedHeader];
    }
    if (defaults[field] !== undefined) return defaults[field];
    if (rawRow[field] !== undefined) return rawRow[field];
    return '';
}

function validateAndNormalizeRows(
    rows: Record<string, unknown>[],
    mapping: Record<string, string>,
    defaults: Record<string, unknown>,
): ValidationResult {
    const normalizedRows: Record<string, unknown>[] = [];
    const failedRows: Array<{ rowNumber: number; reason: string; payload?: Record<string, unknown> }> = [];
    const emailSeen = new Set<string>();

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const full_name = String(normalizeValue(row, mapping, defaults, 'full_name') || '').trim();
        const email = String(normalizeValue(row, mapping, defaults, 'email') || '').trim().toLowerCase();
        const phone_number = String(normalizeValue(row, mapping, defaults, 'phone_number') || '').trim();
        const institution_name = String(normalizeValue(row, mapping, defaults, 'institution_name') || '').trim();
        const roll_number = String(normalizeValue(row, mapping, defaults, 'roll_number') || '').trim();
        const registration_id = String(normalizeValue(row, mapping, defaults, 'registration_id') || '').trim();

        if (!full_name) {
            failedRows.push({ rowNumber, reason: 'Full Name is required.', payload: row });
            return;
        }

        if (email && !looksLikeEmail(email)) {
            failedRows.push({ rowNumber, reason: 'Invalid email format.', payload: row });
            return;
        }

        // Bug 1.3 fix: Detect intra-file duplicate emails
        if (email) {
            if (emailSeen.has(email)) {
                failedRows.push({ rowNumber, reason: `Duplicate email within import file (row ${rowNumber})`, payload: row });
                return;
            }
            emailSeen.add(email);
        }

        normalizedRows.push({
            full_name,
            email,
            phone_number,
            institution_name,
            roll_number,
            registration_id,
            hsc_batch: String(normalizeValue(row, mapping, defaults, 'hsc_batch') || '').trim(),
            ssc_batch: String(normalizeValue(row, mapping, defaults, 'ssc_batch') || '').trim(),
            gender: String(normalizeValue(row, mapping, defaults, 'gender') || '').trim().toLowerCase(),
            department: String(normalizeValue(row, mapping, defaults, 'department') || '').trim().toLowerCase(),
            guardian_name: String(normalizeValue(row, mapping, defaults, 'guardian_name') || '').trim(),
            guardian_phone: String(normalizeValue(row, mapping, defaults, 'guardian_phone') || '').trim(),
            password: String(normalizeValue(row, mapping, defaults, 'password') || '').trim(),
            planCode: String(normalizeValue(row, mapping, defaults, 'planCode') || '').trim(),
        });
    });

    return { normalizedRows, failedRows };
}

export const adminInitStudentImport = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'No file uploaded.', { status: 'error' }));
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });

        if (rows.length === 0) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'The uploaded file is empty.', { status: 'error' }));
        }

        const headers = Object.keys(rows[0]);
        const sampleRows = rows.slice(0, 5);

        const job = await StudentImportJob.create({
            status: 'initialized',
            sourceFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            headers,
            sampleRows,
            rawRows: rows,
            createdBy: (req as any).user?._id,
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            id: job._id,
            headers,
            sampleRows,
            targetFields: TARGET_FIELDS,
        }));
    } catch (error: any) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error.message));
    }
};

export const adminValidateStudentImport = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { mapping, defaults } = req.body;

        const job = await StudentImportJob.findById(id);
        if (!job) {
            return ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.'));
        }

        const { normalizedRows, failedRows } = validateAndNormalizeRows(job.rawRows as any[], mapping, defaults);

        job.status = 'validated';
        job.mapping = mapping;
        job.defaults = defaults;
        job.normalizedRows = normalizedRows;
        job.failedRows = failedRows as any;
        job.validationSummary = {
            totalRows: job.rawRows.length,
            validRows: normalizedRows.length,
            invalidRows: failedRows.length,
        };

        await job.save();

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            id: job._id,
            validationSummary: job.validationSummary,
            failedRows: job.failedRows.slice(0, 10), // Limit UI noise
        }));
    } catch (error: any) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error.message));
    }
};

export const adminCommitStudentImport = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const job = await StudentImportJob.findById(id);
        if (!job || job.status !== 'validated') {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Job must be validated before commit.', { status: 'error' }));
        }

        let inserted = 0;
        let updated = 0;
        let failed = 0;
        const commitErrors: any[] = [];

        for (const row of job.normalizedRows as any[]) {
            try {
                // Find existing user by email or phone
                let user = await User.findOne({
                    $or: [
                        { email: row.email },
                        { phone_number: row.phone_number }
                    ].filter(q => q.email || q.phone_number)
                });

                if (user) {
                    // Update user
                    user.full_name = row.full_name || user.full_name;
                    if (row.password) {
                        user.password = await bcrypt.hash(row.password, 10);
                    }

                    if (row.planCode) {
                        const plan = await SubscriptionPlan.findOne({ code: row.planCode });
                        if (plan) {
                            user.subscription = {
                                planCode: plan.code,
                                planName: plan.name,
                                isActive: true,
                                startDate: new Date(),
                                expiryDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
                                assignedAt: new Date(),
                                assignedBy: job.createdBy as any
                            };
                        }
                    }

                    await user.save();

                    // Update profile
                    await StudentProfile.findOneAndUpdate(
                        { user_id: user._id },
                        {
                            $set: {
                                full_name: row.full_name,
                                institution_name: row.institution_name,
                                roll_number: row.roll_number,
                                registration_id: row.registration_id,
                                hsc_batch: row.hsc_batch,
                                ssc_batch: row.ssc_batch,
                                gender: row.gender,
                                department: row.department,
                                guardian_name: row.guardian_name,
                                guardian_phone: row.guardian_phone,
                                email: row.email,
                                phone_number: row.phone_number
                            }
                        }
                    );
                    updated++;
                } else {
                    // Create new user
                    const password = row.password || crypto.randomBytes(8).toString('hex');
                    const hashedPassword = await bcrypt.hash(password, 10);
                    const username = row.email?.split('@')[0] || `student_${Date.now()}`;

                    user = await User.create({
                        full_name: row.full_name,
                        email: row.email || `${username}@campusway.com`,
                        phone_number: row.phone_number,
                        password: hashedPassword,
                        username: username + '_' + Math.floor(Math.random() * 1000),
                        role: 'student',
                        status: 'active',
                    });

                    if (row.planCode) {
                        const plan = await SubscriptionPlan.findOne({ code: row.planCode });
                        if (plan) {
                            user.subscription = {
                                planCode: plan.code,
                                planName: plan.name,
                                isActive: true,
                                startDate: new Date(),
                                expiryDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
                                assignedAt: new Date(),
                                assignedBy: job.createdBy as any
                            };
                            await user.save();
                        }
                    }

                    await StudentProfile.create({
                        user_id: user._id,
                        full_name: row.full_name,
                        email: user.email,
                        phone_number: user.phone_number,
                        institution_name: row.institution_name,
                        roll_number: row.roll_number,
                        registration_id: row.registration_id,
                        hsc_batch: row.hsc_batch,
                        ssc_batch: row.ssc_batch,
                        gender: row.gender,
                        department: row.department,
                        guardian_name: row.guardian_name,
                        guardian_phone: row.guardian_phone,
                    });
                    inserted++;
                }
            } catch (err: any) {
                failed++;
                commitErrors.push({ reason: err.message, payload: row });
            }
        }

        job.status = 'committed';
        job.commitSummary = { inserted, updated, failed };
        job.failedRows = [...job.failedRows, ...commitErrors];
        await job.save();

        broadcastUserEvent({
            type: 'students_imported',
            meta: { jobId: job._id, summary: job.commitSummary }
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            summary: job.commitSummary,
        }));
    } catch (error: any) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error.message));
    }
};

export const adminDownloadStudentTemplate = async (req: Request, res: Response) => {
    try {
        const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.xlsx');
        res.send(buffer);
    } catch (error: any) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error.message));
    }
};

export const adminGetStudentImportJob = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const job = await StudentImportJob.findById(id);
        if (!job) {
            return ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Import job not found.'));
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ status: 'success', data: job }));
    } catch (error: any) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error.message));
    }
};
