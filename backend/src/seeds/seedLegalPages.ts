import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import LegalPage from '../models/LegalPage';

dotenv.config();

const legalPages = [
    {
        slug: 'about',
        title: 'About CampusWay',
        htmlContent: `<h2>Welcome to CampusWay</h2>
<p>CampusWay is a comprehensive educational platform designed to empower students across Bangladesh. We provide tools for exam preparation, university admissions guidance, and academic resources — all in one place.</p>
<h3>Our Mission</h3>
<p>To make quality education accessible and affordable for every student, regardless of their location or background.</p>
<h3>What We Offer</h3>
<ul>
<li>Interactive exam preparation with real-time feedback</li>
<li>University admission guidance and resources</li>
<li>Curated study materials and question banks</li>
<li>Community-driven learning environment</li>
</ul>
<p>Join thousands of students who are already on their path to academic excellence with CampusWay.</p>`,
        metaTitle: 'About CampusWay - Your Academic Companion',
        metaDescription: 'Learn about CampusWay, the comprehensive educational platform empowering students across Bangladesh with exam preparation, university guidance, and academic resources.',
    },
    {
        slug: 'terms',
        title: 'Terms of Service',
        htmlContent: `<h2>Terms of Service</h2>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
<p>By accessing and using CampusWay, you agree to be bound by these Terms of Service.</p>
<h3>1. Acceptance of Terms</h3>
<p>By creating an account or using our services, you acknowledge that you have read, understood, and agree to these terms.</p>
<h3>2. User Accounts</h3>
<p>You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information during registration.</p>
<h3>3. Acceptable Use</h3>
<p>You agree not to misuse the platform, including but not limited to: sharing exam content without authorization, attempting to access other users' accounts, or disrupting platform services.</p>
<h3>4. Intellectual Property</h3>
<p>All content on CampusWay, including questions, study materials, and platform design, is protected by intellectual property laws. Unauthorized reproduction is prohibited.</p>
<h3>5. Limitation of Liability</h3>
<p>CampusWay provides educational resources on an "as-is" basis. We do not guarantee specific academic outcomes.</p>
<h3>6. Changes to Terms</h3>
<p>We reserve the right to modify these terms at any time. Continued use of the platform constitutes acceptance of updated terms.</p>`,
        metaTitle: 'Terms of Service - CampusWay',
        metaDescription: 'Read the Terms of Service for CampusWay. Understand your rights and responsibilities when using our educational platform.',
    },
    {
        slug: 'privacy',
        title: 'Privacy Policy',
        htmlContent: `<h2>Privacy Policy</h2>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
<p>CampusWay is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.</p>
<h3>1. Information We Collect</h3>
<p>We collect information you provide during registration (name, email, phone number) and usage data (exam attempts, study progress).</p>
<h3>2. How We Use Your Information</h3>
<ul>
<li>To provide and improve our educational services</li>
<li>To personalize your learning experience</li>
<li>To communicate important updates and notifications</li>
<li>To ensure platform security and prevent fraud</li>
</ul>
<h3>3. Data Security</h3>
<p>We implement industry-standard security measures to protect your personal information from unauthorized access or disclosure.</p>
<h3>4. Third-Party Sharing</h3>
<p>We do not sell your personal information. We may share data with service providers who assist in platform operations, subject to confidentiality agreements.</p>
<h3>5. Your Rights</h3>
<p>You may request access to, correction of, or deletion of your personal data by contacting our support team.</p>
<h3>6. Contact Us</h3>
<p>For privacy-related inquiries, please contact us through the platform's support channels.</p>`,
        metaTitle: 'Privacy Policy - CampusWay',
        metaDescription: 'Read the CampusWay Privacy Policy. Learn how we collect, use, and protect your personal information on our educational platform.',
    },
];

export async function seedLegalPages(): Promise<void> {
    console.log('[seed:legal-pages] Seeding legal pages...');

    for (const page of legalPages) {
        const existing = await LegalPage.findOne({ slug: page.slug }).lean();
        if (existing) {
            console.log(`[seed:legal-pages] Skipped (already exists): ${page.slug}`);
            continue;
        }
        await LegalPage.create(page);
        console.log(`[seed:legal-pages] Created: ${page.slug}`);
    }

    console.log('[seed:legal-pages] Done.');
}

// Allow running standalone
if (require.main === module) {
    (async () => {
        await connectDB();
        await seedLegalPages();
    })()
        .catch((error) => {
            console.error('[seed:legal-pages] Failed:', error);
            process.exitCode = 1;
        })
        .finally(async () => {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        });
}
