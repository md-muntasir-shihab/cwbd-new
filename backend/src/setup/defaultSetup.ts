/**
 * defaultSetup.ts
 * ---------------
 * Runs ONCE on first server boot (when ALLOW_DEFAULT_SETUP=true in .env).
 * Creates:
 *   1. Super Admin account
 *   2. Test Student account (with 7-day subscription)
 *   3. Demo Exam (30 min, 5 sample questions)
 *   4. INITIAL_ACCESS_INFO.txt in project root (outside public/)
 *
 * Idempotent — checks for existence before creating anything.
 * The text file is written only once; subsequent runs are no-ops.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Exam from '../models/Exam';
import Question from '../models/Question';

const INFO_FILE = path.resolve(process.cwd(), 'INITIAL_ACCESS_INFO.txt');
const ADMIN_PANEL_PATH = String(process.env.ADMIN_UI_PATH || '__cw_admin__').trim().replace(/^\/+/, '');

/* ── Random password: 16 chars, letters + numbers + symbols ── */
function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    return Array.from({ length: 16 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
}

export async function runDefaultSetup(): Promise<void> {
    if (process.env.ALLOW_DEFAULT_SETUP !== 'true') {
        console.log('⚙️  Default setup skipped (ALLOW_DEFAULT_SETUP != true)');
        return;
    }

    // Already ran — don't touch anything
    if (fs.existsSync(INFO_FILE)) {
        console.log('ℹ️  INITIAL_ACCESS_INFO.txt exists — default setup already completed.');
        return;
    }

    console.log('🚀 Running first-boot default setup...');

    /* ──────────────────────────────────────────
     1. SUPER ADMIN
    ────────────────────────────────────────── */
    let adminPassword = '';
    let adminUsername = 'campus_admin';

    const existingAdmin = await User.findOne({ role: 'superadmin' });
    if (!existingAdmin) {
        adminPassword = generatePassword();
        const hashed = await bcrypt.hash(adminPassword, 12);
        await User.create({
            username: adminUsername,
            full_name: 'Super Admin',
            email: 'admin@campusway.com',
            password: hashed,
            role: 'superadmin',
            status: 'active',
            mustChangePassword: true,
        });
        console.log(`  ✅ Super admin created: ${adminUsername}`);
    } else {
        adminUsername = existingAdmin.username;
        adminPassword = '(already set — see existing hash)';
        console.log('  ℹ️  Super admin already exists, skipping creation.');
    }

    /* ──────────────────────────────────────────
     2. TEST STUDENT
    ────────────────────────────────────────── */
    let studentPassword = '';
    const studentUsername = 'campus_test_user';

    const existingStudent = await User.findOne({ username: studentUsername });
    if (!existingStudent) {
        studentPassword = generatePassword();
        const hashed = await bcrypt.hash(studentPassword, 12);
        const subscriptionEnd = new Date(Date.now() + 7 * 86400000); // 7 days
        await User.create({
            username: studentUsername,
            full_name: 'Test Student',
            email: 'testuser@campusway.local',
            password: hashed,
            role: 'student',
            status: 'active',
            mustChangePassword: false,
            subscription: {
                plan: 'demo',
                planCode: 'demo',
                planName: 'Demo Plan',
                isActive: true,
                startDate: new Date(),
                expiryDate: subscriptionEnd,
                assignedAt: new Date(),
            },
        });
        console.log(`  ✅ Test student created: ${studentUsername}`);
    } else {
        studentPassword = '(already set)';
        console.log('  ℹ️  Test student already exists, skipping creation.');
    }

    /* ──────────────────────────────────────────
     3. DEMO EXAM
    ────────────────────────────────────────── */
    let demoExamName = 'Demo Admission Test';
    const existingExam = await Exam.findOne({ title: demoExamName });

    if (!existingExam) {
        const now = new Date();
        const examStart = new Date(now.getTime());
        const examEnd = new Date(now.getTime() + 30 * 86400000); // open for 30 days
        const resultAt = new Date(now.getTime() + 30 * 86400000 + 3600000);

        const exam = await Exam.create({
            title: demoExamName,
            subject: 'General',
            description: 'A short demo exam to verify the system. Contains 5 sample questions.',
            totalQuestions: 5,
            totalMarks: 5,
            duration: 30,
            negativeMarking: false,
            negativeMarkValue: 0,
            startDate: examStart,
            endDate: examEnd,
            resultPublishDate: resultAt,
            isPublished: true,
            accessMode: 'all',
            attemptLimit: 1,
            randomizeQuestions: false,
            randomizeOptions: false,
            allowBackNavigation: true,
            showQuestionPalette: true,
            showRemainingTime: true,
            autoSubmitOnTimeout: true,
            allowPause: false,
        });

        // 5 sample questions
        const sampleQs = [
            { question: 'What is the capital city of Bangladesh?', optionA: 'Chittagong', optionB: 'Dhaka', optionC: 'Rajshahi', optionD: 'Khulna', correctAnswer: 'B' as const, explanation: 'Dhaka is the capital and largest city of Bangladesh.', marks: 1, subject: 'GK', difficulty: 'easy' as const, order: 1 },
            { question: 'In which year was Bangladesh liberated?', optionA: '1947', optionB: '1952', optionC: '1969', optionD: '1971', correctAnswer: 'D' as const, explanation: 'Bangladesh gained independence on December 16, 1971.', marks: 1, subject: 'GK', difficulty: 'easy' as const, order: 2 },
            { question: 'Which river is known as the "Padma" in Bangladesh?', optionA: 'Brahmaputra', optionB: 'Meghna', optionC: 'Ganges', optionD: 'Surma', correctAnswer: 'C' as const, explanation: 'The Ganges is called Padma after it enters Bangladesh.', marks: 1, subject: 'GK', difficulty: 'easy' as const, order: 3 },
            { question: 'What is 25% of 400?', optionA: '50', optionB: '75', optionC: '100', optionD: '125', correctAnswer: 'C' as const, explanation: '25% of 400 = (25/100) × 400 = 100.', marks: 1, subject: 'Math', difficulty: 'easy' as const, order: 4 },
            { question: 'Who wrote the national anthem of Bangladesh?', optionA: 'Kazi Nazrul Islam', optionB: 'Rabindranath Tagore', optionC: 'Jasimuddin', optionD: 'Shamsur Rahman', correctAnswer: 'B' as const, explanation: '"Amar Shonar Bangla" was written by Rabindranath Tagore.', marks: 1, subject: 'GK', difficulty: 'easy' as const, order: 5 },
        ];

        for (const q of sampleQs) {
            await Question.create({ ...q, exam: exam._id });
        }

        console.log(`  ✅ Demo exam created with 5 questions (ID: ${exam._id})`);
    } else {
        console.log('  ℹ️  Demo exam already exists, skipping creation.');
    }

    /* ──────────────────────────────────────────
     4. WRITE INITIAL_ACCESS_INFO.txt
    ────────────────────────────────────────── */
    const domain = String(process.env.APP_DOMAIN || process.env.FRONTEND_URL || 'http://localhost:5175').trim().replace(/\/$/, '');
    const content = `
====================================================
  CAMPUSWAY — INITIAL ACCESS INFORMATION
  Generated: ${new Date().toISOString()}
====================================================

⚠️  KEEP THIS FILE PRIVATE. DO NOT COMMIT TO GIT.
    Delete or move this file after completing setup.

----------------------------------------------------
🌐  ADMIN PANEL URL
----------------------------------------------------
  ${domain}/${ADMIN_PANEL_PATH}

----------------------------------------------------
👑  SUPER ADMIN LOGIN
----------------------------------------------------
  Email    : admin@campusway.com
  Password : ${adminPassword.includes('already') ? '(unchanged — use existing credentials)' : adminPassword}
  Role     : superadmin
  Note     : You will be required to change your
             password on first login.

----------------------------------------------------
📘  TEST STUDENT LOGIN
----------------------------------------------------
  Login URL        : ${domain}/login
  Username         : ${studentUsername}
  Password         : ${studentPassword.includes('already') ? '(unchanged — use existing credentials)' : studentPassword}
  Role             : student
  Subscription     : Demo (expires in 7 days)

----------------------------------------------------
🧪  DEMO EXAM
----------------------------------------------------
  Exam Name    : Demo Admission Test
  Duration     : 30 minutes
  Questions    : 5 (General Knowledge & Math)
  Attempt Limit: 1

----------------------------------------------------
🔒  SECURITY CHECKLIST
----------------------------------------------------
  [ ] Change admin password immediately after login
  [ ] Delete or deactivate test student after testing
  [ ] Remove or secure this file from server
  [ ] Set ALLOW_DEFAULT_SETUP=false in production .env
  [ ] This file is NOT accessible via browser URL

====================================================
`;

    fs.writeFileSync(INFO_FILE, content.trimStart(), 'utf8');
    console.log(`  ✅ INITIAL_ACCESS_INFO.txt written to: ${INFO_FILE}`);
    console.log('🎉 First-boot setup complete!');
}
