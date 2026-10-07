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
- Run an automated **website audit** (HTTPS, mobile-friendliness, title/meta description, social links, payment-script detection, contact details, privacy/terms link, response time) — no self-reporting involved.
- Read notes left by their advisor, and link or unlink an advisor themselves (Account page) — no advisor sees a business's data until it is linked.
- Step-by-step "How to do this" checklists on each roadmap action, plus in-app reminders to re-assess and to finish a stale roadmap.
- Create a read-only **share link** to the latest report (14-day expiry, revocable; shows no owner details or cost figures).
- Sector benchmarks are only shown with at least 3 businesses, and are labelled when the sample is small or includes demo data.
- Forgot-password flow, change password, and delete their own account (with all linked data).

**Advisors**
- Get a personal invite code/link; businesses that register with it (or enter the code later) join their caseload. **Advisors only ever see their own clients.**
- Add a client and run the assessment with them live; the client later claims the account with their email plus a one-time **claim code** the advisor hands over (shown once, stored hashed).
- Search/filter the caseload, tag follow-up status, leave notes, export CSV.
- View a client's detail page (history, trend, benchmark, roadmap, audit) and a printable one-page report.
- See cohort impact: caseload size, average score, and average improvement from first to latest assessment.

**Admins**
- Site-wide stats; search users; activate/deactivate accounts; promote/demote admins.
- Activity log: failed logins, lockouts, password changes and resets, claim attempts, advisor links, share links, deletions and every admin action, with time and IP.
- Issue a one-time **password reset link** for a locked-out user (works without email).
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
cd backend && npm test        # 74 tests: auth, RBAC, scoring, roadmap, benchmark, advisor flows, admin, security, AI provider, SSRF
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

The live site runs under pm2 behind the host's reverse proxy. Database changes on a live system should be **additive** (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`) — don't re-run `db:setup`, which would wipe real users. When upgrading an existing database, run the migrations in order **before** restarting the server (both are idempotent and never touch existing rows): `node migrate-security.js` (`audit_log`, `users.password_changed_at`), then `node migrate-realism.js` (claim codes, reminders, password resets, share links, extra audit checks).

## API overview

All routes are under `/api`. "Auth" means a valid, active user; role requirements are enforced on every route.

| Area | Routes | Access |
|------|--------|--------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/claim` (email + claim code), `POST /auth/forgot-password`, `POST /auth/reset-password` | Public |
| Account | `POST /auth/change-password`, `DELETE /auth/account`; business: `GET/POST/DELETE /auth/advisor` | Auth |
| Reminders | `GET /reminders` | Business |
| Share | `POST/GET /share`, `DELETE /share/:id` (owner, or the owning advisor); `GET /shared/:token` | Auth / public read-only |
| Sectors | `GET /sectors` | Public |
| Assessment | `GET /questions`, `POST /assessments`, `GET /assessments`, `GET /assessments/:id`, `GET /assessments/:id/benchmark` | Auth (owner or their linked advisor) |
| Roadmap | `POST/GET /assessments/:id/roadmap`, `PATCH /assessments/:id/roadmap/actions/:index` | Auth (owner or their linked advisor) |
| Website audit | `POST /audit`, `GET /audit` | Business |
| Notes | `GET /notes/:businessId` (owner or their linked advisor), `POST /notes/:businessId` | Linked advisor to post |
| Advisor | `GET/POST /admin/businesses`, `GET /admin/businesses/:id`, `…/:id/questions`, `…/:id/assessments`, `POST …/:id/claim-code`, `PATCH …/:id/status`, `GET /admin/impact` (own clients only) | Advisor |
| Admin | `GET /platform/stats`, `GET /platform/users`, `PATCH /platform/users/:id/active`, `PATCH /platform/users/:id/role`, `POST /platform/users/:id/reset-link`, `GET /platform/activity`, `GET /platform/questions`, `PATCH /platform/questions/:id` | Admin |

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
- **Advisors are scoped to their own clients.** A business's data (assessments, roadmaps, notes, website checks) is visible only to that business and the advisor it is linked to; anything else returns "not found". A business controls its own link on the Account page.
- **Claim codes, reset tokens and share tokens are random (256 bits for tokens) and stored only as SHA-256 hashes.** Reset links expire after an hour and work once; share links expire after 14 days and can be revoked; claim and reset attempts are rate-limited and audited. A password reset also ends older sessions and clears a login lockout.
- A **privacy notice** (`/privacy`) and **terms of use** (`/terms`), linked from the footer and registration, describe what is collected, who can see it and what to expect.
- The website audit fetches user-supplied URLs, so it is hardened against SSRF: http(s) only, public IPs only (loopback, private ranges and cloud-metadata addresses are refused), every redirect hop re-validated, with response-size and time limits.

## Known limitations

- **Email is optional and off by default.** Set `RESEND_API_KEY` and `EMAIL_FROM` to send password-reset emails and reminder emails (`node send-reminders.js`, run daily from a scheduler; `--dry-run` lists who is due). Without them nothing is emailed: admins issue reset links, and reminders appear in the dashboard. On Resend's free plan without a verified domain you can only email your own address. Email addresses are not verified at registration.
- Anyone can register as an advisor, but an advisor sees no business until that business links to them or they add the client themselves.
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
  migrate-security.js     additive, idempotent migration (audit log, password_changed_at)
  migrate-realism.js      additive, idempotent migration (claim codes, resets, share links, reminders)
  send-reminders.js       emails businesses that have gone quiet (needs email configured)
  ai-check.js             checks an AI key and writes a sample roadmap (npm run ai:check)
  seed-demo.js            labelled demo data (--remove to delete)
  routes/                 auth, assessments, roadmap, admin (advisor), platform (admin), notes, audit, sectors, share, reminders
  middleware/             auth.js (authentication + role checks), rateLimit.js (login throttling)
  services/               aiService.js, websiteAudit.js, resourceLinks.js, auditLog.js, access.js, tokens.js, email.js, reminders.js, passwordReset.js
  test/                   API, security, AI, email, advisor-scoping/share/reset/reminder and SSRF tests
frontend/
  src/pages/              Landing, Login, Register, Claim, Assessment, Dashboard,
                          AdvisorPortal, BusinessDetail, BusinessReport, AdvisorRunAssessment,
                          AdminPortal, Account, Privacy, ProblemsAndSolutions
  src/components/         charts, roadmap cards, website audit card, navbar, theme toggle
  src/context/            auth and theme state
```
