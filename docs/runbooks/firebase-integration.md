# Firebase Integration Runbook

## Current Role of Firebase

Firebase is currently used for:
- client SDK readiness
- admin SDK readiness
- storage/hosting integration paths
- App Check hardening readiness

Firebase is not yet the active primary auth authority for CampusWay.

## Backend Requirements

Set these in backend env only:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

Optional enforcement toggle:
- `APP_CHECK_ENFORCED=false`

## Frontend Requirements

Set these in frontend env when using Firebase/App Check:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_SITE_KEY`
- `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` (local/debug only)

## Current App Check Scope

When enabled, the backend verifies App Check on selected anonymous/public write routes such as contact, password recovery, OTP verification/resend, analytics tracking, content-block tracking, help-center feedback, and share tracking.

## Local Guidance

- Keep `APP_CHECK_ENFORCED=false` until Firebase Admin and client config are both available.
- Use the Vite-side debug token only for local development with a real Firebase project.
- Do not place service-account material in frontend env files.
