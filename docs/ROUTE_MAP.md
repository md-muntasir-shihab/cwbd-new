# Route Map

## Frontend surfaces

### Public routes
- `/`
- `/universities`
- `/university/:slug`
- `/categories`
- `/clusters`
- `/exam-portal`
- `/news`
- `/news/:slug`
- `/resources`
- `/resources/:slug`
- `/subscription-plans`
- `/contact`
- `/help-center`
- `/about`
- `/terms`
- `/privacy`
- `/login`
- `/otp-verify`

### Student routes
- `/dashboard`
- `/exams`
- `/exams/:id`
- `/results`
- `/results/:examId`
- `/payments`
- `/notifications`
- `/profile`
- `/support`
- `/student/exams-hub`
- `/student/resources`
- `/student/security`
- `/student/applications`
- `/student/profile`
- `/student/dashboard`

### Admin routes
- `/__cw_admin__/login`
- `/__cw_admin__/dashboard`
- `/__cw_admin__/universities`
- `/__cw_admin__/news/*`
- `/__cw_admin__/exams`
- `/__cw_admin__/question-bank/*`
- `/__cw_admin__/student-management/*`
- `/__cw_admin__/subscriptions/plans`
- `/__cw_admin__/finance/*`
- `/__cw_admin__/resources`
- `/__cw_admin__/reports`
- `/__cw_admin__/settings`
- `/__cw_admin__/settings/home-control`
- `/__cw_admin__/settings/university-settings`
- `/__cw_admin__/settings/site-settings`
- `/__cw_admin__/settings/banner-manager`
- `/__cw_admin__/settings/security-center`
- `/__cw_admin__/settings/system-logs`
- `/__cw_admin__/settings/reports`
- `/__cw_admin__/settings/notifications`
- `/__cw_admin__/settings/analytics`
- `/__cw_admin__/settings/news`
- `/__cw_admin__/settings/resource-settings`
- `/__cw_admin__/settings/admin-profile`
- `/__cw_admin__/campaigns/*`
- `/__cw_admin__/team/*`
- `/__cw_admin__/help-center`
- `/__cw_admin__/contact`

### Legacy redirects still supported
- `/campusway-secure-admin`
- `/campusway-secure-admin/*`
- `/admin-dashboard`
- `/admin/*`
- `/student`
- `/student/login`
- `/student/results/:examId`

## Next hybrid routes
- `/`
- `/news`
- `/news/[slug]`
- `/student`
- `/admin-dashboard`

These are runtime-smoked through the separate `frontend-next` app. They are not yet a full replacement for the Vite app.

## Backend route groups

### Public API
- `/api/health`
- `/api/home`
- `/api/public/*`
- `/api/auth/*`
- `/api/news*`
- `/api/resources*`
- `/api/contact`
- `/api/help-center/*`
- `/api/content-blocks/*`
- `/api/events/track`

Primary file: `backend/src/routes/publicRoutes.ts`

### Student API
- `/api/student/*`
- `/api/students/me/*`
- `/api/exams/*`
- `/api/results/*`
- `/api/payments/*`
- `/api/support/*`

Primary file: `backend/src/routes/studentRoutes.ts`

### Admin API
- `/api/campusway-secure-admin/*`

Primary files:
- `backend/src/routes/adminRoutes.ts`
- `backend/src/routes/adminStudentMgmtRoutes.ts`
- `backend/src/routes/adminStudentSecurityRoutes.ts`
- `backend/src/routes/adminNotificationRoutes.ts`
- `backend/src/routes/adminProviderRoutes.ts`

### Webhooks
- `/api/webhooks/*`

Primary file: `backend/src/routes/webhookRoutes.ts`
