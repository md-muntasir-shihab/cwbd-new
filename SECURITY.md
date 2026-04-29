# 🔒 Security Policy

## Reporting a Vulnerability

> **Please do NOT open a public issue for security vulnerabilities.**

Contact the repository owner directly via GitHub. Include: description, steps to reproduce, potential impact. We will acknowledge within **48 hours**.

## Security Architecture

### Authentication
| Layer | Implementation |
|-------|---------------|
| **Access Tokens** | JWT with 15-minute expiry |
| **Refresh Tokens** | Separate JWT with 7-day expiry, rotation on use |
| **2FA** | Email, SMS, and authenticator app support |
| **Sessions** | Server-side tracking with device fingerprinting |

### API Protection
| Measure | Details |
|---------|---------|
| **Rate Limiting** | 100 req/min per user; 20 req/15min on auth |
| **CSRF** | Double-submit cookie pattern |
| **Input Validation** | Zod schemas on every request body |
| **Sanitization** | express-mongo-sanitize prevents NoSQL injection |
| **Headers** | Helmet.js with strict CSP, HSTS, X-Frame-Options |
| **CORS** | Allowlisted origins only |

### Access Control
| Feature | Implementation |
|---------|---------------|
| **RBAC** | `authenticate → requirePermission` middleware chain |
| **Admin IP Allowlist** | Admin panel restricted by IP |
| **Examiner Isolation** | Examiners access only their own resources |
| **Group-Based Access** | Exam access via student group membership |

### Exam Integrity
| Feature | Implementation |
|---------|---------------|
| **Tab Switch Detection** | Page Visibility API |
| **Fullscreen Enforcement** | Request + exit detection |
| **Copy/Paste Prevention** | Clipboard event interception |
| **Device Fingerprinting** | Canvas + WebGL + navigator |
| **Violation Logging** | Server-side log with auto-submit on limit |
