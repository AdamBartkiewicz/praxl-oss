# Contributing to Praxl

## Development Setup

1. **Prerequisites:** Node.js 20+, PostgreSQL 16+

2. **Clone and install:**
   ```bash
   git clone https://github.com/YourOrg/praxl-oss.git
   cd praxl-oss
   npm install
   ```

3. **Database:**
   ```bash
   # Start PostgreSQL (or use docker)
   docker run -d --name praxl-db -e POSTGRES_USER=praxl -e POSTGRES_PASSWORD=praxl -e POSTGRES_DB=praxl -p 5432:5432 postgres:16-alpine
   ```

4. **Environment:**
   ```bash
   cp .env.example .env
   # Edit .env:
   # DATABASE_URL=postgresql://praxl:praxl@localhost:5432/praxl
   # AUTH_SECRET=dev-secret-change-in-production
   ```

5. **Run:**
   ```bash
   npm run dev
   ```

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- tRPC for all API calls (no raw fetch in components)
- Drizzle ORM for all database queries
- Tailwind CSS for styling

## Pull Requests

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes and ensure `npm run build` passes
4. Submit a PR with a clear description

## Project Structure

```
src/
├── app/           # Next.js pages and API routes
├── server/        # tRPC routers (business logic)
├── db/            # Schema and database connection
├── lib/           # Shared utilities
│   ├── auth/      # Authentication system
│   ├── plans.ts   # Feature configuration
│   └── ...
└── components/    # React UI components
```

## Key Files

- `src/server/routers/` - All backend logic (skills, sync, AI, org, etc.)
- `src/db/schema.ts` - Database schema (22 tables)
- `src/lib/auth/` - JWT auth system
- `src/middleware.ts` - Route protection
