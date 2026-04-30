/**
 * seedTestUsers.ts
 * ----------------
 * Creates default test users with FIXED credentials for local development/testing.
 *
 * Super Admin:
 *   Email    : admin@campusway.com
 *   Password : Admin@123456
 *
 * Student:
 *   Email    : student@campusway.com
 *   Password : Student@123456
 *
 * Idempotent — skips if user already exists.
 * Run: cd backend && npx tsx src/seeds/seedTestUsers.ts
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db';
import User from '../models/User';

dotenv.config();

const TEST_USERS = [
    {
        full_name: 'Super Admin',
        username: 'campus_admin',
        email: 'admin@campusway.com',
        password: 'Admin@123456',
        role: 'superadmin' as const,
        status: 'active' as const,
        mustChangePassword: false,
        permissions: {
            canEditExams: true,
            canManageStudents: true,
            canViewReports: true,
            canDeleteData: true,
            canManageFinance: true,
            canManagePlans: true,
            canManageTickets: true,
            canManageBackups: true,
            canRevealPasswords: true,
        },
    },
    {
        full_name: 'Test Student',
        username: 'campus_test_user',
        email: 'student@campusway.com',
        password: 'Student@123456',
        role: 'student' as const,
        status: 'active' as const,
        mustChangePassword: false,
        subscription: {
            plan: 'demo',
            planCode: 'demo',
            planName: 'Demo Plan',
            isActive: true,
            startDate: new Date(),
            expiryDate: new Date(Date.now() + 365 * 86400000), // 1 year
            assignedAt: new Date(),
        },
    },
];

export async function seedTestUsers(): Promise<void> {
    console.log('[seed:test-users] Seeding test users...');

    for (const userData of TEST_USERS) {
        const existing = await User.findOne({ email: userData.email });
        if (existing) {
            console.log(`  ℹ️  ${userData.role} (${userData.email}) already exists — skipping.`);
            continue;
        }

        const { password: plainPassword, ...rest } = userData;
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        await User.create({
            ...rest,
            password: hashedPassword,
        });

        console.log(`  ✅ Created ${userData.role}: ${userData.email}`);
    }

    console.log('[seed:test-users] Done.');
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║         TEST USER CREDENTIALS                ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║  👑 Super Admin                              ║');
    console.log('║     Email    : admin@campusway.com           ║');
    console.log('║     Password : Admin@123456                  ║');
    console.log('║                                              ║');
    console.log('║  📘 Student                                  ║');
    console.log('║     Email    : student@campusway.com         ║');
    console.log('║     Password : Student@123456                ║');
    console.log('╚══════════════════════════════════════════════╝');
}

// Allow running standalone
if (require.main === module) {
    (async () => {
        await connectDB();
        await seedTestUsers();
    })()
        .catch((error) => {
            console.error('[seed:test-users] Failed:', error);
            process.exitCode = 1;
        })
        .finally(async () => {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        });
}
