# 🤝 Contributing to CampusWay

Thank you for your interest in contributing! This guide will help you get started.

---

## 🚀 Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Install** dependencies: `cd backend && npm install && cd ../frontend && npm install`
4. **Create** a feature branch: `git checkout -b feat/your-feature`

## 📐 Coding Conventions

### File Naming
| Type | Convention | Example |
|------|-----------|---------|
| Models & Components | PascalCase | `User.ts`, `ExamRunner.tsx` |
| Services & Utils | PascalCase | `GamificationService.ts` |
| Hooks | camelCase with `use` prefix | `useExamQueries.ts` |
| Routes | kebab-case with `.routes` | `battle.routes.ts` |
| Validators | kebab-case with `.validator` | `exam.validator.ts` |

### Backend Patterns
- **Controllers** stay thin — delegate to services
- **Services** contain business logic
- **Zod schemas** validate all request bodies
- **ResponseBuilder** for consistent API responses
- Middleware chain: `authenticate → requirePermission → zodValidate → controller`

### Frontend Patterns
- **Lazy loading** for all page components
- **TanStack Query** for server state management
- **TailwindCSS** for styling (no inline styles, no CSS modules)
- **Lucide React** for icons
- All pages support **dark mode** via `dark:` variants

## 📝 Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add battle mode leaderboard
fix: correct score computation for negative marks
chore: update dependencies
docs: add API documentation
refactor: extract question filter logic
test: add property tests for streak tracking
```

## ✅ Before Submitting a PR

```bash
bash scripts/dev.sh check
# Runs: typecheck + lint + test
```

## 🔄 Pull Request Process

1. Keep PRs **focused** — one feature or fix per PR
2. Write a **clear description** of what changed and why
3. Add/update **tests** if you change behavior
4. Ensure all **CI checks pass**
5. Request review from a maintainer

## 🐛 Reporting Bugs

Use the [Bug Report template](https://github.com/md-muntasir-shihab/Campusway-BD/issues/new?template=bug_report.md).

## 💡 Suggesting Features

Use the [Feature Request template](https://github.com/md-muntasir-shihab/Campusway-BD/issues/new?template=feature_request.md).
