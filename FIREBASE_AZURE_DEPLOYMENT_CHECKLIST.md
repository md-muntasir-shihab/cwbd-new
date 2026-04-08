# CampusWay - Firebase & Azure Deployment Checklist

## Overview
This document lists all credentials, configurations, and assets that need to be uploaded/configured in Firebase and Azure for production deployment.

---

## 🔐 Security Checklist

### ✅ REQUIRED Actions Before Production
1. **Change all secrets from `.env.example` defaults**
2. **Set `ALLOW_TEST_OTP=false` in production**
3. **Generate strong JWT secrets** (64+ characters)
4. **Generate ENCRYPTION_KEY** (64-char hex for AES-256-GCM)
5. **Enable `APP_CHECK_ENFORCED=true`** for public write endpoints
6. **Set up Azure Key Vault** for secret management

---

## 🔥 Firebase Setup

### 1. Firebase Project Configuration
**Required Firebase Services:**
- ✅ Firebase Authentication (optional, for future OAuth)
- ✅ Firebase Storage (for file uploads - media, documents)
- ✅ Firebase App Check (REQUIRED for production security)
- ✅ Firebase Admin SDK (backend integration)

### 2. Firebase Admin SDK (Backend)

**Required Environment Variables:**
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

**How to Get These:**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Extract values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep newlines as `\n`)
   - Use project ID + `.appspot.com` → `FIREBASE_STORAGE_BUCKET`

**⚠️ SECURITY NOTES:**
- **NEVER commit the service account JSON to Git**
- Store in Azure Key Vault (see below)
- Private key must preserve `\n` characters

### 3. Firebase App Check (CRITICAL for Production)

**Frontend Environment Variables:**
```env
VITE_FIREBASE_APPCHECK_SITE_KEY=your-recaptcha-v3-site-key
```

**Backend Environment Variable:**
```env
APP_CHECK_ENFORCED=true
```

**Setup Steps:**
1. **Enable reCAPTCHA v3:**
   - Go to Firebase Console → App Check → Apps
   - Select your web app
   - Choose "reCAPTCHA v3" provider
   - Register site at https://www.google.com/recaptcha/admin
   - Copy site key → `VITE_FIREBASE_APPCHECK_SITE_KEY`

2. **Configure Debug Tokens (Development Only):**
   ```env
   VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=your-debug-token-for-localhost
   ```
   - Go to App Check → Debug tokens
   - Add token for development testing
   - **REMOVE in production builds**

3. **Protected Endpoints:**
   Currently protected routes in `backend/src/routes/publicRoutes.ts`:
   - Contact form submission
   - Support ticket creation
   - Password reset
   - Student registration
   - Any public write operations

### 4. Firebase Client Config (Frontend)

**Required Environment Variables:**
```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

**How to Get These:**
1. Go to Firebase Console → Project Settings → General
2. Scroll to "Your apps" section
3. Select your web app (or create one)
4. Copy the config object values

**Firebase Storage Rules (for media uploads):**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Public read access to news media
    match /news/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.role in ['superadmin', 'admin', 'moderator'];
    }
    
    // Public read access to university media
    match /universities/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.role in ['superadmin', 'admin', 'moderator'];
    }
    
    // Private access to documents
    match /documents/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.token.role in ['superadmin', 'admin'];
    }
  }
}
```

---

## ☁️ Azure App Service Configuration

### 1. Application Settings (Environment Variables)

**Method 1: Azure Key Vault References (RECOMMENDED)**
```env
JWT_SECRET=@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/campusway-jwt-secret/latest)
JWT_REFRESH_SECRET=@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/campusway-jwt-refresh-secret/latest)
ENCRYPTION_KEY=@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/campusway-encryption-key/latest)
MONGODB_URI=@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/campusway-mongodb-uri/latest)
FIREBASE_PRIVATE_KEY=@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/campusway-firebase-private-key/latest)
```

**Method 2: Direct Configuration (Less Secure)**
- Add all environment variables from `.env.example` to Application Settings
- Mark sensitive ones as "Deployment Slot Setting"

### 2. Azure Key Vault Setup

**Required Secrets to Upload:**
1. **campusway-jwt-secret** - 64+ character random string
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
   ```

2. **campusway-jwt-refresh-secret** - Different 64+ character string

3. **campusway-encryption-key** - 64-character hex string (32 bytes)
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **campusway-mongodb-uri** - Production MongoDB connection string
   ```
   mongodb+srv://username:password@cluster.mongodb.net/campusway?retryWrites=true&w=majority
   ```

5. **campusway-firebase-private-key** - Firebase service account private key
   ```
   -----BEGIN PRIVATE KEY-----\nMIIEvQIBAD...\n-----END PRIVATE KEY-----\n
   ```

6. **campusway-sendgrid-api-key** - SendGrid API key (if using)

7. **campusway-smtp-password** - SMTP password (if using)

8. **campusway-aws-secret-key** - AWS secret key (if using S3)

**Steps to Upload:**
1. Go to Azure Portal → Key Vault → Your vault
2. Click "Secrets" → "+ Generate/Import"
3. For each secret:
   - Name: Use convention above
   - Value: Paste the secret value
   - Content type: (optional) `text/plain`
   - Set activation/expiration dates as needed
4. Grant App Service access:
   - App Service → Identity → System assigned → On
   - Key Vault → Access policies → Add Access Policy
   - Secret permissions: Get, List
   - Select principal: Your App Service
   - Save

### 3. Azure Application Insights (Monitoring)

**Required Environment Variable:**
```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxxxxx;IngestionEndpoint=https://xxx.in.applicationinsights.azure.com/;LiveEndpoint=https://xxx.livediagnostics.monitor.azure.com/
```

**How to Get:**
1. Create Application Insights resource in Azure
2. Go to Overview → Copy "Connection String"
3. Add to App Service Application Settings

**Instrumentation Location:**
```typescript
// backend/src/index.ts (already configured)
import appInsights from 'applicationinsights';
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    appInsights.setup().start();
}
```

---

## 🗄️ MongoDB Atlas Setup

### 1. Create Cluster
1. Go to MongoDB Atlas
2. Create new cluster (M10+ recommended for production)
3. Choose region close to Azure App Service
4. Configure network access (whitelist Azure IPs or use 0.0.0.0/0 with strong auth)

### 2. Create Database User
1. Database Access → Add New Database User
2. Authentication Method: Password
3. Database User Privileges: "Read and write to any database"
4. Username: `campusway-app`
5. Password: Generate strong password
6. Save

### 3. Get Connection String
1. Clusters → Connect → Connect your application
2. Driver: Node.js 4.1 or later
3. Copy connection string:
   ```
   mongodb+srv://campusway-app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with actual password
5. Add database name: `/campusway`
6. Upload to Azure Key Vault as `campusway-mongodb-uri`

### 4. Configure IP Whitelist
**Option 1: Whitelist Azure Outbound IPs**
1. Get App Service outbound IPs:
   - App Service → Properties → Outbound IP addresses
2. Add each IP to MongoDB Atlas Network Access

**Option 2: Use 0.0.0.0/0 (Any IP)**
- **Only if using strong authentication + connection string encryption**
- Less secure but simpler for cloud deployments

---

## 📧 Email Configuration (SendGrid or SMTP)

### Option 1: SendGrid (Recommended)
**Required:**
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Setup:**
1. Create SendGrid account
2. Create API Key with "Mail Send" permissions
3. Add to Azure Key Vault as `campusway-sendgrid-api-key`

### Option 2: SMTP
**Required:**
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@yourdomain.com
SMTP_PASS=your-smtp-password
MAIL_FROM=no-reply@yourdomain.com
```

**Upload to Key Vault:**
- `campusway-smtp-password` (password only, other fields can be in App Settings)

---

## 💳 Payment Integration (SSL Commerz)

**Required:**
```env
SSLCOMMERZ_STORE_PASSWORD=your-store-password
PAYMENT_WEBHOOK_SECRET=generate-random-secret-for-webhook-verification
```

**Setup:**
1. Register with SSL Commerz
2. Get store ID and password
3. Generate webhook secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Upload to Azure Key Vault

---

## 🤖 OpenAI Integration (Optional)

**Required:**
```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Used For:**
- News AI summarization
- Content quality checks
- Smart notifications

**Setup:**
1. Get API key from OpenAI
2. Upload to Key Vault as `campusway-openai-api-key`

---

## 🌐 CORS and Domain Configuration

**Production Environment Variables:**
```env
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
ADMIN_ORIGIN=https://admin.yourdomain.com
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com,https://www.yourdomain.com
APP_DOMAIN=https://yourdomain.com
```

**Azure App Service Custom Domains:**
1. App Service → Custom domains → Add custom domain
2. Configure DNS records (A or CNAME)
3. Enable HTTPS (free managed certificate)
4. Update environment variables with actual domains

---

## 🔒 Security Best Practices Checklist

### Before Going Live:

- [ ] **Change all default secrets**
- [ ] **Set `ALLOW_TEST_OTP=false`**
- [ ] **Remove `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` from production build**
- [ ] **Enable `APP_CHECK_ENFORCED=true`**
- [ ] **Use Azure Key Vault for all secrets**
- [ ] **Enable HTTPS/SSL on all domains**
- [ ] **Configure MongoDB IP whitelist**
- [ ] **Set up Application Insights monitoring**
- [ ] **Configure backup strategy for MongoDB**
- [ ] **Test disaster recovery procedures**
- [ ] **Review and enable Azure Security Center recommendations**
- [ ] **Set up Azure Front Door or CDN for frontend**
- [ ] **Configure rate limiting on API endpoints**
- [ ] **Enable Azure DDoS Protection**
- [ ] **Set up alerts for suspicious activity**

### Runtime Security Features (Already Implemented):
- ✅ JWT token encryption with secure secrets
- ✅ AES-256-GCM provider credential encryption
- ✅ Role-based permission matrix (all 566 routes migrating now)
- ✅ Two-person approval for critical actions
- ✅ Destructive action step-up authentication
- ✅ Sensitive export tracking and audit logs
- ✅ Firebase App Check for public write endpoints
- ✅ Rate limiting on subscription actions
- ✅ Security audit logs
- ✅ Permission-based UI component guards
- ✅ Password reset flow with secure tokens

---

## 📦 Deployment Workflow

### Backend Deployment
```bash
# Build
cd backend
npm run build

# Azure App Service will run:
npm start  # which runs: node dist/index.js
```

### Frontend Deployment
```bash
# Build
cd frontend
npm run build

# Deploy dist/ folder to:
# - Azure Static Web Apps, or
# - Azure Blob Storage + CDN, or
# - Azure App Service (static site hosting)
```

### Frontend-Next Deployment
```bash
# Build
cd frontend-next
npm run build

# Azure App Service will run:
npm start  # which runs: next start
```

---

## 🧪 Testing Before Production

### 1. Staging Environment
- Deploy to staging slot first
- Test all integrations (Firebase, MongoDB, SendGrid)
- Run smoke tests
- Verify App Check enforcement
- Test payment flows
- Verify role permissions

### 2. Security Testing
```bash
# Backend security tests
cd backend
npm run test:security  # (if available)

# Frontend E2E security tests
cd frontend
npm run e2e:role-full-qa
```

### 3. Performance Testing
- Load test critical endpoints
- Monitor Application Insights
- Check MongoDB query performance
- Verify CDN caching

---

## 📋 Post-Deployment Checklist

- [ ] Verify all services are running
- [ ] Check Application Insights for errors
- [ ] Test critical user flows
- [ ] Verify email delivery
- [ ] Test payment integration
- [ ] Check Firebase Storage uploads
- [ ] Verify App Check enforcement
- [ ] Monitor MongoDB performance
- [ ] Set up automated backups
- [ ] Configure alerting rules
- [ ] Document rollback procedures

---

## 🚨 Rollback Procedures

### If Critical Issue Detected:
1. **Immediate:** Swap staging/production deployment slots
2. **Investigate:** Check Application Insights logs
3. **Fix:** Apply hotfix to staging
4. **Test:** Verify fix in staging
5. **Deploy:** Swap back to production

### Database Rollback:
1. Stop writes to database
2. Restore from latest backup
3. Re-apply any critical data changes
4. Resume service

---

## 📞 Support and Monitoring

### Key Metrics to Monitor:
- **Application Insights:**
  - Request failure rate
  - Response times
  - Dependency failures (MongoDB, Firebase)
  - Custom events (login, payment, etc.)

- **MongoDB Atlas:**
  - Connection pool usage
  - Query performance
  - Storage usage
  - Backup status

- **Azure App Service:**
  - CPU/Memory usage
  - HTTP 5xx errors
  - App restarts

### Alert Configuration:
- HTTP 5xx error rate > 1%
- Average response time > 3s
- MongoDB connection failures
- App Service crashes
- Key Vault access failures
- Unusual authentication patterns

---

## 📚 Additional Resources

- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [Firebase App Check Documentation](https://firebase.google.com/docs/app-check)
- [Azure Key Vault Best Practices](https://learn.microsoft.com/en-us/azure/key-vault/general/best-practices)
- [MongoDB Atlas Security](https://www.mongodb.com/docs/atlas/security/)
- [Azure App Service Deployment](https://learn.microsoft.com/en-us/azure/app-service/)

---

**Last Updated:** 2025-01-04
**Maintained By:** CampusWay Development Team
