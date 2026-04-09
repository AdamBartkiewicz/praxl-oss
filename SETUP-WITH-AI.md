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

Check if these are installed on my system:
- Docker and Docker Compose (run: docker --version && docker compose version)
- OR Node.js 20+ and PostgreSQL 16+ (run: node --version && psql --version)

If Docker is available, use the Docker path.
If only Node.js is available, use the manual path.
If neither is available, help me install Docker first.

IMPORTANT: If using Docker on macOS, make sure Docker Desktop is running:
  open -a Docker
Wait a few seconds for it to start before proceeding.

### STEP 2: Clone the repository

git clone https://github.com/AdamBartkiewicz/praxl-oss.git
cd praxl-oss

### STEP 3: Create the environment file

cp .env.example .env

Now generate a secure secret and write it into .env:
- Generate: openssl rand -base64 32
- Set it as AUTH_SECRET in .env
- Set NEXT_PUBLIC_APP_URL to http://localhost:3000 (or my domain if I have one)

The .env file must have at minimum:
AUTH_SECRET=<the-generated-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000

NOTE: Do NOT set DATABASE_URL in .env for Docker - docker-compose.yml
overrides it with the correct internal hostname (db, not localhost).

### STEP 4A: Deploy with Docker (preferred)

IMPORTANT: First check if port 3000 is already in use:
  lsof -i :3000

If port 3000 is busy, edit docker-compose.yml and change "3000:3000" to "3001:3000"
(or another free port). Then update NEXT_PUBLIC_APP_URL in .env to match (e.g. http://localhost:3001).

Run:
docker compose up -d --build

Wait for the build to complete (2-3 minutes first time).

Three services will start:
1. db (PostgreSQL) - starts first, waits for healthy
2. migrate (creates database tables) - runs once and exits
3. app (Next.js) - starts after migration completes

Check status:
docker compose ps

Expected output:
- db: running (healthy)
- migrate: exited (0) - THIS IS NORMAL, it ran successfully
- app: running

Test:
curl -s http://localhost:3000/api/health

Expected: {"status":"ok","database":"connected"}

If health check fails:
- Check app logs: docker compose logs app --tail 50
- Check migration: docker compose logs migrate --tail 50
- If "database does not exist": docker compose down -v && docker compose up -d --build

### STEP 4B: Deploy manually (if no Docker)

Install dependencies:
npm install

Make sure PostgreSQL is running and a database exists:
createdb praxl
# or: CREATE DATABASE praxl;

Set DATABASE_URL in .env:
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/praxl

Create database tables (CRITICAL - app won't work without this):
npx drizzle-kit push

Start the dev server:
npm run dev

Test: curl -s http://localhost:3000/api/health

### STEP 5: Create the first account

Open the app URL in a browser (http://localhost:3000 or :3001 if port was changed).
Go to /sign-up and create an account with name, email, and password (min 8 chars).

After registration, you should be automatically redirected to the dashboard
with a sidebar showing: Dashboard, Skills, Projects, Sync, AI Studio, etc.

If you see the sign-in page instead of the dashboard after registering:
- Clear browser cookies for localhost
- Try in an incognito/private window
- Register again

### STEP 6: Set up admin access

After creating your account, get your user ID from the database.

For Docker:
docker compose exec db psql -U praxl -c "SELECT id, email FROM users;"

For manual:
psql -U praxl -d praxl -c "SELECT id, email FROM users;"

Copy the UUID (looks like: a1c1204d-e8d3-4ca0-a1c0-9614fea60990).

Add to .env (both lines):
ADMIN_USER_IDS=<the-user-id>
NEXT_PUBLIC_ADMIN_USER_IDS=<the-user-id>

Restart:
Docker: docker compose restart app
Manual: restart the npm run dev process

After restart, you should see "Admin Panel" in the sidebar.

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
