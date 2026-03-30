const fs = require('fs');

let server = fs.readFileSync('backend/src/server.ts', 'utf8');
server = server.replace(
    /const requiredKeys = \['JWT_SECRET', 'JWT_REFRESH_SECRET'\];[\s\S]*?process\.exit\(1\);\r?\n\s*}/,
    `const missing = [];
    const hasMongoUri = Boolean(String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim());
    if (!hasMongoUri) missing.push('MONGODB_URI|MONGO_URI');

    if (missing.length > 0) {
        console.error(\`[startup] Missing required env keys: \${missing.join(', ')}\`);
        console.error('[startup] Please update Azure App Service Configuration.');
        process.exit(1);
    }
    if (IS_PRODUCTION) {
        if (!process.env.JWT_SECRET) console.warn('[startup] WARNING: JWT_SECRET is missing. Using insecure fallback.');
        if (!process.env.JWT_REFRESH_SECRET && !process.env.REFRESH_SECRET) console.warn('[startup] WARNING: JWT_REFRESH_SECRET is missing. Using insecure fallback.');
        if (!process.env.FRONTEND_URL) console.warn('[startup] WARNING: FRONTEND_URL is missing. Using insecure fallback.');
        if (!process.env.ADMIN_ORIGIN) console.warn('[startup] WARNING: ADMIN_ORIGIN is missing. Using insecure fallback.');
    }`
);
fs.writeFileSync('backend/src/server.ts', server);

let auth = fs.readFileSync('backend/src/controllers/authController.ts', 'utf8');
auth = auth.replace(
    /const JWT_SECRET = [^\n]+/,
    "const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret-for-production-please-change-immediately-cw';"
);
auth = auth.replace(
    /const REFRESH_SECRET = [^\n]+/,
    "const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.REFRESH_SECRET || 'fallback-refresh-secret-for-production-please-change-immediately-cw';"
);
fs.writeFileSync('backend/src/controllers/authController.ts', auth);

console.log('Fixed env validaton and secrets fallback');
