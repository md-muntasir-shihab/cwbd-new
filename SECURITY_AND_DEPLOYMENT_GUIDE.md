# 🔒 CampusWay Security Analysis & Deployment Credentials Guide

## 📋 Table of Contents
1. [Security Analysis Summary](#security-analysis-summary)
2. [Required Credentials for Automated Deployment](#required-credentials-for-automated-deployment)
3. [Security Recommendations](#security-recommendations)
4. [Deployment Process](#deployment-process)

---

## 🔐 Security Analysis Summary

### ✅ Security Features Already Implemented

#### 1. Authentication & Authorization
- ✅ **JWT-based authentication** (access + refresh tokens)
- ✅ **Role-based access control** (Admin, Student, Chairman)
- ✅ **Session tracking** with forced logout
- ✅ **OTP verification** for sensitive actions
- ✅ **Password hashing** using bcrypt
- ✅ **Rate limiting** on auth endpoints

#### 2. Backend Security Middleware
- ✅ **Helmet** - HTTP security headers
- ✅ **HPP** - HTTP Parameter Pollution protection
- ✅ **express-mongo-sanitize** - NoSQL injection prevention
- ✅ **CORS** configured with origin restrictions
- ✅ **Request sanitization** middleware
- ✅ **Input validation** on all endpoints

#### 3. Firebase App Check (Optional Layer)
- ✅ **App Check middleware** ready for public write endpoints
- ✅ Protected routes: `/api/auth/register`, `/api/auth/forgot-password`, `/api/contact`, etc.
- ✅ Environment-based enforcement (`APP_CHECK_ENFORCED=true`)
- ⚠️ **Currently disabled** - needs Firebase configuration to enable

#### 4. Frontend Security
- ✅ **Security headers** in `firebase.json`:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
- ✅ **Cache control** for static assets
- ✅ **Environment variable isolation** (VITE_* only)

### ⚠️ Security Items to Configure for Production

#### 1. Environment Variables
- ⚠️ Set `ALLOW_TEST_OTP=false` in production (currently development-only backdoor)
- ⚠️ Set `APP_CHECK_ENFORCED=true` after Firebase setup
- ⚠️ Configure `APPLICATIONINSIGHTS_CONNECTION_STRING` for Azure monitoring

#### 2. Secret Management
- ⚠️ Use **Azure Key Vault** for:
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `ENCRYPTION_KEY`
  - `MONGODB_URI`
  - `FIREBASE_PRIVATE_KEY`

#### 3. Azure Cloud-Side Controls
- ⚠️ Configure **Azure Front Door** with WAF
- ⚠️ Set up **Application Insights** monitoring
- ⚠️ Configure **CORS origins** to production domain only

---

## 🔑 Required Credentials for Automated Deployment

### যে credentials দিলে আমি automatically Firebase এবং Azure তে deploy করতে পারব:

### 1️⃣ Azure Credentials

#### Azure CLI Authentication
আমার দরকার:
```bash
# Option A: Service Principal (Recommended for automation)
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<service-principal-app-id>
AZURE_CLIENT_SECRET=<service-principal-password>
AZURE_SUBSCRIPTION_ID=<your-subscription-id>

# Option B: Personal credentials (manual login)
# You run: az login
# Then I can use your authenticated session
```

**Service Principal তৈরি করতে (আপনার run করতে হবে):**
```bash
# Create service principal with Contributor role
az ad sp create-for-rbac --name "CampusWayDeployment" --role Contributor --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID>

# Output will give you:
# {
#   "appId": "<CLIENT_ID>",
#   "password": "<CLIENT_SECRET>",
#   "tenant": "<TENANT_ID>"
# }
```

#### Azure Developer CLI (azd) Environment
```bash
AZURE_ENV_NAME=prod
AZURE_LOCATION=southeastasia
```

---

### 2️⃣ Firebase Credentials

#### Firebase Service Account (Backend)
আমার দরকার **Firebase service account JSON file** থেকে এই values:
```bash
FIREBASE_PROJECT_ID=campuswaybd
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@campuswaybd.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=campuswaybd.appspot.com
```

**কিভাবে পাবেন:**
1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download JSON file
4. Extract the values above from the JSON

#### Firebase CLI Authentication Token
```bash
# Option A: CI token (recommended for automation)
FIREBASE_TOKEN=<firebase-ci-token>

# Get token by running:
firebase login:ci
# This will give you a token like: 1//xxx-yyy-zzz
```

#### Firebase Hosting & App Check Config (Frontend)
```bash
VITE_FIREBASE_API_KEY=<your-api-key>
VITE_FIREBASE_AUTH_DOMAIN=campuswaybd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=campuswaybd
VITE_FIREBASE_STORAGE_BUCKET=campuswaybd.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<app-id>
VITE_FIREBASE_APPCHECK_SITE_KEY=<recaptcha-site-key>
```

**কিভাবে পাবেন:**
1. Firebase Console → Project Settings → General
2. Your apps → Web app → Config
3. Copy all the config values

**App Check Site Key:**
1. Firebase Console → App Check
2. Register your web app
3. Select reCAPTCHA v3
4. Copy the site key

---

### 3️⃣ MongoDB Connection String

```bash
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/campusway?retryWrites=true&w=majority
```

---

### 4️⃣ Application Secrets (for Azure Key Vault)

```bash
JWT_SECRET=<random-256-bit-string>
JWT_REFRESH_SECRET=<random-256-bit-string>
ENCRYPTION_KEY=<random-256-bit-string>
```

**Generate করতে (আপনার run করতে হবে):**
```bash
# Generate secure random strings
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📝 Complete Credentials Checklist

### আমাকে provide করতে হবে:

#### ✅ Azure Deployment
- [ ] `AZURE_TENANT_ID`
- [ ] `AZURE_CLIENT_ID` (Service Principal)
- [ ] `AZURE_CLIENT_SECRET` (Service Principal)
- [ ] `AZURE_SUBSCRIPTION_ID`
- [ ] `AZURE_ENV_NAME` (e.g., "prod")
- [ ] `AZURE_LOCATION` (e.g., "southeastasia")

#### ✅ Firebase Backend
- [ ] `FIREBASE_PROJECT_ID`
- [ ] `FIREBASE_CLIENT_EMAIL`
- [ ] `FIREBASE_PRIVATE_KEY` (full key with \\n escaped)
- [ ] `FIREBASE_STORAGE_BUCKET`
- [ ] `FIREBASE_TOKEN` (for CLI deployment)

#### ✅ Firebase Frontend
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_FIREBASE_APPCHECK_SITE_KEY`

#### ✅ Database & Secrets
- [ ] `MONGO_URI`
- [ ] `JWT_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `ENCRYPTION_KEY`

#### ✅ Production Settings
- [ ] `BACKEND_API_URL` (Azure Container Apps URL after deployment)
- [ ] `FRONTEND_URL` (Firebase Hosting URL)
- [ ] `ALLOW_TEST_OTP=false`
- [ ] `APP_CHECK_ENFORCED=true`

---

## 🚀 Deployment Process (Automated)

### যখন আপনি credentials দিবেন, আমি এই steps automatically করব:

### Step 1: Azure Backend Deployment
```bash
# 1. Set Azure credentials as environment variables
export AZURE_TENANT_ID=xxx
export AZURE_CLIENT_ID=xxx
export AZURE_CLIENT_SECRET=xxx
export AZURE_SUBSCRIPTION_ID=xxx

# 2. Login using service principal
az login --service-principal \
  --username $AZURE_CLIENT_ID \
  --password $AZURE_CLIENT_SECRET \
  --tenant $AZURE_TENANT_ID

# 3. Deploy using Azure Developer CLI
cd F:\CampusWay\CampusWay
azd auth login --client-id $AZURE_CLIENT_ID \
  --client-secret $AZURE_CLIENT_SECRET \
  --tenant-id $AZURE_TENANT_ID

# 4. Set environment variables for azd
azd env set MONGO_URI "<your-mongo-uri>"
azd env set JWT_SECRET "<your-jwt-secret>"
azd env set JWT_REFRESH_SECRET "<your-refresh-secret>"
azd env set ENCRYPTION_KEY "<your-encryption-key>"
azd env set FIREBASE_PROJECT_ID "<firebase-project-id>"
azd env set FIREBASE_CLIENT_EMAIL "<firebase-client-email>"
azd env set FIREBASE_PRIVATE_KEY "<firebase-private-key>"
azd env set FIREBASE_STORAGE_BUCKET "<firebase-storage-bucket>"
azd env set APP_CHECK_ENFORCED "true"
azd env set ALLOW_TEST_OTP "false"

# 5. Deploy
azd up
```

**Output:**
- Backend deployed to: `https://campusway-backend-<random>.azurecontainerapps.io`
- Container Registry created
- Key Vault created with secrets

---

### Step 2: Firebase Frontend Deployment
```bash
# 1. Set Firebase token
export FIREBASE_TOKEN=<your-firebase-ci-token>

# 2. Update frontend .env.production
cd frontend
cat > .env.production << EOF
VITE_API_BASE_URL=https://campusway-backend-<random>.azurecontainerapps.io
VITE_FIREBASE_API_KEY=<api-key>
VITE_FIREBASE_AUTH_DOMAIN=campuswaybd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=campuswaybd
VITE_FIREBASE_STORAGE_BUCKET=campuswaybd.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<app-id>
VITE_FIREBASE_APPCHECK_SITE_KEY=<site-key>
EOF

# 3. Build frontend
npm run build

# 4. Deploy to Firebase Hosting
firebase deploy --only hosting --token $FIREBASE_TOKEN
```

**Output:**
- Frontend deployed to: `https://campuswaybd.web.app` (or custom domain)

---

## 🔒 Security Best Practices for Credentials

### ✅ DO:
- ✅ Store credentials in **Azure Key Vault** (backend)
- ✅ Use **Service Principal** for Azure (not personal account)
- ✅ Use **Firebase CI token** for automation
- ✅ Set `ALLOW_TEST_OTP=false` in production
- ✅ Enable `APP_CHECK_ENFORCED=true` in production
- ✅ Use HTTPS-only for all endpoints
- ✅ Rotate secrets periodically (every 90 days)

### ❌ DON'T:
- ❌ Commit `.env` files to git
- ❌ Share credentials in plain text (use encrypted channels)
- ❌ Use development credentials in production
- ❌ Store secrets in frontend code
- ❌ Use `ALLOW_TEST_OTP=true` in production

---

## 📊 Security Checklist (Production Ready)

### Before Going Live:

- [ ] ✅ All credentials stored in Azure Key Vault
- [ ] ✅ Firebase App Check enabled (`APP_CHECK_ENFORCED=true`)
- [ ] ✅ Test OTP backdoor disabled (`ALLOW_TEST_OTP=false`)
- [ ] ✅ CORS origins restricted to production domain only
- [ ] ✅ Azure Front Door + WAF configured
- [ ] ✅ Application Insights monitoring enabled
- [ ] ✅ Database connection uses SSL/TLS
- [ ] ✅ JWT secrets are strong (256-bit minimum)
- [ ] ✅ Rate limiting enabled on all auth endpoints
- [ ] ✅ Security headers configured (already done ✅)
- [ ] ✅ MongoDB IP whitelist configured
- [ ] ✅ Backup strategy implemented
- [ ] ✅ Incident response plan documented

---

## 🎯 Summary

### আপনাকে যা দিতে হবে:

1. **Azure Service Principal credentials** (4 values)
2. **Firebase service account JSON** (download করে values extract করতে হবে)
3. **Firebase CI token** (`firebase login:ci` run করে পাবেন)
4. **Firebase frontend config** (Firebase Console থেকে copy করতে হবে)
5. **MongoDB connection string**
6. **JWT secrets** (generate করে দিতে হবে)

### আমি যা করব:

1. ✅ Azure তে backend deploy করব (Container Apps)
2. ✅ Firebase তে frontend deploy করব (Hosting)
3. ✅ Azure Key Vault তে secrets store করব
4. ✅ Environment variables configure করব
5. ✅ Security settings enable করব
6. ✅ Deployment verification করব

### Estimated Time:
- Azure backend deployment: **10-15 minutes**
- Firebase frontend deployment: **3-5 minutes**
- Total: **15-20 minutes** (fully automated after credentials provided)

---

**Ready to deploy? Provide the credentials above and I'll handle the rest! 🚀**
