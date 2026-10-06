# BizTransform

A digital-transformation platform for small businesses. A business answers a short, **sector-specific** Yes/No assessment, gets a digital-maturity score with a sector benchmark, and receives an action roadmap it can track (progress, cost and expected benefit). **Advisors** manage a caseload of client businesses — running assessments with them, leaving notes, and reporting on aggregate impact — and **admins** run the platform.

Built for ICT313 (aligned to UN SDG 9: Industry, Innovation and Infrastructure).

**Live site:** https://2026s2y.winproject.com.au

## What it does

**Business owners**
- Register with a business sector (9 sectors, each with its own 15-question assessment — 135 questions in total).
- Take the assessment and see an overall score, level, and per-category radar chart (Online Presence, Digital Payments, Marketing, Operations, Data Use).
- Compare against other businesses in the same sector (benchmark).
- Get a prioritised roadmap, mark actions done, and record each action's estimated cost and expected benefit (projected ROI).
- Run an automated **website audit** (HTTPS, mobile-friendliness, title/meta description, social links, payment-script detection, response time) — no self-reporting involved.
- Read notes left by their advisor.

**Advisors**
- Get a personal invite code/link; businesses that register with it join their caseload ("My clients" vs "All businesses").
- Add a client and run the assessment with them live; the client can later claim the account and set a password.
- Search/filter the caseload, tag follow-up status, leave notes, export CSV.
- View a client's detail page (history, trend, benchmark, roadmap, audit) and a printable one-page report.
- See cohort impact: caseload size, average score, and average improvement from first to latest assessment.

**Admins**
- Site-wide stats; search users; activate/deactivate accounts; promote/demote admins.
- Edit question wording and roadmap tips per sector (wording only — adding or removing questions would invalidate past scoring).

## Roles

| Role | How it's created |
|------|------------------|
| `business` | Self-registration (sector required) or created by an advisor |
| `advisor` | Self-registration |
| `admin` | **Not** self-registrable — `node create-admin.js`, or an existing admin promotes a user |

## Stack

- **Frontend:** React 19 (Vite), React Router, Tailwind CSS 4, Recharts, lucide-react, axios
- **Backend:** Node.js + Express
- **Database:** MySQL 8 (`mysql2`, parameterised raw SQL)
- **Auth:** JWT (7-day) + bcrypt
- **AI:** Anthropic Claude via `backend/services/aiService.js`, with a rule-based fallback when no API key is set
- **Tests:** Node's built-in test runner against a real MySQL test database

## Getting started

Prerequisites: Node.js 18+ and MySQL 8+.

### 1. Database

```sql
CREATE DATABASE digitalready CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
cp .env.example .env     # then edit it (see below)
npm install
npm run db:setup         # creates tables + seeds sectors and all 135 questions
npm run dev              # http://localhost:5000
```

> **`npm run db:setup` is destructive:** it drops and recreates every table, so it erases all data. Use it for a fresh setup only.

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 5000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `JWT_SECRET` | Long random string used to sign tokens |
| `ANTHROPIC_API_KEY` | Optional. Without it, roadmaps come from the built-in rule-based generator |
| `FRONTEND_ORIGIN` | CORS origin for the dev frontend (default `http://localhost:5173`) |

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

### 4. Create an admin

```bash
cd backend
node create-admin.js admin@example.com "Admin Name" "a-strong-password"
```

If the email already exists, that account is promoted to admin and its password replaced.

## Testing and linting

```bash
cd backend && npm test        # 38 tests: auth, RBAC, scoring, roadmap, benchmark, advisor flows, admin, SSRF
cd frontend && npm run lint
```

The suite creates a throwaway database named `biztransform_test`, loads the real schema and question bank, runs the real app against it, then drops it. It never touches your configured database.

## Production

The backend serves the built frontend, so a single Node process handles everything:

```bash
cd frontend && npm run build            # outputs frontend/dist
cp -r frontend/dist backend/public      # served by Express, with SPA fallback
cd backend && npm install --omit=dev && node server.js
```

The live site runs under pm2 behind the host's reverse proxy. Database changes on a live system should be **additive** (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`) — don't re-run `db:setup`, which would wipe real users.

## API overview

All routes are under `/api`. "Auth" means a valid, active user; role requirements are enforced on every route.

| Area | Routes | Access |
|------|--------|--------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/claim` | Public |
| Sectors | `GET /sectors` | Public |
| Assessment | `GET /questions`, `POST /assessments`, `GET /assessments`, `GET /assessments/:id`, `GET /assessments/:id/benchmark` | Auth (owner or advisor) |
| Roadmap | `POST/GET /assessments/:id/roadmap`, `PATCH /assessments/:id/roadmap/actions/:index` | Auth (owner or advisor) |
| Website audit | `POST /audit`, `GET /audit` | Business |
| Notes | `GET /notes/:businessId` (owner or advisor), `POST /notes/:businessId` | Advisor to post |
| Advisor | `GET/POST /admin/businesses`, `GET /admin/businesses/:id`, `…/:id/questions`, `…/:id/assessments`, `PATCH …/:id/status`, `GET /admin/impact` | Advisor |
| Admin | `GET /platform/stats`, `GET /platform/users`, `PATCH /platform/users/:id/active`, `PATCH /platform/users/:id/role`, `GET /platform/questions`, `PATCH /platform/questions/:id` | Admin |

## Scoring

Each category score is the percentage of "Yes" answers; the overall score is the average of the five category scores.

| Score | Level |
|-------|-------|
| 0–39 | Foundation Needed |
| 40–59 | Getting Started |
| 60–79 | Digitally Growing |
| 80–100 | Digital Ready |

## Security notes

- Passwords are bcrypt-hashed and never returned by the API. Secrets live in environment variables, not in git.
- Every query is parameterised.
- A user's **role and active-state are read from the database on every request**, not trusted from the token, so deactivation and role changes apply immediately.
- Admins cannot self-register, cannot deactivate themselves, and cannot change their own role (so an admin always remains). Role changes are written to the server log.
- The website audit fetches user-supplied URLs, so it is hardened against SSRF: http(s) only, public IPs only (loopback, private ranges and cloud-metadata addresses are refused), every redirect hop re-validated, with response-size and time limits.

## Known limitations

- No email, so there is no password reset or email notification, and no in-app change-password page yet.
- Login attempts are not rate-limited and failed logins are not logged.
- On the live site no AI key is configured, so roadmaps use the rule-based generator.
- Scope versus the ICT313 proposal: three roles are implemented (business, advisor, admin). The proposal's Employee, Customer, and Supplier roles, and its operations/ROI-analytics workflows beyond the roadmap, are not built.

## Project structure

```
backend/
  server.js               app setup; exports the app for tests
  db.js                   MySQL pool
  schema.sql              tables + sector/category seed (destructive)
  seed-questions.js       the 135 sector questions and tips
  create-admin.js         create/promote an admin
  routes/                 auth, assessments, roadmap, admin (advisor), platform (admin), notes, audit, sectors
  middleware/auth.js      authentication + role checks
  services/               aiService.js, websiteAudit.js, resourceLinks.js
  test/                   API and SSRF tests
frontend/
  src/pages/              Landing, Login, Register, Claim, Assessment, Dashboard,
                          AdvisorPortal, BusinessDetail, BusinessReport, AdvisorRunAssessment,
                          AdminPortal, ProblemsAndSolutions
  src/components/         charts, roadmap cards, website audit card, navbar, theme toggle
  src/context/            auth and theme state
```
