import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Tests must never run against the dev/seed database: every test file
// creates and mutates real rows (roles, users, branches, audit logs) and
// some (e.g. tests/auditService.test.ts) truncate whole tables. Point the
// test run at a dedicated `bellamakeup_test` database instead, so
// `npx vitest run` can be run safely at any time — including right after
// seeding, as Task 25's own workflow does — without corrupting the data an
// admin is about to manually verify in the browser.
//
// `.env.test` is loaded here (into Vitest's `test.env`) rather than relying
// on src/config/prisma.ts's own dotenv.config() call, because that call
// loads `.env` unconditionally and dotenv does not override an already-set
// process.env value — so setting DATABASE_URL via `test.env` before test
// modules import the Prisma client is what makes the override stick.
const testEnv = dotenv.config({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [],
    env: testEnv,
    // The suite runs 13 files in parallel, each doing real Postgres round
    // trips plus synchronous bcrypt hashing (cost 10, ~100-300ms per call,
    // and several tests hash more than one password). Under normal Task-25
    // conditions — backend + frontend dev servers and Docker Desktop all
    // running at the same time as the tests — that parallel CPU contention
    // occasionally pushes an individual test or beforeAll hook past
    // Vitest's 5s/10s defaults even though nothing is actually broken (the
    // same file reliably finishes in under 1s run in isolation). Give both
    // more headroom rather than papering over flakes with retries.
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
