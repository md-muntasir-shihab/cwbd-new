# CampusWay Seed Data Expectations

## Test Accounts

The E2E and QA lifecycle should cover at least these personas:
- admin
- moderator/editor
- student active subscriber
- student expired subscriber
- student renewal-due subscriber

## Required Sample Records

- support ticket
- contact message
- news item
- notice item
- campaign draft
- communication template
- provider mock
- trigger rule
- delivery log
- university/category/cluster sample data
- subscription plans with mixed states

## Existing Command Baseline

```bash
cd backend
npm run seed
npm run seed:content
npm run seed:default-users
npm run e2e:prepare
npm run e2e:restore
```

## Bootstrap Guidance

- Keep provider and campaign sends mocked or local-safe during bootstrap.
- No real outbound communication should be required for readiness.
- Seed/test expectations should support public, student, admin, and communication workflows.
- If a later phase needs additional data shapes, extend `e2e:prepare` rather than inventing disconnected seed paths.
