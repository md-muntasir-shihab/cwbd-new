# 🚀 CampusWay Deployment Quick Start Guide

## 📋 Prerequisites Checklist

- [ ] Azure subscription active
- [ ] Firebase project created (`campuswaybd`)
- [ ] MongoDB database accessible
- [ ] Azure CLI installed (`az --version`)
- [ ] Azure Developer CLI installed (`azd version`)
- [ ] Firebase CLI installed (`firebase --version`)
- [ ] Node.js 18+ installed
- [ ] Git repository clean (no uncommitted changes)

---

## ⚡ Quick Deployment (3 Steps)

### Step 1: Prepare Credentials (5-10 minutes)

```bash
# 1. Copy environment template
cp .env.azure.template .env.azure

# 2. Create Azure Service Principal
az ad sp create-for-rbac --name "CampusWayDeployment" --role Contributor

# 3. Get Firebase credentials
# - Go to Firebase Console → Project Settings → Service Accounts
# - Click "Generate New Private Key" → Save JSON

# 4. Get Firebase CI token
firebase login:ci
# Copy the token

# 5. Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run 3 times for JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY

# 6. Fill in all values in .env.azure
# See SECURITY_AND_DEPLOYMENT_GUIDE.md for detailed instructions
```

### Step 2: Deploy Backend to Azure (10-15 minutes)

```powershell
# Run deployment script
.\scripts\deploy-azure-backend.ps1

# Or manually:
cd F:\CampusWay\CampusWay
azd up
```

**Expected Output:**
```
✅ Backend deployed to: https://campusway-backend-<random>.azurecontainerapps.io
✅ Container Registry created
✅ Key Vault created with secrets
```

**⚠️ Important:** Copy the backend URL from output!

### Step 3: Deploy Frontend to Firebase (3-5 minutes)

```powershell
# Update backend URL in .env.azure
# BACKEND_API_URL=https://campusway-backend-<random>.azurecontainerapps.io

# Run deployment script
.\scripts\deploy-firebase-frontend.ps1

# Or manually:
cd frontend
npm run build
firebase deploy --only hosting --token $FIREBASE_TOKEN
```

**Expected Output:**
```
✅ Frontend deployed to: https://campuswaybd.web.app
```

---

## 🔒 Security Verification Checklist

After deployment, verify these security measures:

### Authentication & Authorization ✅
- [ ] Login with test admin account works
- [ ] Login with test student account works
- [ ] JWT tokens are being issued correctly
- [ ] Refresh token flow works
- [ ] Role-based access control enforced (admin vs student)
- [ ] Unauthorized routes return 401/403

### Firebase App Check ✅
- [ ] App Check is enabled (`APP_CHECK_ENFORCED=true`)
- [ ] Public write endpoints protected:
  - `/api/auth/register`
  - `/api/auth/forgot-password`
  - `/api/contact`
  - etc.
- [ ] Requests without App Check token are rejected
- [ ] Frontend App Check initialization working

### Rate Limiting ✅
- [ ] Login rate limit working (3-5 attempts per 15 min)
- [ ] Admin login rate limit stricter
- [ ] Contact form rate limited (5 per hour)
- [ ] Upload rate limited
- [ ] Exam submission rate limited

### Environment Variables ✅
- [ ] `ALLOW_TEST_OTP=false` in production
- [ ] `APP_CHECK_ENFORCED=true` in production
- [ ] `NODE_ENV=production`
- [ ] All secrets stored in Azure Key Vault
- [ ] No `.env` files committed to git

### Security Headers ✅
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] CORS restricted to production domain

### Database Security ✅
- [ ] MongoDB connection uses SSL/TLS
- [ ] MongoDB IP whitelist configured
- [ ] NoSQL injection prevention working (mongo-sanitize)
- [ ] Database backups configured

### Monitoring ✅
- [ ] Application Insights connected
- [ ] Error tracking working
- [ ] Performance metrics visible
- [ ] Custom events logging

---

## 🐛 Troubleshooting

### Backend Deployment Fails

```bash
# Check Azure login
az account show

# Check azd environment
azd env list

# View deployment logs
azd logs

# Redeploy
azd deploy
```

### Frontend Build Fails

```bash
# Check Node version
node --version  # Should be 18+

# Clear cache and rebuild
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

### Firebase Deployment Fails

```bash
# Check Firebase login
firebase projects:list

# Check current project
firebase use

# Re-authenticate
firebase login:ci
# Copy new token to .env.azure
```

### App Check Not Working

```bash
# Verify reCAPTCHA site key
# Firebase Console → App Check → Web apps

# Check frontend env
cat frontend/.env.production | grep APPCHECK

# Check backend env
azd env get-values | grep APP_CHECK
```

---

## 📊 Deployment Status Monitor

### Check Backend Health
```bash
curl https://your-backend-url.azurecontainerapps.io/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-04-08T09:00:00.000Z"
}
```

### Check Frontend Deployment
```bash
curl https://campuswaybd.web.app
```

**Expected:** HTML content loads

### Check Database Connection
```bash
# Backend logs should show:
# ✅ MongoDB connected successfully
azd logs --follow
```

---

## 🔄 Redeployment (Updates)

### Backend Update
```bash
# Make code changes
git add .
git commit -m "feat: your changes"

# Redeploy
azd deploy
```

### Frontend Update
```bash
# Make code changes
cd frontend
npm run build
firebase deploy --only hosting --token $FIREBASE_TOKEN
```

---

## 📱 Quick Test Checklist

After deployment, test these flows:

1. **Public Homepage**
   - [ ] Visit homepage loads
   - [ ] Universities list loads
   - [ ] News page loads
   - [ ] Contact form submits (rate limit: 5/hour)

2. **Student Login**
   - [ ] Login page loads
   - [ ] Login with credentials works
   - [ ] Dashboard loads after login
   - [ ] Profile page accessible
   - [ ] Exams list loads

3. **Admin Login**
   - [ ] Admin login page loads (`/__cw_admin__`)
   - [ ] Login with admin credentials works
   - [ ] Admin dashboard loads
   - [ ] Settings page accessible
   - [ ] All admin modules load

4. **Security Tests**
   - [ ] Unauthorized access returns 401/403
   - [ ] Rate limiting kicks in after threshold
   - [ ] App Check rejects invalid tokens
   - [ ] CORS blocks unauthorized origins

---

## 📞 Support Resources

### Documentation
- **Comprehensive Guide**: `SECURITY_AND_DEPLOYMENT_GUIDE.md`
- **Testing Report**: `session-files/phase21-final-report.md`
- **Fix Instructions**: `APPLY_FIXES.md`

### Azure Resources
- Portal: https://portal.azure.com
- Container Apps: https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.App%2FcontainerApps
- Key Vault: https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.KeyVault%2Fvaults

### Firebase Resources
- Console: https://console.firebase.google.com
- Hosting: https://console.firebase.google.com/project/campuswaybd/hosting
- App Check: https://console.firebase.google.com/project/campuswaybd/appcheck

---

## ✨ Success Indicators

Your deployment is successful when:

✅ Backend health endpoint returns `200 OK`  
✅ Frontend loads without errors  
✅ Database connection established  
✅ Firebase App Check token validation working  
✅ Login flows functional for both admin and student  
✅ Rate limiting protecting endpoints  
✅ Security headers present in responses  
✅ Application Insights receiving telemetry  

**🎉 Congratulations! CampusWay is live in production!**
