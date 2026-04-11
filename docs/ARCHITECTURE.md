# Architecture

This document describes the internals of Praxl OSS for contributors. For
end-user docs, see the [main README](../README.md) and the [user docs
site](https://praxl.app/docs).

## Tech stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 16 (App Router)             |
| API         | tRPC 11 (type-safe, 100+ procedures)|
| Database    | PostgreSQL 16 + Drizzle ORM         |
| Auth        | Built-in JWT + bcrypt (no external) |
| AI          | Anthropic Claude (optional)         |
| UI          | Tailwind CSS 4 + shadcn/ui          |
| Editor      | Monaco (VS Code engine)             |
| Container   | Docker Compose (db + migrate + app) |

## Repository layout

```
praxl-oss/
├── src/
│   ├── app/                       Next.js App Router pages + API routes
│   │   ├── skills/                Skill CRUD, editor, detail view
│   │   ├── projects/              Project (skill grouping)
│   │   ├── sync/                  Multi-platform deployment
│   │   ├── ai-studio/             AI review + generation
│   │   ├── marketplace/           Browse + install community skills
│   │   ├── org/                   Team workspace management
│   │   ├── analytics/             Usage metrics
│   │   ├── settings/              Plan, billing, API keys
│   │   ├── admin/                 Admin panel (gated by ADMIN_USER_IDS)
│   │   └── api/
│   │       ├── auth/              JWT login / register / logout / me
│   │       ├── cli/                CLI communication (10 endpoints)
│   │       ├── ai/                 Anthropic proxy + streaming chat
│   │       ├── clawhub/            ClawHub marketplace integration
│   │       └── trpc/               tRPC handler (single endpoint)
│   │
│   ├── server/routers/            tRPC business logic (10 routers)
│   │   ├── skills.ts              Skill CRUD, sharing, versioning
│   │   ├── sync.ts                Multi-platform deployment + sync targets
│   │   ├── ai.ts                  AI review, generation, marketplace AI search
│   │   ├── org.ts                 Teams & organizations
│   │   ├── analytics.ts           Usage analytics
│   │   ├── chat.ts                AI chat history
│   │   ├── files.ts               Reference files (scripts, templates, assets)
│   │   ├── settings.ts            User settings + encrypted API keys
│   │   ├── projects.ts            Project CRUD
│   │   └── dataRequests.ts        GDPR data export / deletion
│   │
│   ├── db/
│   │   ├── schema.ts              20 PostgreSQL tables
│   │   └── index.ts               Lazy drizzle client (Proxy)
│   │
│   ├── lib/
│   │   ├── auth/                  JWT verify, session, middleware
│   │   ├── encryption.ts          AES-256-GCM for at-rest secrets
│   │   ├── sync-engine.ts         File system writer + path validators
│   │   └── plans.ts               Plan limits + assertCanCreate helpers
│   │
│   └── components/                shadcn/ui + custom components
│
├── docker-compose.yml             3-service stack: db + migrate + app
├── Dockerfile                     Multi-stage Node 20 + Next standalone
├── drizzle.config.ts              Schema source + migration config
└── SETUP-WITH-AI.md               AI agent deployment guide
```

## Database schema

20 tables, full schema in [`src/db/schema.ts`](../src/db/schema.ts).
Key entities:

- **users** — accounts (id, email, name, password_hash, image_url)
- **skills** — SKILL.md content (slug, name, description, content, tags, versions)
- **skill_versions** — full history per skill (immutable)
- **skill_files** — reference files attached to skills
- **projects** — skill grouping
- **organizations** + **org_members** — team workspaces with roles
- **org_skill_shares** — explicit sharing model (skills stay personal)
- **sync_targets** — per-tool deployment config (basePath, isActive)
- **sync_log** — every deploy operation
- **skill_change_requests** — PR-style review workflow for org skills
- **app_settings** — per-user settings + encrypted API keys
- **ai_usage** — per-user AI quota tracking
- **email_sends** — deduped transactional email log (cloud only)

## Auth model

- Built-in email/password (no external auth provider needed)
- Password hashing: bcrypt 12 rounds
- Session: JWT signed with `AUTH_SECRET` (env), 30-day expiry
- Storage: HttpOnly cookie `praxl_session`
- Verification: middleware checks cookie shape only (jsonwebtoken doesn't
  work in Next.js edge runtime); full verification happens in API routes
  via `getSession()` helper

## Sync engine

Located in `src/lib/sync-engine.ts`. Two responsibilities:

1. **Validate** — `isBasePathSafe()` regex check rejects anything outside
   `~/.<dot-folder>/skills/...` patterns. `ALLOWED_FILE_EXTENSIONS` allowlist
   blocks executable extensions.
2. **Write** — `writeSkillToPath()` writes SKILL.md + reference files to a
   target directory. Catches filesystem errors gracefully (works on
   serverless where FS is read-only).

The CLI (`praxl-app` on npm) is a separate package that polls the cloud
or self-hosted instance via `/api/cli/*` endpoints and applies the same
validation locally. See [praxl-cli repo](https://github.com/AdamBartkiewicz/praxl-cli).

## CLI ↔ Server protocol

CLI talks to server via REST endpoints under `/api/cli/`:

- `POST /api/cli/heartbeat` — every 15s, reports CLI status, receives
  pending commands (sync / disconnect / import — whitelisted)
- `GET /api/cli/sync` — list of skills to pull down
- `POST /api/cli/import` — push local skills up
- `GET /api/cli/config` — fetches user's sync targets
- `POST /api/cli/change-request` — submit local edits as a change request

Auth: `x-praxl-token` header containing the user's session JWT.

## Security model

Documented in detail at [praxl.app/security](https://praxl.app/security).
Brief summary:

- **Two independent validation layers** — server (regex) + CLI client
  (allowlist + trust-path opt-in) both enforce the same constraints with
  different logic
- **Sensitive at-rest data** encrypted with AES-256-GCM (`ENCRYPTION_KEY`)
- **Audit log** in CLI at `~/.praxl/audit.log` for all server commands
- **No telemetry** in self-hosted edition

## Where to start when contributing

1. Open a discussion or issue describing your idea before coding
2. Follow the existing patterns in `src/server/routers/` for new tRPC procedures
3. Add tests if you touch business logic in `src/server/routers/` or
   `src/lib/sync-engine.ts`
4. Run `npm run build` locally to verify your change doesn't break the
   Next.js production build

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor guide.
