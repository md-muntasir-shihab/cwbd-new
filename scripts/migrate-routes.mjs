/**
 * Route Migration Helper Script
 * 
 * Converts legacy authorize(roles...) middleware to requirePermission(module, action)
 * based on the permission matrix defined in backend/src/security/permissionsMatrix.ts
 * 
 * Usage:
 *   node scripts/migrate-routes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module mapping based on route paths
const MODULE_MAP = {
    '/site-settings': 'site_settings',
    '/home': 'home_control',
    '/banners': 'banner_manager',
    '/universities': 'universities',
    '/news': 'news',
    '/exams': 'exams',
    '/question-bank': 'question_bank',
    '/questions': 'question_bank',
    '/students': 'students_groups',
    '/student-groups': 'students_groups',
    '/groups': 'students_groups',
    '/subscription-plans': 'subscription_plans',
    '/subscriptions': 'subscription_plans',
    '/manual-payments': 'payments',
    '/payments': 'payments',
    '/finance': 'finance_center',
    '/resources': 'resources',
    '/support-center': 'support_center',
    '/support-tickets': 'support_center',
    '/contact-messages': 'support_center',
    '/notifications': 'notifications',
    '/campaigns': 'notifications',
    '/communication': 'notifications',
    '/reports': 'reports_analytics',
    '/security': 'security_logs',
    '/audit-logs': 'security_logs',
    '/team': 'team_access_control',
};

// Action inference from HTTP method and path
function inferAction(method, routePath) {
    const lower = routePath.toLowerCase();
    
    if (lower.includes('bulk')) return 'bulk';
    if (lower.includes('export')) return 'export';
    if (lower.includes('publish')) return 'publish';
    if (lower.includes('approve') || lower.includes('reject')) return 'approve';
    
    if (method === 'GET') return 'view';
    if (method === 'POST') return 'create';
    if (method === 'DELETE') return 'delete';
    if (method === 'PUT' || method === 'PATCH') return 'edit';
    
    return 'edit';
}

// Infer module from route path
function inferModule(routePath) {
    const lower = routePath.toLowerCase();
    
    for (const [pattern, module] of Object.entries(MODULE_MAP)) {
        if (lower.startsWith(pattern) || lower.includes(pattern)) {
            return module;
        }
    }
    
    return null;
}

// Parse a route line
function parseRouteLine(line) {
    const routeRegex = /router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"],?\s*(?:authorize\([^)]+\)[,\s]*)?([^)]+)\)/;
    const match = line.match(routeRegex);
    
    if (!match) return null;
    
    const [, method, path, middleware] = match;
    return { method: method.toUpperCase(), path, middleware, fullLine: line };
}

// Convert authorize() to requirePermission()
function convertRoute(route) {
    const module = inferModule(route.path);
    if (!module) {
        console.log(`⚠️  Cannot infer module for route: ${route.method} ${route.path}`);
        return null;
    }
    
    const action = inferAction(route.method, route.path);
    
    // Replace authorize(...roles) with requirePermission(module, action)
    let newLine = route.fullLine.replace(
        /authorize\([^)]+\)/,
        `requirePermission('${module}', '${action}')`
    );
    
    // Also remove legacy permission middleware like canEditExams, canViewReports, etc.
    newLine = newLine.replace(/,\s*can[A-Z][a-zA-Z]*(?=[,\)])/g, '');
    
    return {
        ...route,
        module,
        action,
        newLine,
    };
}

// Main migration function
function migrateRoutes(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const migrations = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Only process lines with authorize()
        if (!line.includes('authorize(')) continue;
        
        const route = parseRouteLine(line);
        if (!route) continue;
        
        const converted = convertRoute(route);
        if (!converted) continue;
        
        migrations.push({
            lineNumber: i + 1,
            original: route.fullLine.trim(),
            converted: converted.newLine.trim(),
            module: converted.module,
            action: converted.action,
        });
    }
    
    return migrations;
}

// Generate report
function generateReport(migrations) {
    console.log('\n' + '='.repeat(80));
    console.log('ROUTE MIGRATION ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\nTotal routes to migrate: ${migrations.length}\n`);
    
    // Group by module
    const byModule = migrations.reduce((acc, m) => {
        if (!acc[m.module]) acc[m.module] = [];
        acc[m.module].push(m);
        return acc;
    }, {});
    
    console.log('ROUTES BY MODULE:');
    Object.entries(byModule)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([module, routes]) => {
            console.log(`  ${module}: ${routes.length} routes`);
        });
    
    console.log('\n' + '='.repeat(80));
    console.log('SAMPLE CONVERSIONS (First 10):');
    console.log('='.repeat(80));
    
    migrations.slice(0, 10).forEach((m, idx) => {
        console.log(`\n${idx + 1}. Line ${m.lineNumber} | ${m.module}.${m.action}`);
        console.log(`   BEFORE: ${m.original}`);
        console.log(`   AFTER:  ${m.converted}`);
    });
    
    return byModule;
}

// Generate TypeScript replacement code
function generateReplacementCode(migrations, outputPath) {
    const replacements = migrations.map(m => ({
        old_str: m.original,
        new_str: m.converted,
    }));
    
    fs.writeFileSync(
        outputPath,
        JSON.stringify(replacements, null, 2),
        'utf-8'
    );
    
    console.log(`\n✅ Replacement code saved to: ${outputPath}`);
}

// Main execution
const adminRoutesPath = path.join(__dirname, '..', 'backend', 'src', 'routes', 'adminRoutes.ts');
const outputPath = path.join(__dirname, '..', 'session-files', 'route-migrations.json');

console.log('Starting route migration analysis...\n');
console.log(`Input file: ${adminRoutesPath}`);

const migrations = migrateRoutes(adminRoutesPath);
const byModule = generateReport(migrations);

// Save results
generateReplacementCode(migrations, outputPath);

console.log('\n' + '='.repeat(80));
console.log('NEXT STEPS:');
console.log('='.repeat(80));
console.log('1. Review the generated conversions in session-files/route-migrations.json');
console.log('2. Apply high-priority modules first (exams, payments, finance_center)');
console.log('3. Test each module after migration');
console.log('4. Update legacy permission middleware usage');
console.log('='.repeat(80) + '\n');

// Return summary for further processing
export default { migrations, byModule };
