# Role Matrix

## Public visitor
- Access: public pages, news, resources, contact, help center, plan browsing, login/register flows.
- Cannot access: student dashboard routes, admin routes, protected APIs.
- Special note: anonymous write endpoints are the first App Check enforcement target.

## Student
- Access: dashboard, profile, security, exams, results, payments, notifications, support, student resources.
- Auth model: JWT session is currently authoritative.
- Cannot access: admin UI, admin APIs, staff-only exports, staff management flows.

## Admin
- Access: full admin console, site settings, universities, news, exams, question bank, students, subscriptions, finance, reports, security, team access, communication stack.
- Auth model: JWT session with role and `permissionsV2`.
- Current baseline assumption: bootstrap validation uses seeded E2E admin accounts.

## Staff variants
- Observed role labels in code and docs:
  - `superadmin`
  - `admin`
  - `moderator`
  - `editor`
  - chairman-specific surfaces

## Permission model
- Backend and frontend both reference a granular module-action map under `permissionsV2`.
- High-value modules in that map include:
  - site settings
  - home control
  - banner manager
  - universities
  - news
  - exams
  - question bank
  - students/groups
  - subscription plans
  - payments
  - finance center
  - resources
  - support center
  - notifications
  - reports
  - security logs
  - team access control

## Phase-readiness implication
- Public/student/admin boundaries are testable now.
- Role-based API and route checks are ready for the next QA phase.
- Further hardening is still needed for full staff-role verification across every admin submodule.
