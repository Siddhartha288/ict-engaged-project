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
- Activity log: failed logins, lockouts, password changes and every admin action, with time and IP.
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
- **AI:** roadmap wording from Google Gemini (free tier available) or Anthropic Claude via `backend/services/aiService.js`, with an automatic rule-based fallback when no key is set or a call fails
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
| `GEMINI_API_KEY` | Optional. Free key from https://aistudio.google.com. Preferred provider when set |
| `ANTHROPIC_API_KEY` | Optional. Used if no Gemini key (or `AI_PROVIDER=anthropic`) |
| `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `AI_PROVIDER` | Optional overrides (defaults: `gemini-flash-lite-latest`, `claude-sonnet-5-5`, Gemini first) |

With neither key set, roadmaps come from the built-in rule-based generator. Each saved roadmap records which engine wrote it (`generated_by`), and the dashboard shows it. Run `cd backend && npm run ai:check` to verify a key: it lists the models the key can use and writes a sample roadmap.
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

### 5. Optional: demo data

```bash
cd backend
node seed-demo.js            # 15 demo businesses, 1 advisor, 1 unclaimed client
node seed-demo.js --remove   # delete all demo data again
```

Gives benchmarking, progress tracking and the advisor cohort report real numbers to show. Everything is clearly labelled: emails end in `@demo.biztransform.test` and business names end in "(demo)". It uses the real API (so scoring and roadmaps are the real code), then backdates timestamps so the history spans several weeks. The shared demo password is printed when it finishes. Website checks in the demo data use fake `.example` addresses.

## Testing and linting

```bash
cd backend && npm test        # 56 tests: auth, RBAC, scoring, roadmap, benchmark, advisor flows, admin, security, AI provider, SSRF
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

The live site runs under pm2 behind the host's reverse proxy. Database changes on a live system should be **additive** (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`) — don't re-run `db:setup`, which would wipe real users. When upgrading an existing database, run `node migrate-security.js` (idempotent; adds the `audit_log` table and `users.password_changed_at`) **before** restarting the server.

## API overview

All routes are under `/api`. "Auth" means a valid, active user; role requirements are enforced on every route.

| Area | Routes | Access |
|------|--------|--------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/claim` | Public |
| Account | `POST /auth/change-password` | Auth |
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
- Admins cannot self-register, cannot deactivate themselves, and cannot change their own role (so an admin always remains).
- **Failed-login logging and rate limiting.** Failed logins, lockouts, password changes and admin actions are recorded in the `audit_log` table (never the password) and shown to admins on the Activity tab. After 8 failed attempts on one account, or 30 from one IP, within 15 minutes, login returns `429` with a `Retry-After` header; a success resets the account counter. The counters are in memory, so they reset when the server restarts, and they assume one server process.
- **Change password** requires the current password, and ends every session issued before the change (the browser doing the change gets a fresh token). Passwords must be at least 8 characters.
- A **privacy notice** (`/privacy`, linked from the footer and registration) describes what is collected and who can see it.
- The website audit fetches user-supplied URLs, so it is hardened against SSRF: http(s) only, public IPs only (loopback, private ranges and cloud-metadata addresses are refused), every redirect hop re-validated, with response-size and time limits.

## Known limitations

- No email, so there is no "forgot password" reset or email notification. A user who forgets their password needs an admin or the project team to reset it directly in the database.
- Advisor access is broad: any advisor account can view any business (assessments, roadmaps, website checks, notes), and anyone can register as an advisor. Restricting advisors to their own caseload would be the next hardening step. The privacy notice says so.
- Claiming an advisor-created account needs only the client's email address (there is no email verification), so an advisor should tell the client to claim it promptly.
- Login rate limiting is in memory and per process (see Security notes).
- On the live site no AI key is configured, so roadmaps use the rule-based generator. The AI path is implemented and unit-tested against a stubbed network, but the Gemini free tier is rate-limited (and Google may use free-tier prompts to improve its products), so any AI failure silently falls back to the rule-based roadmap.
- Scope versus the ICT313 proposal: three roles are implemented (business, advisor, admin). The proposal's Employee, Customer, and Supplier roles, and its operations/ROI-analytics workflows beyond the roadmap, are not built.

## Project structure

```
backend/
  server.js               app setup; exports the app for tests
  db.js                   MySQL pool
  schema.sql              tables + sector/category seed (destructive)
  seed-questions.js       the 135 sector questions and tips
  create-admin.js         create/promote an admin
  migrate-security.js     additive, idempotent migration for existing databases
  seed-demo.js            labelled demo data (--remove to delete)
  routes/                 auth, assessments, roadmap, admin (advisor), platform (admin), notes, audit, sectors
  middleware/             auth.js (authentication + role checks), rateLimit.js (login throttling)
  services/               aiService.js, websiteAudit.js, resourceLinks.js, auditLog.js
  test/                   API and SSRF tests
frontend/
  src/pages/              Landing, Login, Register, Claim, Assessment, Dashboard,
                          AdvisorPortal, BusinessDetail, BusinessReport, AdvisorRunAssessment,
                          AdminPortal, Account, Privacy, ProblemsAndSolutions
  src/components/         charts, roadmap cards, website audit card, navbar, theme toggle
  src/context/            auth and theme state
```
