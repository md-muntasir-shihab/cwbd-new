# CampusWay Environment Setup

## Required Local Tools

- Node.js 22+
- npm 10+
- Git
- MongoDB 8.x
- Playwright browser binaries (`npx playwright install` if needed)

Optional but useful later:
- Firebase CLI
- Azure CLI

## Standard Local Ports

- MongoDB: `27017`
- Backend: `5003`
- Vite frontend: `5175`
- Next hybrid frontend: `3000`

## Backend Setup

```bash
cd backend
cp .env.example .env
npm install
```

Minimum local env:
- `PORT=5003`
- `MONGODB_URI=mongodb://localhost:27017/campusway`
- `JWT_SECRET=<value>`
- `JWT_REFRESH_SECRET=<value>`
- `ENCRYPTION_KEY=<value>`
- `FRONTEND_URL=http://localhost:5175`
- `ADMIN_ORIGIN=http://localhost:5175`

Optional Firebase Admin values:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

Optional App Check and Azure values:
- `APP_CHECK_ENFORCED=false`
- `APPLICATIONINSIGHTS_CONNECTION_STRING=`

## Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
```

Useful local values:
- `VITE_API_BASE_URL=http://localhost:5003/api`
- `VITE_API_PROXY_TARGET=http://localhost:5003`
- `VITE_ADMIN_PATH=campusway-secure-admin`
- `VITE_USE_MOCK_API=false`

Optional Firebase/App Check public values:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_SITE_KEY`
- `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`

## Frontend Next Setup

```bash
cd frontend-next
cp .env.example .env.local
npm install
```

Set:
- `NEXT_PUBLIC_API_BASE=http://localhost:5003`
- `NEXT_PUBLIC_ADMIN_PATH=campusway-secure-admin`

## MongoDB Startup

```powershell
"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath D:\CampusWay\CampusWay\.local-mongo\data
```

## Initial Verification

```bash
# backend
curl http://localhost:5003/api/health

# vite app
# open http://localhost:5175

# next app
# open http://localhost:3000
```

## Safety Notes

- Treat `.env.production` as local-only and ignored.
- Do not paste secret values into docs, tickets, or screenshots.
- Production must set `ALLOW_TEST_OTP=false`.
