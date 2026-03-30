# CampusWay Exam System API Documentation

> Operational note (2026-03-31): this file was updated to trigger backend Azure CI/CD redeploy validation.

## Base URLs
- Public API: `/api`
- Admin API: `/api/{ADMIN_SECRET_PATH}` (default: `/api/campusway-secure-admin`)

## Authentication

### `POST /api/auth/login`
Login with email or username.

Request:
```json
{
  "identifier": "admin@example.com",
  "password": "StrongPassword123"
}
```

Response:
```json
{
  "token": "jwt_access_token",
  "user": {
    "_id": "user_id",
    "username": "admin1",
    "email": "admin@example.com",
    "role": "admin",
    "fullName": "Admin User",
    "permissions": {
      "canEditExams": true,
      "canManageStudents": true,
      "canViewReports": true,
      "canDeleteData": false
    },
    "redirectTo": "/campusway-secure-admin"
  },
  "suspiciousLogin": false
}
```

### `POST /api/auth/forgot-password`
Accepts `identifier` (email or username), sends reset link email.

### `POST /api/auth/reset-password`
```json
{ "token": "reset_token", "newPassword": "NewStrongPassword123" }
```

### `GET /api/auth/me`
Returns authenticated user with role and permissions.

### `POST /api/auth/change-password`
```json
{ "currentPassword": "old", "newPassword": "new" }
```

## Admin User Management

All endpoints below require:
- `Authorization: Bearer <token>`
- Admin API base path
- Role and permission checks

### List Users
`GET /users`

Query params:
- `page`, `limit`
- `search`
- `role`
- `status`
- `scope` = `all|students|admins`
- `institution`
- `roll`

Response includes:
- `users[]`
- `summary` (`total`, `active`, `suspended`, `students`, `admins`)
- pagination (`total`, `page`, `pages`)

### Create User
`POST /users`

Supports student/admin/moderator/superadmin creation.

Request sample:
```json
{
  "full_name": "Jane Student",
  "username": "jane25",
  "email": "jane@example.com",
  "password": "TempPass123",
  "role": "student",
  "status": "active",
  "phone_number": "0123456789",
  "roll_number": "2026-001",
  "registration_id": "REG-7788",
  "institution_name": "CampusWay College"
}
```

### Update User
`PUT /users/:id`

Editable fields:
- User: `full_name`, `username`, `email`, `role`, `status`, `phone_number`, `profile_photo`
- Student fields: `roll_number`, `registration_id`, `institution_name`, profile fields
- Permissions: `permissions`

### Delete User
`DELETE /users/:id`

### Role / Status / Permission Controls
- `PATCH /users/:id/role`
- `PATCH /users/:id/status`
- `PATCH /users/:id/toggle-status`
- `PATCH /users/:id/permissions`

### Bulk Operations
- `POST /users/bulk-action`
- `POST /users/bulk-import-students`
  - Supports JSON body `{ "students": [...] }`
  - Supports multipart file upload (`file`) with CSV/XLSX

### Real-time User Sync (SSE)
`GET /users/stream?token=<jwt_access_token>`

- Content type: `text/event-stream`
- Event name: `user-event`
- Pushes admin user-management changes instantly to connected admin panels.
- Event types:
  - `user_created`
  - `user_updated`
  - `user_deleted`
  - `user_status_changed`
  - `user_role_changed`
  - `user_permissions_changed`
  - `bulk_user_action`
  - `students_imported`

### Password Reset by Admin
`POST /users/:userId/reset-password`

Body:
```json
{ "newPassword": "OptionalManualPassword" }
```

If omitted, backend generates temporary password and returns it.

### User Activity & Profiles
- `GET /users/:id`
- `GET /users/:id/activity`
- `GET /users/:id/student-profile`
- `PUT /users/:id/student-profile`
- `GET /users/:id/admin-profile`
- `PUT /users/:id/admin-profile`

These include login history, device/IP info, and exam history where applicable.

## Security and Audit

### Audit Logs
`GET /audit-logs`

Query:
- `page`, `limit`
- `action`
- `actor`
- `dateFrom`, `dateTo`

### Suspicious Login Detection
- Login from unknown IP/device is flagged as `suspiciousLogin`
- Alert written to `AuditLog`
- Login stored in `LoginActivity`

### Account Lock
- Auto lock after 5 failed logins
- Lock duration: 15 minutes

## Profile Dashboard

### Student Dashboard
`GET /api/profile/dashboard`

Includes:
- Profile completion
- Upcoming/live/completed/missed exams
- Exam analytics
- Exam history timeline
- Login/device history
- Exam activity logs
