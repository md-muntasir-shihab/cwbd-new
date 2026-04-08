#!/usr/bin/env pwsh
# ============================================
# CampusWay Firebase Frontend Deployment Script
# ============================================

param(
    [Parameter(Mandatory=$false)]
    [string]$EnvFile = ".env.azure"
)

Write-Host "🚀 CampusWay Firebase Frontend Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if .env.azure exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Error: $EnvFile not found!" -ForegroundColor Red
    exit 1
}

# Load environment variables
Write-Host "📋 Loading environment variables..." -ForegroundColor Yellow
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Verify Firebase token
if (-not $env:FIREBASE_TOKEN) {
    Write-Host "❌ FIREBASE_TOKEN not found in $EnvFile!" -ForegroundColor Red
    Write-Host "Run: firebase login:ci" -ForegroundColor Yellow
    exit 1
}

# Verify backend URL
if (-not $env:BACKEND_API_URL) {
    Write-Host "⚠️ Warning: BACKEND_API_URL not set!" -ForegroundColor Yellow
    $backendUrl = Read-Host "Enter your Azure backend URL (from previous deployment)"
    $env:BACKEND_API_URL = $backendUrl
}

# Create frontend .env.production
Write-Host "`n📝 Creating frontend/.env.production..." -ForegroundColor Yellow
$frontendEnv = @"
VITE_API_BASE_URL=$($env:BACKEND_API_URL)
VITE_FIREBASE_API_KEY=$($env:VITE_FIREBASE_API_KEY)
VITE_FIREBASE_AUTH_DOMAIN=$($env:VITE_FIREBASE_AUTH_DOMAIN)
VITE_FIREBASE_PROJECT_ID=$($env:VITE_FIREBASE_PROJECT_ID)
VITE_FIREBASE_STORAGE_BUCKET=$($env:VITE_FIREBASE_STORAGE_BUCKET)
VITE_FIREBASE_MESSAGING_SENDER_ID=$($env:VITE_FIREBASE_MESSAGING_SENDER_ID)
VITE_FIREBASE_APP_ID=$($env:VITE_FIREBASE_APP_ID)
VITE_FIREBASE_APPCHECK_SITE_KEY=$($env:VITE_FIREBASE_APPCHECK_SITE_KEY)
"@

$frontendEnv | Out-File -FilePath "frontend\.env.production" -Encoding utf8

Write-Host "✅ Created frontend/.env.production" -ForegroundColor Green

# Build frontend
Write-Host "`n🏗️ Building frontend..." -ForegroundColor Yellow
Push-Location frontend
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "✅ Frontend build successful" -ForegroundColor Green

# Deploy to Firebase
Write-Host "`n🚀 Deploying to Firebase Hosting..." -ForegroundColor Cyan
firebase deploy --only hosting --token $env:FIREBASE_TOKEN

Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Frontend deployment successful!" -ForegroundColor Green
    Write-Host "`n🎉 Deployment Complete!" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Backend: $($env:BACKEND_API_URL)" -ForegroundColor White
    Write-Host "Frontend: https://$($env:VITE_FIREBASE_PROJECT_ID).web.app" -ForegroundColor White
    Write-Host "`n📋 Post-deployment checklist:" -ForegroundColor Cyan
    Write-Host "1. Test login functionality" -ForegroundColor White
    Write-Host "2. Verify API connectivity" -ForegroundColor White
    Write-Host "3. Check Firebase App Check is working" -ForegroundColor White
    Write-Host "4. Monitor Application Insights for errors" -ForegroundColor White
} else {
    Write-Host "`n❌ Frontend deployment failed!" -ForegroundColor Red
    exit 1
}
