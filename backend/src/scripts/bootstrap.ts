import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../config/db';
import User from '../models/User';

dotenv.config();

async function bootstrap() {
    console.log('🔧 CampusWay SuperAdmin Bootstrap');
    console.log('================================\n');

    await connectDB();

    // Check if a superadmin already exists
    const existing = await User.findOne({ role: 'superadmin' });
    if (existing) {
        console.log('⚠️  SuperAdmin already exists. Bootstrap aborted for security.');
        console.log('   If you need to create a new one, delete the existing superadmin first.');
        process.exit(0);
    }

    // Generate secure random credentials
    const username = `admin_${crypto.randomBytes(4).toString('hex')}`;
    const oneTimePassword = crypto.randomBytes(18).toString('base64');
    const hashedPassword = await bcrypt.hash(oneTimePassword, 12);

    // Create superadmin user
    const superadmin = await User.create({
        username,
        email: process.env.ADMIN_EMAIL || 'admin@campusway.example',
        password: hashedPassword,
        fullName: 'CampusWay SuperAdmin',
        role: 'superadmin',
        isActive: true,
        mustChangePassword: true,
    });

    console.log('✅ SuperAdmin created successfully!\n');

    // Generate initial access file
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const appDomain = String(process.env.APP_DOMAIN || process.env.FRONTEND_URL || 'http://localhost:5175').trim().replace(/\/$/, '');
    const adminUiPath = String(process.env.ADMIN_UI_PATH || '__cw_admin__').trim().replace(/^\/+/, '');

    const accessFileContent = `
CAMPUSWAY INITIAL ACCESS — ONE TIME
====================================
username: ${username}
email:    ${superadmin.email}
password: ${oneTimePassword}
created_at_utc: ${createdAt}
expires_at_utc: ${expiresAt}

HOW TO USE:
  1) Visit the admin portal.
  2) Login with the username/email & one-time password above.
  3) You will be required to set a new password and enable MFA.
  4) Immediately rotate this credential and confirm via audit log.

ADMIN PANEL URL: ${appDomain}/${adminUiPath}/login

⚠️  DELETE THIS FILE AFTER USE ⚠️
====================================
`;

    const filePath = path.join(__dirname, '..', '..', 'INITIAL_ADMIN_ACCESS.txt');
    fs.writeFileSync(filePath, accessFileContent, 'utf-8');

    console.log(`📄 Initial access file created: ${filePath}`);
    console.log('⚠️  IMPORTANT: Delete this file after first login!');
    console.log('⚠️  In production, encrypt this file with GPG before distributing.\n');

    await mongoose.disconnect();
    process.exit(0);
}

bootstrap().catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
