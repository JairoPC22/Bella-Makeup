# BellaBack

Express + TypeScript + Prisma + PostgreSQL backend for Bella Makeup.

## Setup

```bash
docker compose up -d              # starts Postgres
cp .env.example .env              # adjust if needed
npx prisma migrate deploy
npm run prisma:seed               # demo login: admin / BellaAdmin#2026
npm run dev                       # http://localhost:4000
```

## Running tests

Tests run against a **separate, dedicated database** — never against the dev/seed
database. Several test files create/mutate real rows and at least one
(`tests/auditService.test.ts`) truncates a whole table in `beforeEach`; running
against the dev database would silently corrupt whatever an admin is looking at.

One-time setup:

```bash
cp .env.test.example .env.test
docker exec bellaback-postgres-1 psql -U bella -d bellamakeup -c "CREATE DATABASE bellamakeup_test;"
# (container name defaults to "<project-dir>-postgres-1"; check `docker compose ps` if different)

# Apply schema + seed data to the test database specifically, by overriding
# DATABASE_URL inline for these two commands only (dotenv.config() never
# overrides an already-set env var, so this is what makes them target the
# test DB instead of .env's dev DATABASE_URL):
DATABASE_URL="postgresql://bella:bella_dev_password@localhost:5432/bellamakeup_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://bella:bella_dev_password@localhost:5432/bellamakeup_test?schema=public" npx ts-node prisma/seed.ts
```

(On PowerShell, replace the inline `VAR="value" command` form with
`$env:DATABASE_URL = "..."; command`.)

Then, any time:

```bash
npx vitest run
```

`vitest.config.ts` loads `.env.test` and injects its `DATABASE_URL` before any test
file can import the Prisma client, so the suite always targets `bellamakeup_test`. If
`.env.test` is missing or has no `DATABASE_URL`, the run fails immediately with an
explicit error instead of silently falling back to the dev database.
