#!/usr/bin/env pwsh
# ============================================
# CampusWay Azure Backend Deployment Script
# ============================================

param(
    [Parameter(Mandatory=$false)]
    [string]$EnvFile = ".env.azure"
)

Write-Host "🚀 CampusWay Azure Backend Deployment" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if .env.azure exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Error: $EnvFile not found!" -ForegroundColor Red
    Write-Host "Please create $EnvFile from .env.azure.template" -ForegroundColor Yellow
    exit 1
}

# Load environment variables
Write-Host "📋 Loading environment variables from $EnvFile..." -ForegroundColor Yellow
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Verify required variables
$requiredVars = @(
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID", 
    "AZURE_CLIENT_SECRET",
    "AZURE_SUBSCRIPTION_ID",
    "MONGO_URI",
    "JWT_SECRET",
    "FIREBASE_PROJECT_ID"
)

$missing = @()
foreach ($var in $requiredVars) {
    if (-not $env:($var)) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "✅ All required environment variables found" -ForegroundColor Green

# Login to Azure using Service Principal
Write-Host "`n🔐 Logging in to Azure..." -ForegroundColor Yellow
az login --service-principal `
    --username $env:AZURE_CLIENT_ID `
    --password $env:AZURE_CLIENT_SECRET `
    --tenant $env:AZURE_TENANT_ID

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Azure login failed!" -ForegroundColor Red
    exit 1
}

# Set subscription
Write-Host "📌 Setting Azure subscription..." -ForegroundColor Yellow
az account set --subscription $env:AZURE_SUBSCRIPTION_ID

# Login to Azure Developer CLI
Write-Host "🔐 Logging in to Azure Developer CLI..." -ForegroundColor Yellow
azd auth login --client-id $env:AZURE_CLIENT_ID `
    --client-secret $env:AZURE_CLIENT_SECRET `
    --tenant-id $env:AZURE_TENANT_ID

# Initialize azd environment
Write-Host "`n🏗️ Initializing Azure Developer CLI environment..." -ForegroundColor Yellow
azd env set MONGO_URI $env:MONGO_URI
azd env set JWT_SECRET $env:JWT_SECRET
azd env set JWT_REFRESH_SECRET $env:JWT_REFRESH_SECRET
azd env set ENCRYPTION_KEY $env:ENCRYPTION_KEY
azd env set FIREBASE_PROJECT_ID $env:FIREBASE_PROJECT_ID
azd env set FIREBASE_CLIENT_EMAIL $env:FIREBASE_CLIENT_EMAIL
azd env set FIREBASE_PRIVATE_KEY $env:FIREBASE_PRIVATE_KEY
azd env set FIREBASE_STORAGE_BUCKET $env:FIREBASE_STORAGE_BUCKET
azd env set APP_CHECK_ENFORCED "true"
azd env set ALLOW_TEST_OTP "false"
azd env set NODE_ENV "production"

# Deploy
Write-Host "`n🚀 Deploying to Azure..." -ForegroundColor Cyan
Write-Host "This may take 10-15 minutes..." -ForegroundColor Yellow
azd up

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Backend deployment successful!" -ForegroundColor Green
    Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
    Write-Host "1. Note the backend URL from the output above" -ForegroundColor White
    Write-Host "2. Update VITE_API_BASE_URL in frontend/.env.production" -ForegroundColor White
    Write-Host "3. Run: npm run deploy-firebase-frontend" -ForegroundColor White
} else {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
