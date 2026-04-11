# Deploy Praxl with an AI Agent

> **This file is an instruction set designed for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.).**
> Copy the entire content below and paste it as a prompt to your AI agent along with a link to this repo.
> A non-technical user should be able to deploy Praxl by simply asking their AI agent to follow these instructions.

---

## Prompt to paste into your AI agent:

```
I want to deploy Praxl - an open-source AI skill manager - on my machine.

Repository: https://github.com/AdamBartkiewicz/praxl-oss

Follow this deployment guide exactly. Ask me questions if you need my input.
Do not skip steps. Confirm each major step before proceeding.

### STEP 1: Check prerequisites

First, ask the user what OS they are on (macOS / Linux / Windows+WSL) — branching depends on it.

Then check the following are installed:
- git (run: git --version)
- openssl (run: openssl version)
- Docker AND Docker Compose v2 (run: docker --version && docker compose version)
  - OR Node.js 20+ AND PostgreSQL 16+ (run: node --version && psql --version)

Decision tree:
- If Docker is available → use STEP 4A (Docker path, recommended).
- If only Node.js is available → use STEP 4B (manual path).
- If neither → help the user install Docker Desktop first:
  - macOS: https://docs.docker.com/desktop/install/mac-install/
  - Windows: https://docs.docker.com/desktop/install/windows-install/
  - Linux: https://docs.docker.com/engine/install/

IMPORTANT — Docker daemon must be running before any `docker` command:
- macOS: open -a Docker  (then wait ~10 seconds for the daemon)
- Windows: launch Docker Desktop from the Start menu
- Linux: sudo systemctl start docker  (or it auto-starts after install)

Verify the daemon is up:
  docker ps
If this returns "Cannot connect to the Docker daemon", the daemon isn't running yet — wait or restart Docker Desktop.

### STEP 2: Clone the repository

git clone https://github.com/AdamBartkiewicz/praxl-oss.git
cd praxl-oss

### STEP 3: Create the environment file

cp .env.example .env

Now you need to set AUTH_SECRET to a real random value. The default in
.env.example is the literal string "change-me-to-a-random-string" which
will cause the app to refuse to start.

3a-b. Generate a secret AND replace AUTH_SECRET in one command. This is
important for AI agents whose Bash tool starts a fresh shell on every
invocation — environment variables don't persist between calls, so the
generation and substitution must happen in the same shell command.

  macOS (one line):
    sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env

  Linux (one line):
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env

  (Or open .env in any editor and paste a fresh `openssl rand -base64 32`
   value into the AUTH_SECRET line manually.)

3c. Verify the secret is set (NOT the placeholder anymore):
  grep ^AUTH_SECRET .env
  (should NOT contain "change-me-to-a-random-string"; the value should be
   ~44 characters of base64)

3d. Confirm NEXT_PUBLIC_APP_URL is correct:
  grep ^NEXT_PUBLIC_APP_URL .env
  Default is http://localhost:3000 — leave it as-is unless you're deploying
  to a real domain.

NOTE — DATABASE_URL: As of the latest .env.example, DATABASE_URL is commented
out by default (this is correct). Docker Compose injects it automatically with
the right internal hostname (db, not localhost). Leave that line commented.
If you see an UNcommented DATABASE_URL in .env, comment it out:
  sed -i '' 's|^DATABASE_URL=|# DATABASE_URL=|' .env  (macOS)
  sed -i    's|^DATABASE_URL=|# DATABASE_URL=|' .env  (Linux)

### STEP 4A: Deploy with Docker (preferred)

4a-1. Port collision check — port 3000 is the most common Next.js dev port
and may be in use. Check:
  lsof -i :3000  (macOS/Linux)
  netstat -ano | findstr :3000  (Windows)

If port 3000 is busy:
- Edit docker-compose.yml: change "3000:3000" to "3001:3000" (or another free port)
- Update NEXT_PUBLIC_APP_URL in .env to match: http://localhost:3001
  macOS:  sed -i '' 's|localhost:3000|localhost:3001|' .env
  Linux:  sed -i    's|localhost:3000|localhost:3001|' .env

NOTE on port 5432 (Postgres): the db service is intentionally NOT published
to the host in docker-compose.yml. It's only reachable inside the Docker
network. So even if you have a local PostgreSQL on 5432, there's no collision.

4a-2. Build and start:
  docker compose up -d --build

Wait for the build to complete (2-5 minutes first time, faster on rebuilds).
The first build downloads Node + Postgres images and runs `npm ci` — be patient.

4a-3. Three services will start in order:
1. db (PostgreSQL) — starts first, waits for healthy
2. migrate (creates database tables) — runs once and exits with code 0
3. app (Next.js) — starts after migration completes successfully

Check status:
  docker compose ps

Expected:
- db:      running (healthy)
- migrate: exited (0)   ← THIS IS NORMAL — exit 0 means migrations succeeded
- app:     running

If `migrate` shows a non-zero exit code, the database didn't migrate. Check:
  docker compose logs migrate --tail 50

4a-4. Health check:
  curl -sS http://localhost:3000/api/health
  (use -sS so curl shows errors but suppresses progress bar)

Expected response (JSON):
  {"status":"ok","database":"connected"}

If you don't see this:
- App logs:    docker compose logs app --tail 50
- Migrate logs: docker compose logs migrate --tail 50
- If "relation does not exist" — migration didn't run. WARNING: the next
  command WIPES the database (which is fine on fresh install but destructive
  if you already have data):
    docker compose down -v && docker compose up -d --build

### STEP 4B: Deploy manually (if no Docker)

4b-1. Install dependencies:
  npm install

4b-2. Make sure PostgreSQL is running and create a database. The exact
command depends on how Postgres is installed:
  createdb praxl                                  (if your shell user has Postgres rights)
  psql -U postgres -c "CREATE DATABASE praxl;"    (if you need to use postgres superuser)

4b-3. Set DATABASE_URL in .env (uncomment it AND fill in real credentials):
  Edit .env, find the commented "# DATABASE_URL=..." line, uncomment it,
  and replace with your actual user/password/host:
    DATABASE_URL=postgresql://your_user:your_password@localhost:5432/praxl

4b-4. CRITICAL — Create database tables. drizzle-kit push is interactive
by default and will ask whether to apply pending schema changes. Use the
non-interactive flag so AI agents don't hang waiting on stdin:
  npx drizzle-kit push --force

If --force is not recognized on your drizzle-kit version (very old releases),
fall back to piping `yes` so any "do you want to proceed?" prompts get an
automatic yes:
  yes | npx drizzle-kit push

(There is no `--strict=false` flag in drizzle-kit — ignore any guide that
mentions one.)

4b-5. Start the dev server:
  npm run dev

This runs in the foreground. To restart, kill it with Ctrl+C and run again.
For long-running deployments, use a process manager (pm2, systemd) instead.

4b-6. Test in a separate terminal:
  curl -sS http://localhost:3000/api/health

### STEP 5: Create the first account

⚠️ STOP HERE — USER ACTION REQUIRED ⚠️

You (the AI agent) cannot do this step. Tell the user explicitly:

  "The server is running. I need you to do this manually:
   1. Open this URL in your browser: http://localhost:3000/sign-up
      (or http://localhost:3001/sign-up if you changed the port in step 4a-1)
   2. Enter a name, email, and password (minimum 8 characters)
   3. Submit the form
   4. You should be redirected to the Dashboard with a sidebar on the left
      showing: Dashboard, Skills, Projects, Sync, AI Studio, Settings, etc.
   5. Tell me 'done' or 'logged in' when you see the dashboard, and we'll
      continue."

WAIT for the user to confirm before proceeding to step 6.

If the user reports they see the sign-in page instead of the dashboard
after registering:
- Tell them to clear browser cookies for localhost
- Tell them to try in an incognito/private window
- Tell them to register again

### STEP 6: Set up admin access (optional but recommended for first user)

Now that the user has created their account, get their user ID from the
database. They become the workspace admin (sees an Admin Panel in the sidebar).

6a. Get the user ID:

For Docker:
  docker compose exec db psql -U praxl -d praxl -c "SELECT id, email FROM users;"

For manual install:
  psql -U praxl -d praxl -c "SELECT id, email FROM users;"

The output looks like:
                   id                   |       email
  --------------------------------------+----------------------
   a1c1204d-e8d3-4ca0-a1c0-9614fea60990 | user@example.com

Copy the UUID from the `id` column.

6b. Set ADMIN_USER_IDS in .env. There is only ONE variable to set —
the admin flag is computed server-side from this and returned by
/api/auth/me. The client never sees the raw list, so no NEXT_PUBLIC_*
mirror is needed (this used to require a full image rebuild, fixed
in commit 44258e1+).

  Replace `YOUR-UUID-HERE` below with the actual UUID from step 6a:

  macOS:
    sed -i '' "s|^ADMIN_USER_IDS=.*|ADMIN_USER_IDS=YOUR-UUID-HERE|" .env

  Linux:
    sed -i "s|^ADMIN_USER_IDS=.*|ADMIN_USER_IDS=YOUR-UUID-HERE|" .env

Verify:
  grep ^ADMIN_USER_IDS .env
  (should show ADMIN_USER_IDS=<the-uuid>, not empty)

6c. Apply the new env var. IMPORTANT: this is NOT a `restart` —
docker compose restart does NOT re-read env_file. You need to
recreate the container so it picks up the new .env contents:

  Docker:  docker compose up -d --force-recreate app
  Manual:  Ctrl+C the `npm run dev` process and run `npm run dev` again

(If you see the guide say `docker compose restart app` somewhere,
it's wrong — restart keeps the old environment. The container must
be recreated to re-read .env.)

⚠️ STOP HERE — USER ACTION REQUIRED ⚠️
Tell the user: "I've enabled admin access. Hard-refresh your browser
(Cmd+Shift+R / Ctrl+Shift+R) and tell me if you now see 'Admin Panel'
in the sidebar."

### STEP 7: Verify everything works

Open the app and check these things:
1. Sidebar is visible with navigation (Dashboard, Skills, Projects, Sync, etc.)
2. Create a new skill: go to /skills/new, enter a name and content, save
3. The skill appears in /skills
4. Admin panel loads: go to /admin (only if you set ADMIN_USER_IDS)
5. Health check: curl http://localhost:3000/api/health returns {"status":"ok"}

### STEP 8: Connect the CLI (optional)

Install the Praxl CLI globally:
npm install -g praxl-app

Get your connection token from the app:
- In the browser, the onboarding wizard shows the full command
- OR get it manually: open browser dev tools, go to Network tab,
  visit /api/cli/token - the response has your token

Connect (replace TOKEN and URL with your values):
praxl connect --token YOUR_TOKEN --url http://localhost:3000

The CLI will:
- Discover existing SKILL.md files on your machine
- Start bidirectional sync
- Show "Watching for changes..."

### STEP 9: Enable AI features (optional)

AI features (skill review, generation, chat) need an Anthropic API key.

Option A - Each user provides their own key:
  Users go to Settings in the app and enter their Anthropic API key.
  This is the simplest option.

Option B - Server provides a key for all users:
  1. Get an API key from console.anthropic.com
  2. Add to .env: ANTHROPIC_SERVER_KEY=sk-ant-your-key-here
  3. Restart: docker compose restart app (or restart npm run dev)
  4. All users now have AI features without configuring anything.

Without any key, the app works fine - AI buttons just won't appear.

### STEP 10: Production deployment (optional)

If deploying to a VPS/server (not just localhost):

1. Update NEXT_PUBLIC_APP_URL in .env to your domain (https://praxl.yourdomain.com)
2. Set up a reverse proxy (nginx or caddy) for HTTPS:

   Example Caddy config:
   praxl.yourdomain.com {
     reverse_proxy localhost:3000
   }

3. Optional - cron job for version cleanup:
   echo "CRON_SECRET=$(openssl rand -base64 16)" >> .env
   # Add to crontab:
   0 3 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/trim-versions

4. Optional - encrypt stored API keys:
   echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

5. Optional - database backups:
   0 2 * * * docker compose exec -T db pg_dump -U praxl praxl > /backups/praxl-$(date +\%Y\%m\%d).sql

### Troubleshooting

If the app doesn't start:
- Check logs: docker compose logs app --tail 100
- Check migration: docker compose logs migrate --tail 50
- Make sure .env has AUTH_SECRET set (not the placeholder "change-me...")
- Make sure Docker Desktop is running (macOS: open -a Docker)

If "relation does not exist" error:
- Migration didn't run. Fix: docker compose down -v && docker compose up -d --build
- For manual: run npx drizzle-kit push

If port 3000 is busy:
- Change port in docker-compose.yml: "3001:3000" instead of "3000:3000"
- Update NEXT_PUBLIC_APP_URL in .env to http://localhost:3001

If login doesn't work (redirects back to sign-in):
- Open an incognito/private browser window and try again
- Clear cookies for localhost in your browser
- Check that AUTH_SECRET is set in .env

If sidebar doesn't show after login:
- Do a hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
- Clear cookies and log in again
- Check browser console for errors

If CLI shows "Invalid token":
- Make sure the --url flag points to your running instance
- Get a fresh token from the onboarding page or /api/cli/token
- Make sure the user exists in the database

If skills don't sync to local:
- Make sure CLI is running: praxl connect --url http://localhost:3000
- Check CLI logs: cat ~/.praxl/sync.log
- Verify the CLI version: praxl --version (should be 1.2.1+)
```

---

## What this deploys

Praxl is an AI skill manager that lets you create, version, and deploy SKILL.md files
across Claude Code, Cursor, Copilot, Codex, Windsurf, OpenCode, OpenClaw, and Gemini CLI.

**Features included (all unlocked, no limits):**
- Unlimited skills, projects, and sync targets
- AI-powered skill review and generation (BYO Anthropic key or server key)
- Team workspaces with role-based access
- Marketplace with 13,700+ ClawHub skills
- Bidirectional CLI sync
- Version history with diffs and rollback
- Monaco code editor
- Security scanning
- GDPR tools (data export, account deletion)

**Tech stack:** Next.js 16, tRPC, PostgreSQL, Drizzle ORM, Tailwind CSS

**Requirements:** Docker (recommended) or Node.js 20+ with PostgreSQL 16+

**Auth:** Built-in email/password (JWT + bcrypt). No external service needed.
