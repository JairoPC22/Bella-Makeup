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
//
// If .env.test is missing (fresh clone, CI, a teammate's machine, or this
// file simply got deleted), dotenv.config() fails *silently* and would
// otherwise leave testEnv as {} — meaning no override happens, and
// src/config/prisma.ts's own dotenv.config() call loads the regular dev
// .env's DATABASE_URL instead. Tests would then run straight against the
// dev/seed database with zero warning, silently reproducing the exact
// data-corruption bug (audit log wiped via an unfiltered deleteMany(),
// leaked test rows) this file exists to prevent. Fail fast instead: if
// .env.test can't be read or has no DATABASE_URL, refuse to run at all.
//
// Setup (one-time, per machine): copy .env.test.example to .env.test,
// create a dedicated `bellamakeup_test` Postgres database (e.g.
// `docker exec <postgres-container> psql -U bella -d bellamakeup -c
// "CREATE DATABASE bellamakeup_test;"`), then apply the schema and seed
// data to it by overriding DATABASE_URL inline for those two one-off
// commands (dotenv.config() never overrides an already-set env var, so
// this is what actually makes them target the test DB instead of .env's):
//   DATABASE_URL="postgresql://bella:bella_dev_password@localhost:5432/bellamakeup_test?schema=public" npx prisma migrate deploy
//   DATABASE_URL="postgresql://bella:bella_dev_password@localhost:5432/bellamakeup_test?schema=public" npx ts-node prisma/seed.ts
// (On PowerShell: `$env:DATABASE_URL = "..."; npx prisma migrate deploy`.)
const testEnvResult = dotenv.config({ path: path.resolve(__dirname, ".env.test") });
if (testEnvResult.error || !testEnvResult.parsed?.DATABASE_URL) {
  throw new Error(
    "BellaBack/.env.test is missing or has no DATABASE_URL. Tests must run against a " +
      "dedicated test database, never the dev database (several tests truncate whole " +
      "tables). Copy .env.test.example to .env.test and point it at a separate database " +
      "(e.g. bellamakeup_test) before running tests."
  );
}
const testEnv = testEnvResult.parsed;

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
    // Vitest's default worker pool spawns one process per CPU core, each
    // loading its own Prisma engine — on a memory-constrained dev machine
    // (observed: 6.9GB total RAM, most of it already claimed by Docker,
    // the frontend/backend dev servers, and stray browser-automation
    // processes) that default reliably OOM-crashes the whole run with
    // "Fatal process out of memory: Zone" partway through. A single fork
    // running all files sequentially is slower but never OOMs; correctness
    // doesn't depend on file-level parallelism here.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
