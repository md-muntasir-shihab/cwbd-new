<div align="center">

# 🎓 CampusWay

### বাংলাদেশের শিক্ষার্থীদের জন্য সম্পূর্ণ শিক্ষা প্ল্যাটফর্ম

*A comprehensive full-stack education platform for Bangladeshi students — university admission prep, exam management, gamified learning, and beyond.*

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongoosejs.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![code style: eslint](https://img.shields.io/badge/code_style-eslint-4B32C3?style=flat-square&logo=eslint)](https://eslint.org/)

<br/>

[Features](#-features) · [Tech Stack](#-tech-stack) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Contributing](#-contributing)

</div>

---

## 🎯 Who Is This For?

| Audience | বাংলা | Description |
|:--------:|:------:|:------------|
| 🏫 | **ভর্তি পরীক্ষার্থী** | University admission candidates (BUET, DU, Medical, Engineering, GST) |
| 📖 | **মাধ্যমিক/উচ্চমাধ্যমিক** | SSC & HSC students (Class 9–12) |
| 💼 | **চাকরি প্রস্তুতি** | Job seekers (BCS, Bank, NTRCA, Primary Teacher) |
| 🏢 | **কোচিং সেন্টার** | Coaching centers & examiners who create and sell exams |

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📝 Exam Management
- 5-step exam builder wizard
- Auto-pick questions by difficulty distribution
- Live, scheduled, practice & mock exam types
- Anti-cheat: tab detection, fullscreen, copy-paste block
- Written/CQ support with AI-assisted grading
- Real-time leaderboards via SSE

</td>
<td width="50%">

### 📚 Question Bank
- 5-level hierarchy: Group → Sub-Group → Subject → Chapter → Topic
- Bilingual support (English + বাংলা)
- LaTeX math rendering (KaTeX)
- Bulk import (Excel/CSV/JSON) & export
- Review/moderation workflow
- Duplicate detection

</td>
</tr>
<tr>
<td>

### 🎮 Gamification
- XP, Coins & daily login bonus
- League system (Iron → Platinum)
- Streak tracking with calendar
- Badge collection
- Brain Clash — live 1v1 MCQ battles
- Adaptive difficulty per topic

</td>
<td>

### 📊 Analytics & Learning
- Student performance dashboard (radar, heatmap, line charts)
- Mistake Vault with mastery tracking
- AI-powered weak topic suggestions
- Study routine planner with adherence %
- Doubt solver (AI + community threads)
- Per-exam & platform-wide admin analytics

</td>
</tr>
<tr>
<td>

### 👥 User Management
- JWT auth with refresh token rotation
- Role-based access (superadmin, admin, examiner, student, chairman)
- Student groups with nested structures
- Examiner accounts with revenue sharing
- Exam packages with coupon codes

</td>
<td>

### 🔔 Notifications & More
- Event-driven notifications (exam, streak, battle, payment)
- Multi-channel: in-app, push, email, SMS
- Dark mode with OS preference detection
- Responsive design (mobile-first)
- Bengali-compatible fonts (Noto Sans Bengali)

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

<table>
<tr><th align="center">Layer</th><th align="center">Technology</th></tr>
<tr><td><strong>Frontend</strong></td><td>React 19 · Vite 6 · TailwindCSS 3 · TanStack Query · React Router v7 · Recharts · KaTeX · Framer Motion</td></tr>
<tr><td><strong>Backend</strong></td><td>Node.js · Express · TypeScript · Mongoose 9 · Zod · node-cron · multer · ExcelJS · PDFKit</td></tr>
<tr><td><strong>Database</strong></td><td>MongoDB (130+ collections) · Upstash Redis (cache)</td></tr>
<tr><td><strong>Auth</strong></td><td>JWT (access + refresh) · Firebase Admin SDK · 2FA (email/SMS/authenticator)</td></tr>
<tr><td><strong>AI</strong></td><td>Google Generative AI SDK (explanations, weak topic analysis, grading suggestions)</td></tr>
<tr><td><strong>Testing</strong></td><td>Jest · fast-check (PBT) · Vitest · Playwright · mongodb-memory-server</td></tr>
<tr><td><strong>DevOps</strong></td><td>GitHub Actions CI · Husky pre-commit · ESLint · Docker Compose</td></tr>
</table>

---

## 📁 Architecture

```
CampusWay/
│
├── backend/                    # Express API server (port 5003)
│   └── src/
│       ├── controllers/        # Thin route handlers (50+)
│       ├── services/           # Business logic layer (30+)
│       ├── models/             # Mongoose schemas (130+)
│       ├── routes/             # Express route definitions
│       ├── validators/         # Zod request schemas
│       ├── middlewares/        # Auth, CSRF, rate-limit, RBAC
│       ├── cron/               # Scheduled background jobs
│       ├── realtime/           # SSE streams (battle, leaderboard)
│       ├── seeds/              # Database seeders
│       └── server.ts           # Entry point
│
├── frontend/                   # React SPA (port 5175)
│   └── src/
│       ├── pages/              # Lazy-loaded page components
│       │   ├── admin/          # Admin panel pages
│       │   └── student/        # Student-facing pages
│       ├── components/         # Reusable UI components
│       ├── hooks/              # Custom React hooks (50+)
│       ├── api/                # Typed API client modules
│       ├── types/              # TypeScript interfaces
│       └── routes/             # Route definitions
│
├── scripts/
│   └── dev.sh                  # Dev utility script
│
├── .github/
│   ├── workflows/              # CI pipelines
│   ├── ISSUE_TEMPLATE/         # Bug & feature templates
│   └── PULL_REQUEST_TEMPLATE.md
│
└── docs/                       # Internal documentation
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| MongoDB | 7+ (local or Docker) |
| Git | 2.x |

### 1. Clone & Install

```bash
git clone https://github.com/md-muntasir-shihab/Campusway-BD.git
cd Campusway-BD

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit .env files with your MongoDB URI, JWT secrets, etc.
```

### 3. Start Development

```bash
bash scripts/dev.sh start        # Both servers
bash scripts/dev.sh start:be     # Backend → http://localhost:5003
bash scripts/dev.sh start:fe     # Frontend → http://localhost:5175
```

### 4. Seed Sample Data

```bash
bash scripts/dev.sh seed:exam    # Exam system (hierarchy + questions + sample exam)
bash scripts/dev.sh seed         # All seeders
```

---

## 📋 Dev Commands

| Command | Description |
|---------|-------------|
| `start` | Start backend + frontend |
| `build` | Production build (both) |
| `typecheck` | TypeScript check (both) |
| `lint` | ESLint (both) |
| `test` | Run all tests |
| `test:be` | Backend tests (Jest + fast-check) |
| `test:fe` | Frontend tests (Vitest) |
| `seed` | Run all database seeders |
| `seed:exam` | Exam system seeder only |
| `clean` | Remove build artifacts |
| `check` | Full pre-push check |
| `db:start` | Start MongoDB via Docker |

> Run via `bash scripts/dev.sh <command>` or `npm run <command>`

---

## 🔑 Environment Variables

<details>
<summary><strong>Backend</strong> (<code>backend/.env</code>)</summary>

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5003` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/campusway` |
| `JWT_SECRET` | JWT signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh token secret | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `CORS_ORIGIN` | Allowed origins | `http://localhost:5175` |
| `UPSTASH_REDIS_REST_URL` | Redis cache URL | — |
| `NODE_ENV` | Environment | `development` |

</details>

<details>
<summary><strong>Frontend</strong> (<code>frontend/.env</code>)</summary>

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_PROXY_TARGET` | Backend URL for dev proxy | `http://127.0.0.1:5003` |
| `VITE_ADMIN_PATH` | Admin panel secret path | — |
| `VITE_USE_MOCK_API` | Enable mock API | `false` |

</details>

---

## 👥 User Roles

| Role | Access Level | Key Capabilities |
|:----:|:------------|:-----------------|
| 🔴 `superadmin` | Full access | Bypasses all restrictions |
| 🟠 `admin` | Admin panel | User management, exams, analytics, settings |
| 🟡 `examiner` | Content creation | Create questions, exams, groups; earn revenue |
| 🟢 `student` | Student portal | Take exams, practice, battle, track progress |
| 🔵 `chairman` | University oversight | Chairman dashboard, reports |

---

## 🧪 Testing

| Layer | Tool | Coverage |
|-------|------|----------|
| Backend unit | Jest + mongodb-memory-server | Service logic, model validation |
| Property-based | fast-check | 35 correctness properties |
| Frontend unit | Vitest + RTL | Component rendering, hooks |
| E2E | Playwright | Full user flows |

```bash
bash scripts/dev.sh test         # All tests
bash scripts/dev.sh test:be      # Backend only
bash scripts/dev.sh test:fe      # Frontend only
```

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

- 🔐 JWT with refresh token rotation
- 🛡️ CSRF double-submit cookies
- ⏱️ Rate limiting (100 req/min per user)
- 🧹 Input sanitization (express-mongo-sanitize)
- ✅ Zod validation on all endpoints
- 🪖 Helmet security headers
- 🔍 Anti-cheat monitoring
- 📝 Audit logging

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

[MIT License](LICENSE) — Copyright (c) 2024-2026 Md. Muntasir Shihab

---

<div align="center">

**Built with ❤️ for Bangladeshi students**

*CampusWay — শিক্ষার নতুন দিগন্ত*

[![GitHub](https://img.shields.io/badge/GitHub-md--muntasir--shihab-181717?style=flat-square&logo=github)](https://github.com/md-muntasir-shihab)

</div>
