# Bella Makeup — Fase 1: Fundación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the connected backbone of Bella Makeup — auth, users, roles/permissions, branches, company settings, user profile with DiceBear avatar, and the audit log infrastructure that every future phase (catalog, inventory, POS, transfers, purchases, counts, reports, ecommerce) will write into.

**Architecture:** BellaBack is a layered Express 5 + TypeScript API (`routes → controllers → services → repositories → Prisma`) backed by PostgreSQL (Docker Compose in dev), with JWT access tokens + httpOnly-cookie refresh tokens and backend-enforced permission/branch-scope middleware. BellaFront is a Vite + React 18 + TypeScript SPA with React Router, a centralized API service layer (no component calls fetch/axios directly), and a context-based auth/permissions session.

**Tech Stack:** Express 5, TypeScript, Prisma ORM, PostgreSQL 16 (Docker), Zod, bcryptjs, jsonwebtoken, vitest + supertest (backend tests); React 18, Vite, TypeScript, React Router 6, lucide-react, @fontsource/outfit, @fontsource/inter.

## Global Constraints

- Backend and frontend are separate npm projects under `BellaBack/` and `BellaFront/`, versioned together in one git repo at the project root — never mix their responsibilities.
- No business logic in route files — routes call controllers, controllers call services, services call repositories.
- No direct API calls inside React components — everything goes through `src/services/`.
- Backend must never trust frontend-only permission checks — every protected endpoint re-validates permission and branch scope server-side.
- Palette (exact hex): principal `#18181B`, fondo `#F7F3F1`, blanco `#FFFFFF`, rosa suave `#F4D9DC`, rosa elegante `#DFA8B2`, rosa profundo `#A85C70`, texto secundario `#6F6868`, bordes `#E7DDDA`, acento `#9FFF00` (used sparingly).
- Typography: Outfit for headings/brand, Inter for UI/body — no substitutions, self-hosted via `@fontsource`.
- No emoji icons anywhere in the UI — use `lucide-react`.
- No blue "generic dashboard" look, no all-cards layout — generous whitespace, clear typographic hierarchy.
- Every data-bearing component must handle loading / empty / error / success / disabled states — no fake buttons, no filler pages.
- Every user-initiated write action that matters to the business must produce an `audit_logs` row via the central audit service — never write ad-hoc audit rows inline in controllers.
- Passwords hashed with bcrypt; JWT secrets and DB credentials only via environment variables, never hardcoded.
- Users are the source of truth for identity: audit and all cross-references use `user_id`, never `display_name`.

## File Structure

**BellaBack/**
- `docker-compose.yml` — Postgres 16 service for local dev.
- `.env.example`, `.env` — `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `CORS_ORIGIN`.
- `tsconfig.json`, updated `package.json` (adds TypeScript, ts-node-dev, vitest, supertest, prisma CLI, @types/*).
- `prisma/schema.prisma` — all Phase 1 models.
- `prisma/seed.ts` — roles, permissions, role_permissions, 2 demo branches, company settings, 1 admin user.
- `src/config/env.ts` — typed env loader.
- `src/config/prisma.ts` — Prisma client singleton.
- `src/utils/password.ts` — hash/compare.
- `src/utils/jwt.ts` — sign/verify access & refresh tokens.
- `src/utils/avatar.ts` — DiceBear URL builder + random seed generator.
- `src/utils/AppError.ts` — typed HTTP error class.
- `src/middleware/auth.ts` — `requireAuth`.
- `src/middleware/permissions.ts` — `requirePermission(code)`, `requireBranchScope(paramName)`.
- `src/middleware/errorHandler.ts` — central error → HTTP response mapping.
- `src/services/auditService.ts` — `logAudit(...)`, used by every other service.
- `src/repositories/auditRepository.ts`, `src/services/audit/listAudit.ts`, `src/controllers/auditController.ts`, `src/routes/audit.routes.ts`.
- `src/repositories/userRepository.ts`, `src/services/authService.ts`, `src/services/userService.ts`, `src/controllers/authController.ts`, `src/controllers/userController.ts`, `src/routes/auth.routes.ts`, `src/routes/user.routes.ts`, `src/validators/auth.validators.ts`, `src/validators/user.validators.ts`.
- `src/repositories/roleRepository.ts`, `src/services/roleService.ts`, `src/controllers/roleController.ts`, `src/routes/role.routes.ts`.
- `src/repositories/branchRepository.ts`, `src/services/branchService.ts`, `src/controllers/branchController.ts`, `src/routes/branch.routes.ts`, `src/validators/branch.validators.ts`.
- `src/services/profileService.ts`, `src/controllers/profileController.ts`, `src/routes/profile.routes.ts`, `src/validators/profile.validators.ts`.
- `src/repositories/companySettingsRepository.ts`, `src/services/companySettingsService.ts`, `src/controllers/companySettingsController.ts`, `src/routes/companySettings.routes.ts`.
- `src/app.ts` (Express app + middleware wiring), `src/server.ts` (listen).
- `tests/auth.test.ts`, `tests/permissions.test.ts`, `tests/branchScope.test.ts`.

**BellaFront/**
- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`.
- `src/styles/tokens.css` (CSS variables for palette/spacing), `src/styles/global.css` (fonts, resets).
- `src/types/api.ts` — shared API DTO types (User, Role, Branch, AuditLog, CompanySettings, AuthSession).
- `src/services/apiClient.ts` — fetch wrapper with base URL, credentials, 401→refresh-retry-once logic.
- `src/services/authService.ts`, `src/services/userService.ts`, `src/services/roleService.ts`, `src/services/branchService.ts`, `src/services/profileService.ts`, `src/services/companySettingsService.ts`, `src/services/auditService.ts`.
- `src/context/AuthContext.tsx` — session state, `hasPermission()`, login/logout.
- `src/hooks/useAuth.ts`, `src/hooks/usePermission.ts`.
- `src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `UserMenu.tsx`.
- `src/components/common/Avatar.tsx`, `StatusState.tsx` (loading/empty/error), `DataTable.tsx`, `Modal.tsx`, `Button.tsx`, `Badge.tsx`.
- `src/components/auth/ProtectedRoute.tsx`, `PermissionGate.tsx`.
- `src/pages/auth/LoginPage.tsx`.
- `src/pages/profile/ProfilePage.tsx`, `src/components/profile/AvatarPicker.tsx`.
- `src/pages/users/UsersPage.tsx`, `UserFormModal.tsx`.
- `src/pages/roles/RolesPage.tsx`.
- `src/pages/branches/BranchesPage.tsx`, `BranchFormModal.tsx`.
- `src/pages/settings/CompanySettingsPage.tsx`.
- `src/pages/audit/AuditPage.tsx`.
- `src/app/router.tsx` — route table.

---

## Backend Tasks

### Task 1: Backend TypeScript scaffold + Docker Postgres + env config

**Files:**
- Modify: `BellaBack/package.json`
- Create: `BellaBack/tsconfig.json`
- Create: `BellaBack/docker-compose.yml`
- Create: `BellaBack/.env.example`, `BellaBack/.env` (gitignored)
- Create: `BellaBack/.gitignore`
- Create: `BellaBack/src/config/env.ts`
- Create: `BellaBack/src/app.ts`, `BellaBack/src/server.ts`

**Interfaces:**
- Produces: `env` object from `src/config/env.ts` exporting `{ PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CORS_ORIGIN, NODE_ENV }`, all typed `string`/`number`, throwing at startup if a required var is missing. `app` (Express instance) exported as default from `src/app.ts` for later route mounting and for supertest in later tasks.

- [ ] **Step 1: Add TypeScript toolchain to `package.json`**

Add to `devDependencies`: `typescript`, `ts-node-dev`, `@types/node`, `@types/express`, `@types/cookie-parser`, `@types/cors`, `@types/morgan`, `@types/multer`, `@types/bcryptjs`, `@types/jsonwebtoken`, `@types/uuid`, `vitest`, `supertest`, `@types/supertest`, `prisma`. Change `"type": "commonjs"` stays (Prisma/ts-node-dev work fine with CommonJS output). Add scripts:

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node dist/server.js",
  "test": "vitest run",
  "prisma:migrate": "prisma migrate dev",
  "prisma:seed": "ts-node prisma/seed.ts",
  "prisma:studio": "prisma studio"
},
"prisma": { "seed": "ts-node prisma/seed.ts" }
```

Run: `cd BellaBack && npm install`
Expected: installs cleanly, no peer dependency errors.

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: `docker-compose.yml` for local Postgres**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: bella
      POSTGRES_PASSWORD: bella_dev_password
      POSTGRES_DB: bellamakeup
    ports:
      - "5432:5432"
    volumes:
      - bella_postgres_data:/var/lib/postgresql/data
volumes:
  bella_postgres_data:
```

- [ ] **Step 4: `.env.example` and `.env`**

```
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://bella:bella_dev_password@localhost:5432/bellamakeup?schema=public"
JWT_ACCESS_SECRET="change-me-access-dev-secret"
JWT_REFRESH_SECRET="change-me-refresh-dev-secret"
CORS_ORIGIN="http://localhost:5173"
```

Copy `.env.example` to `.env` with the same dev values (local dev only, not committed).

- [ ] **Step 5: `.gitignore`**

```
node_modules
dist
.env
uploads/*
!uploads/.gitkeep
```

- [ ] **Step 6: `src/config/env.ts`**

```typescript
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: required("DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
```

- [ ] **Step 7: minimal `src/app.ts` and `src/server.ts`**

```typescript
// src/app.ts
import express from "express";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
```

```typescript
// src/server.ts
import app from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`BellaBack listening on port ${env.PORT}`);
});
```

- [ ] **Step 8: Start Postgres and verify the server boots**

Run: `docker compose up -d` then `npm run dev`
Expected: `docker compose ps` shows `postgres` healthy; `curl http://localhost:4000/health` returns `{"status":"ok"}`.

- [ ] **Step 9: Commit**

```bash
git add BellaBack/package.json BellaBack/package-lock.json BellaBack/tsconfig.json BellaBack/docker-compose.yml BellaBack/.env.example BellaBack/.gitignore BellaBack/src/config/env.ts BellaBack/src/app.ts BellaBack/src/server.ts
git commit -m "chore(backend): TypeScript scaffold, Docker Postgres, env config"
```

---

### Task 2: Prisma schema (Phase 1 models) + migration + seed

**Files:**
- Create: `BellaBack/prisma/schema.prisma`
- Create: `BellaBack/prisma/seed.ts`
- Create: `BellaBack/src/config/prisma.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL` from Task 1.
- Produces: Prisma Client models `User`, `Role`, `Permission`, `RolePermission`, `Branch`, `UserBranch`, `CompanySettings`, `AuditLog`, `RefreshToken`. Singleton `prisma` (PrismaClient instance) exported from `src/config/prisma.ts`, imported by every repository in later tasks.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserStatus {
  ACTIVE
  DISABLED
}

enum BranchStatus {
  ACTIVE
  INACTIVE
}

model Role {
  id          String   @id @default(uuid())
  code        String   @unique
  name        String
  description String
  createdAt   DateTime @default(now()) @map("created_at")

  users           User[]
  rolePermissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid())
  code        String   @unique
  description String

  rolePermissions RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId       String @map("role_id")
  permissionId String @map("permission_id")

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model Branch {
  id           String       @id @default(uuid())
  name         String
  address      String?
  phone        String?
  schedule     String?
  managerName  String?      @map("manager_name")
  status       BranchStatus @default(ACTIVE)
  createdAt    DateTime     @default(now()) @map("created_at")

  userBranches UserBranch[]
  auditLogs    AuditLog[]

  @@map("branches")
}

model User {
  id           String     @id @default(uuid())
  firstName    String     @map("first_name")
  lastName     String     @map("last_name")
  displayName  String     @map("display_name")
  username     String     @unique
  email        String     @unique
  phone        String?
  passwordHash String     @map("password_hash")
  avatarStyle  String     @default("adventurer") @map("avatar_style")
  avatarSeed   String     @map("avatar_seed")
  roleId       String     @map("role_id")
  status       UserStatus @default(ACTIVE)
  allBranches  Boolean    @default(false) @map("all_branches")
  createdAt    DateTime   @default(now()) @map("created_at")
  lastLoginAt  DateTime?  @map("last_login_at")

  role          Role           @relation(fields: [roleId], references: [id])
  userBranches  UserBranch[]
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]

  @@map("users")
}

model UserBranch {
  userId   String @map("user_id")
  branchId String @map("branch_id")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@id([userId, branchId])
  @@map("user_branches")
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  tokenHash String   @map("token_hash")
  expiresAt DateTime @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

model CompanySettings {
  id           String   @id @default(uuid())
  companyName  String   @map("company_name")
  address      String?
  phone        String?
  socialLinks  Json?    @map("social_links")
  logoUrl      String?  @map("logo_url")
  currency     String   @default("MXN")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("company_settings")
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String
  module     String
  entityType String?  @map("entity_type")
  entityId   String?  @map("entity_id")
  branchId   String?  @map("branch_id")
  details    Json?
  createdAt  DateTime @default(now()) @map("created_at")

  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  branch Branch? @relation(fields: [branchId], references: [id], onDelete: SetNull)

  @@map("audit_logs")
  @@index([module])
  @@index([userId])
  @@index([createdAt])
}
```

- [ ] **Step 2: Run the migration**

Run: `cd BellaBack && npx prisma migrate dev --name phase1_foundation`
Expected: migration applies cleanly against the Docker Postgres from Task 1; `prisma/migrations/<timestamp>_phase1_foundation/migration.sql` is generated.

- [ ] **Step 3: `src/config/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 4: `prisma/seed.ts`**

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ code: string; description: string }> = [
  { code: "products.view", description: "Ver productos" },
  { code: "products.create", description: "Crear productos" },
  { code: "products.edit", description: "Editar productos" },
  { code: "products.delete", description: "Eliminar productos" },
  { code: "inventory.view", description: "Ver inventario" },
  { code: "inventory.adjust", description: "Ajustar inventario" },
  { code: "inventory.count", description: "Realizar inventarios físicos" },
  { code: "inventory.transfer", description: "Crear transferencias" },
  { code: "inventory.receive", description: "Recibir transferencias/compras" },
  { code: "sales.view", description: "Ver ventas" },
  { code: "sales.create", description: "Registrar ventas" },
  { code: "sales.cancel", description: "Cancelar ventas" },
  { code: "sales.return", description: "Registrar devoluciones" },
  { code: "discounts.create", description: "Crear descuentos" },
  { code: "discounts.apply", description: "Aplicar descuentos" },
  { code: "discounts.authorize", description: "Autorizar descuentos" },
  { code: "users.view", description: "Ver usuarios" },
  { code: "users.create", description: "Crear usuarios" },
  { code: "users.edit", description: "Editar usuarios" },
  { code: "users.disable", description: "Desactivar usuarios" },
  { code: "roles.view", description: "Ver roles" },
  { code: "roles.manage", description: "Gestionar roles y permisos" },
  { code: "branches.view", description: "Ver sucursales" },
  { code: "branches.manage", description: "Gestionar sucursales" },
  { code: "purchases.view", description: "Ver compras" },
  { code: "purchases.create", description: "Crear compras" },
  { code: "purchases.receive", description: "Recibir compras" },
  { code: "reports.view", description: "Ver reportes" },
  { code: "audit.view", description: "Ver auditoría" },
  { code: "ecommerce.manage", description: "Gestionar catálogo ecommerce" },
  { code: "orders.view", description: "Ver pedidos online" },
  { code: "orders.update", description: "Actualizar pedidos online" },
  { code: "settings.manage", description: "Gestionar configuración de la empresa" },
];

const ROLES: Array<{ code: string; name: string; description: string; permissions: string[] }> = [
  {
    code: "admin",
    name: "Administrador",
    description:
      "Tiene acceso completo al sistema, configuración general, usuarios, roles, sucursales, inventario, ventas, reportes, ecommerce y auditoría.",
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: "branch_manager",
    name: "Gerente de sucursal",
    description:
      "Administra la operación de una o varias sucursales asignadas. Puede consultar ventas, inventario, movimientos, usuarios autorizados y operaciones de su ámbito.",
    permissions: [
      "products.view", "inventory.view", "inventory.adjust", "inventory.count", "inventory.transfer", "inventory.receive",
      "sales.view", "sales.cancel", "sales.return", "discounts.authorize",
      "users.view", "branches.view", "purchases.view", "purchases.receive", "reports.view", "audit.view",
    ],
  },
  {
    code: "cashier",
    name: "Vendedor / Cajero",
    description:
      "Realiza ventas mediante POS, consulta productos y genera tickets. No puede modificar configuraciones administrativas ni realizar ajustes de inventario sin autorización.",
    permissions: ["products.view", "inventory.view", "sales.view", "sales.create", "discounts.apply"],
  },
  {
    code: "warehouse",
    name: "Almacenista",
    description:
      "Gestiona entradas, salidas, inventarios físicos, movimientos de mercancía y transferencias autorizadas.",
    permissions: ["products.view", "inventory.view", "inventory.adjust", "inventory.count", "inventory.transfer", "inventory.receive"],
  },
  {
    code: "purchasing",
    name: "Compras",
    description: "Gestiona proveedores, órdenes/compras y recepción de mercancía.",
    permissions: ["products.view", "purchases.view", "purchases.create", "purchases.receive", "inventory.view"],
  },
  {
    code: "online_store_admin",
    name: "Administrador de tienda online",
    description: "Gestiona catálogo online, productos publicados, pedidos y operaciones relacionadas con ecommerce.",
    permissions: ["products.view", "ecommerce.manage", "orders.view", "orders.update", "inventory.view"],
  },
  {
    code: "viewer",
    name: "Consulta / Reportes",
    description: "Puede consultar información y reportes autorizados sin modificar operaciones críticas.",
    permissions: ["products.view", "inventory.view", "sales.view", "reports.view", "branches.view"],
  },
];

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: { code: r.code, name: r.name, description: r.description },
    });
    for (const permCode of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permCode } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const centro = await prisma.branch.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Sucursal Centro",
      address: "Av. Reforma 123, Centro",
      phone: "555-100-2000",
      schedule: "Lun-Sáb 10:00-20:00",
      managerName: "Por asignar",
    },
  });
  await prisma.branch.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Sucursal Norte",
      address: "Blvd. Norte 456, Col. Industrial",
      phone: "555-100-3000",
      schedule: "Lun-Sáb 10:00-20:00",
      managerName: "Por asignar",
    },
  });

  await prisma.companySettings.upsert({
    where: { id: "00000000-0000-0000-0000-00000000000c" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-00000000000c",
      companyName: "Bella Makeup",
      address: "Av. Reforma 123, Centro",
      phone: "555-100-2000",
      currency: "MXN",
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
  const passwordHash = await bcrypt.hash("BellaAdmin#2026", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      firstName: "Admin",
      lastName: "Bella Makeup",
      displayName: "Admin",
      username: "admin",
      email: "admin@bellamakeup.demo",
      passwordHash,
      avatarStyle: "adventurer",
      avatarSeed: "bella-admin",
      roleId: adminRole.id,
      allBranches: true,
    },
  });

  console.log("Seed complete. Demo login: admin / BellaAdmin#2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 5: Run the seed and verify**

Run: `npm run prisma:seed`
Expected: logs "Seed complete..."; `npx prisma studio` (or a quick `psql`/Prisma query) shows 7 roles, 32 permissions, 2 branches, 1 company_settings row, 1 admin user.

- [ ] **Step 6: Commit**

```bash
git add BellaBack/prisma BellaBack/src/config/prisma.ts
git commit -m "feat(backend): Prisma schema for Phase 1 + seed data"
```

---

### Task 3: Password hashing + JWT utils (TDD)

**Files:**
- Create: `BellaBack/src/utils/password.ts`
- Create: `BellaBack/src/utils/jwt.ts`
- Test: `BellaBack/tests/password.test.ts`
- Test: `BellaBack/tests/jwt.test.ts`
- Create: `BellaBack/vitest.config.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `comparePassword(plain: string, hash: string): Promise<boolean>` from `password.ts`. `signAccessToken(payload: { sub: string; roleId: string }): string`, `signRefreshToken(payload: { sub: string }): string`, `verifyAccessToken(token: string): { sub: string; roleId: string }`, `verifyRefreshToken(token: string): { sub: string }` from `jwt.ts`. Both consumed by `authService` in Task 5.

- [ ] **Step 1: `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [],
  },
});
```

- [ ] **Step 2: Write failing tests for `password.ts`**

```typescript
// tests/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "../src/utils/password";

describe("password utils", () => {
  it("hashes a password and can verify it", async () => {
    const hash = await hashPassword("BellaAdmin#2026");
    expect(hash).not.toBe("BellaAdmin#2026");
    expect(await comparePassword("BellaAdmin#2026", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("BellaAdmin#2026");
    expect(await comparePassword("wrong-password", hash)).toBe(false);
  });
});
```

Run: `npx vitest run tests/password.test.ts`
Expected: FAIL — `Cannot find module '../src/utils/password'`.

- [ ] **Step 3: Implement `password.ts`**

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

Run: `npx vitest run tests/password.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Write failing tests for `jwt.ts`**

```typescript
// tests/jwt.test.ts
import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from "../src/utils/jwt";

describe("jwt utils", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "role-1" });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.roleId).toBe("role-1");
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken({ sub: "user-1" });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe("user-1");
  });

  it("throws on a tampered access token", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "role-1" });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
```

Run: `npx vitest run tests/jwt.test.ts`
Expected: FAIL — module not found. (Ensure `.env` is loaded; add `import "dotenv/config"` at the top of `jwt.ts` since vitest doesn't load `src/server.ts`.)

- [ ] **Step 5: Implement `jwt.ts`**

```typescript
import "dotenv/config";
import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "change-me-access-dev-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "change-me-refresh-dev-secret";

export interface AccessTokenPayload {
  sub: string;
  roleId: string;
}

export interface RefreshTokenPayload {
  sub: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
}
```

Run: `npx vitest run tests/jwt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add BellaBack/vitest.config.ts BellaBack/src/utils/password.ts BellaBack/src/utils/jwt.ts BellaBack/tests/password.test.ts BellaBack/tests/jwt.test.ts
git commit -m "feat(backend): password hashing and JWT utils with tests"
```

---

### Task 4: Audit log service (TDD)

**Files:**
- Create: `BellaBack/src/repositories/auditRepository.ts`
- Create: `BellaBack/src/services/auditService.ts`
- Test: `BellaBack/tests/auditService.test.ts`

**Interfaces:**
- Consumes: `prisma` from Task 2.
- Produces: `logAudit(input: { userId: string | null; action: string; module: string; entityType?: string; entityId?: string; branchId?: string; details?: Record<string, unknown> }): Promise<void>` and `listAudit(filters: { userId?: string; module?: string; branchId?: string; from?: Date; to?: Date; page?: number; pageSize?: number }): Promise<{ items: AuditLogWithUser[]; total: number }>` from `auditService.ts`. Every future service (auth, users, roles, branches, profile — and all later phases) calls `logAudit`.

- [ ] **Step 1: Write failing test**

```typescript
// tests/auditService.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/config/prisma";
import { logAudit, listAudit } from "../src/services/auditService";

describe("auditService", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  it("logs an audit entry and lists it back", async () => {
    await logAudit({ userId: null, action: "test.action", module: "test", details: { foo: "bar" } });
    const { items, total } = await listAudit({});
    expect(total).toBe(1);
    expect(items[0].action).toBe("test.action");
    expect(items[0].module).toBe("test");
  });

  it("filters by module", async () => {
    await logAudit({ userId: null, action: "a", module: "users" });
    await logAudit({ userId: null, action: "b", module: "branches" });
    const { items, total } = await listAudit({ module: "users" });
    expect(total).toBe(1);
    expect(items[0].module).toBe("users");
  });
});
```

Run: `npx vitest run tests/auditService.test.ts` (requires Docker Postgres running and migrated)
Expected: FAIL — module not found.

- [ ] **Step 2: `src/repositories/auditRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export interface AuditFilters {
  userId?: string;
  module?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export function createAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

export async function findAuditLogs(filters: AuditFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const where: Prisma.AuditLogWhereInput = {
    userId: filters.userId,
    module: filters.module,
    branchId: filters.branchId,
    createdAt: {
      gte: filters.from,
      lte: filters.to,
    },
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: true, branch: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
```

- [ ] **Step 3: `src/services/auditService.ts`**

```typescript
import { createAuditLog, findAuditLogs, AuditFilters } from "../repositories/auditRepository";

export interface LogAuditInput {
  userId: string | null;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  await createAuditLog({
    userId: input.userId ?? undefined,
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    branchId: input.branchId,
    details: input.details as any,
  });
}

export async function listAudit(filters: AuditFilters) {
  return findAuditLogs(filters);
}
```

Run: `npx vitest run tests/auditService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add BellaBack/src/repositories/auditRepository.ts BellaBack/src/services/auditService.ts BellaBack/tests/auditService.test.ts
git commit -m "feat(backend): audit log service with filters"
```

---

### Task 5: Auth service, controller, routes, `requireAuth` middleware (TDD)

**Files:**
- Create: `BellaBack/src/repositories/userRepository.ts`
- Create: `BellaBack/src/repositories/refreshTokenRepository.ts`
- Create: `BellaBack/src/services/authService.ts`
- Create: `BellaBack/src/controllers/authController.ts`
- Create: `BellaBack/src/routes/auth.routes.ts`
- Create: `BellaBack/src/middleware/auth.ts`
- Create: `BellaBack/src/validators/auth.validators.ts`
- Create: `BellaBack/src/utils/AppError.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/auth.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`comparePassword` (Task 3), `signAccessToken`/`verifyAccessToken`/`signRefreshToken`/`verifyRefreshToken` (Task 3), `logAudit` (Task 4), `prisma` (Task 2).
- Produces: `POST /api/auth/login` (body `{ username, password }` → `{ user: PublicUser }`, sets `access_token` and `refresh_token` httpOnly cookies), `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`. `requireAuth` middleware attaches `req.user = { id, roleId }` for Task 6+ middleware and all later controllers.

- [ ] **Step 1: `src/utils/AppError.ts`**

```typescript
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}
```

- [ ] **Step 2: `src/validators/auth.validators.ts`**

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Usuario o correo requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});
```

- [ ] **Step 3: `src/repositories/userRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findUserByUsernameOrEmail(identifier: string) {
  return prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
    include: { role: true },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { role: true, userBranches: { include: { branch: true } } } });
}

export function touchLastLogin(id: string) {
  return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
}

export function createUser(data: Prisma.UserUncheckedCreateInput) {
  return prisma.user.create({ data, include: { role: true } });
}

export function updateUser(id: string, data: Prisma.UserUncheckedUpdateInput) {
  return prisma.user.update({ where: { id }, data, include: { role: true } });
}

export function listUsers() {
  return prisma.user.findMany({ include: { role: true, userBranches: { include: { branch: true } } }, orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 4: `src/repositories/refreshTokenRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import crypto from "crypto";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function storeRefreshToken(userId: string, token: string, expiresAt: Date) {
  return prisma.refreshToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
}

export async function isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
  const record = await prisma.refreshToken.findFirst({
    where: { userId, tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
  });
  return !!record;
}

export function revokeRefreshToken(userId: string, token: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] **Step 5: Write failing integration test**

```typescript
// tests/auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { code: "test_role" },
      update: {},
      create: { code: "test_role", name: "Test", description: "test" },
    });
    await prisma.user.upsert({
      where: { username: "testuser" },
      update: {},
      create: {
        firstName: "Test", lastName: "User", displayName: "Test User",
        username: "testuser", email: "testuser@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "test-seed", roleId: role.id,
      },
    });
  });

  it("logs in with valid credentials and sets cookies", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "testuser", password: "Password#123" });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("testuser");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "testuser", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated access to /api/auth/me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
```

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — route not found (404) since `app.ts` has no auth routes yet.

- [ ] **Step 6: `src/services/authService.ts`**

```typescript
import { findUserByUsernameOrEmail, findUserById, touchLastLogin } from "../repositories/userRepository";
import { storeRefreshToken, isRefreshTokenValid, revokeRefreshToken } from "../repositories/refreshTokenRepository";
import { comparePassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function toPublicUser(user: any) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function login(username: string, password: string) {
  const user = await findUserByUsernameOrEmail(username);
  if (!user || user.status !== "ACTIVE" || !(await comparePassword(password, user.passwordHash))) {
    throw new AppError(401, "Usuario o contraseña incorrectos");
  }

  const accessToken = signAccessToken({ sub: user.id, roleId: user.roleId });
  const refreshToken = signRefreshToken({ sub: user.id });
  await storeRefreshToken(user.id, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  await touchLastLogin(user.id);
  await logAudit({ userId: user.id, action: "auth.login", module: "auth" });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "Sesión inválida");
  }
  const valid = await isRefreshTokenValid(payload.sub, refreshToken);
  if (!valid) throw new AppError(401, "Sesión inválida");

  const user = await findUserById(payload.sub);
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "Sesión inválida");

  const accessToken = signAccessToken({ sub: user.id, roleId: user.roleId });
  return { accessToken, user: toPublicUser(user) };
}

export async function logout(userId: string, refreshToken: string) {
  await revokeRefreshToken(userId, refreshToken);
  await logAudit({ userId, action: "auth.logout", module: "auth" });
}
```

- [ ] **Step 7: `src/controllers/authController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { loginSchema } from "../validators/auth.validators";
import * as authService from "../services/authService";
import { findUserById } from "../repositories/userRepository";
import { toPublicUser } from "../services/authService";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(username, password);
    res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ message: "No hay sesión" });
    const { accessToken, user } = await authService.refresh(token);
    res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refresh_token;
    if (req.user && token) await authService.logout(req.user.id, token);
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await findUserById(req.user!.id);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 8: `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roleId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ message: "No autenticado" });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, roleId: payload.roleId };
    next();
  } catch {
    return res.status(401).json({ message: "Sesión expirada" });
  }
}
```

- [ ] **Step 9: `src/routes/auth.routes.ts`**

```typescript
import { Router } from "express";
import * as authController from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.me);

export default router;
```

- [ ] **Step 10: Wire into `src/app.ts`**

```typescript
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);

export default app;
```

- [ ] **Step 11: Run tests**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 12: Commit**

```bash
git add BellaBack/src BellaBack/tests/auth.test.ts
git commit -m "feat(backend): auth service, login/refresh/logout/me, requireAuth middleware"
```

---

### Task 6: Permission & branch-scope middleware (TDD)

**Files:**
- Create: `BellaBack/src/middleware/permissions.ts`
- Test: `BellaBack/tests/permissions.test.ts`

**Interfaces:**
- Consumes: `req.user` from `requireAuth` (Task 5), `prisma` (Task 2).
- Produces: `requirePermission(code: string)` (Express middleware factory) and `requireBranchScope(paramName: string)` (Express middleware factory reading `req.params[paramName]` as a branch id). Both consumed by every protected route from Task 7 onward.

- [ ] **Step 1: Write failing test**

```typescript
// tests/permissions.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../src/config/prisma";
import { requirePermission, requireBranchScope } from "../src/middleware/permissions";
import { signAccessToken } from "../src/utils/jwt";
import { hashPassword } from "../src/utils/password";
import cookieParser from "cookie-parser";
import { requireAuth } from "../src/middleware/auth";

describe("permission & branch-scope middleware", () => {
  let cashierToken: string;
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { code: "perm_test_role" },
      update: {},
      create: { code: "perm_test_role", name: "Perm Test", description: "test" },
    });
    const perm = await prisma.permission.upsert({
      where: { code: "sales.create" },
      update: {},
      create: { code: "sales.create", description: "Registrar ventas" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
    const branchA = await prisma.branch.create({ data: { name: "Branch A Test" } });
    const branchB = await prisma.branch.create({ data: { name: "Branch B Test" } });
    branchAId = branchA.id;
    branchBId = branchB.id;

    const user = await prisma.user.create({
      data: {
        firstName: "Cashier", lastName: "Test", displayName: "Cashier",
        username: "cashier_perm_test", email: "cashier_perm_test@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: role.id,
        userBranches: { create: [{ branchId: branchA.id }] },
      },
    });
    cashierToken = signAccessToken({ sub: user.id, roleId: role.id });
  });

  function buildApp() {
    const app = express();
    app.use(cookieParser());
    app.get(
      "/protected/:branchId",
      requireAuth,
      requirePermission("sales.create"),
      requireBranchScope("branchId"),
      (_req, res) => res.json({ ok: true })
    );
    app.get("/forbidden-action/:branchId", requireAuth, requirePermission("branches.manage"), (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("allows access to a branch the user is assigned to", async () => {
    const app = buildApp();
    const res = await request(app).get(`/protected/${branchAId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(200);
  });

  it("denies access to a branch the user is NOT assigned to, even with a valid permission", async () => {
    const app = buildApp();
    const res = await request(app).get(`/protected/${branchBId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(403);
  });

  it("denies access when the user's role lacks the required permission", async () => {
    const app = buildApp();
    const res = await request(app).get(`/forbidden-action/${branchAId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(403);
  });
});
```

Run: `npx vitest run tests/permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `src/middleware/permissions.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

export function requirePermission(code: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    const count = await prisma.rolePermission.count({
      where: { roleId: req.user.roleId, permission: { code } },
    });
    if (count === 0) return res.status(403).json({ message: "Permiso insuficiente" });
    next();
  };
}

export function requireBranchScope(paramName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    const branchId = req.params[paramName];
    if (!branchId) return next();

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user?.allBranches) return next();

    const assignment = await prisma.userBranch.findUnique({
      where: { userId_branchId: { userId: req.user.id, branchId } },
    });
    if (!assignment) return res.status(403).json({ message: "Sin acceso a esta sucursal" });
    next();
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/permissions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add BellaBack/src/middleware/permissions.ts BellaBack/tests/permissions.test.ts
git commit -m "feat(backend): permission and branch-scope middleware with tests"
```

---

### Task 7: Roles & permissions endpoints

**Files:**
- Create: `BellaBack/src/repositories/roleRepository.ts`
- Create: `BellaBack/src/services/roleService.ts`
- Create: `BellaBack/src/controllers/roleController.ts`
- Create: `BellaBack/src/routes/role.routes.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/roles.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requirePermission` (Tasks 5–6), `prisma` (Task 2).
- Produces: `GET /api/roles` → `Array<{ id, code, name, description, permissions: string[], assignedUsersCount: number }>`. Consumed by the frontend Roles page (Task 21) and reused by later phases when they need role/permission lookups.

- [ ] **Step 1: Write failing test**

```typescript
// tests/roles.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("GET /api/roles", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "roles_test_admin" },
      update: {},
      create: {
        firstName: "Roles", lastName: "Admin", displayName: "Roles Admin",
        username: "roles_test_admin", email: "roles_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("lists roles with descriptions, permissions and assigned user counts", async () => {
    const res = await request(app).get("/api/roles").set("Cookie", [cookie]);
    expect(res.status).toBe(200);
    const cashier = res.body.find((r: any) => r.code === "cashier");
    expect(cashier.description).toContain("Realiza ventas");
    expect(cashier.permissions).toContain("sales.create");
    expect(typeof cashier.assignedUsersCount).toBe("number");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/roles");
    expect(res.status).toBe(401);
  });
});
```

Run: `npx vitest run tests/roles.test.ts`
Expected: FAIL — 404, route not mounted.

- [ ] **Step 2: `src/repositories/roleRepository.ts`**

```typescript
import { prisma } from "../config/prisma";

export function findAllRolesWithPermissions() {
  return prisma.role.findMany({
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 3: `src/services/roleService.ts`**

```typescript
import { findAllRolesWithPermissions } from "../repositories/roleRepository";

export async function listRoles() {
  const roles = await findAllRolesWithPermissions();
  return roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.rolePermissions.map((rp) => rp.permission.code),
    assignedUsersCount: role._count.users,
  }));
}
```

- [ ] **Step 4: `src/controllers/roleController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import * as roleService from "../services/roleService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await roleService.listRoles());
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: `src/routes/role.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as roleController from "../controllers/roleController";

const router = Router();
router.get("/", requireAuth, requirePermission("roles.view"), roleController.list);
export default router;
```

- [ ] **Step 6: Mount in `src/app.ts`**

```typescript
import roleRoutes from "./routes/role.routes";
// ...
app.use("/api/roles", roleRoutes);
```

- [ ] **Step 7: Run tests, then commit**

Run: `npx vitest run tests/roles.test.ts` → Expected: PASS (2 tests).

```bash
git add BellaBack/src/repositories/roleRepository.ts BellaBack/src/services/roleService.ts BellaBack/src/controllers/roleController.ts BellaBack/src/routes/role.routes.ts BellaBack/src/app.ts BellaBack/tests/roles.test.ts
git commit -m "feat(backend): GET /api/roles with permissions and assigned user counts"
```

---

### Task 8: Branches CRUD (TDD)

**Files:**
- Create: `BellaBack/src/repositories/branchRepository.ts`
- Create: `BellaBack/src/services/branchService.ts`
- Create: `BellaBack/src/controllers/branchController.ts`
- Create: `BellaBack/src/routes/branch.routes.ts`
- Create: `BellaBack/src/validators/branch.validators.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/branches.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requirePermission` (Tasks 5–6), `logAudit` (Task 4).
- Produces: `GET /api/branches`, `POST /api/branches`, `PUT /api/branches/:id`, `PATCH /api/branches/:id/status` → `Branch` DTO `{ id, name, address, phone, schedule, managerName, status, createdAt }`. Consumed by frontend Branches page (Task 24) and by Task 9 (user-branch assignment) and every later phase that references a branch.

- [ ] **Step 1: Write failing test**

```typescript
// tests/branches.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Branches CRUD", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "branches_test_admin" },
      update: {},
      create: {
        firstName: "Branches", lastName: "Admin", displayName: "Branches Admin",
        username: "branches_test_admin", email: "branches_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("creates, lists, updates and deactivates a branch", async () => {
    const create = await request(app).post("/api/branches").set("Cookie", [cookie]).send({ name: "Sucursal Test" });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get("/api/branches").set("Cookie", [cookie]);
    expect(list.body.some((b: any) => b.id === id)).toBe(true);

    const update = await request(app).put(`/api/branches/${id}`).set("Cookie", [cookie]).send({ name: "Sucursal Test Editada" });
    expect(update.body.name).toBe("Sucursal Test Editada");

    const deactivate = await request(app).patch(`/api/branches/${id}/status`).set("Cookie", [cookie]).send({ status: "INACTIVE" });
    expect(deactivate.body.status).toBe("INACTIVE");
  });

  it("rejects creation without branches.manage permission", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "branches_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "branches_test_viewer",
        email: "branches_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;
    const res = await request(app).post("/api/branches").set("Cookie", [viewerCookie]).send({ name: "Should Fail" });
    expect(res.status).toBe(403);
  });
});
```

Run: `npx vitest run tests/branches.test.ts`
Expected: FAIL — 404.

- [ ] **Step 2: `src/validators/branch.validators.ts`**

```typescript
import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  schedule: z.string().optional(),
  managerName: z.string().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export const updateBranchStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
```

- [ ] **Step 3: `src/repositories/branchRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findAllBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export function findBranchById(id: string) {
  return prisma.branch.findUnique({ where: { id } });
}

export function createBranch(data: Prisma.BranchCreateInput) {
  return prisma.branch.create({ data });
}

export function updateBranch(id: string, data: Prisma.BranchUpdateInput) {
  return prisma.branch.update({ where: { id }, data });
}
```

- [ ] **Step 4: `src/services/branchService.ts`**

```typescript
import * as branchRepository from "../repositories/branchRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

export const listBranches = () => branchRepository.findAllBranches();

export async function createBranch(input: any, actorId: string) {
  const branch = await branchRepository.createBranch(input);
  await logAudit({ userId: actorId, action: "branches.create", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id, details: { name: branch.name } });
  return branch;
}

export async function updateBranch(id: string, input: any, actorId: string) {
  const existing = await branchRepository.findBranchById(id);
  if (!existing) throw new AppError(404, "Sucursal no encontrada");
  const branch = await branchRepository.updateBranch(id, input);
  await logAudit({ userId: actorId, action: "branches.update", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id });
  return branch;
}

export async function updateBranchStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string) {
  const branch = await branchRepository.updateBranch(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "branches.activate" : "branches.deactivate", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id });
  return branch;
}
```

- [ ] **Step 5: `src/controllers/branchController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { createBranchSchema, updateBranchSchema, updateBranchStatusSchema } from "../validators/branch.validators";
import * as branchService from "../services/branchService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await branchService.listBranches());
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBranchSchema.parse(req.body);
    const branch = await branchService.createBranch(data, req.user!.id);
    res.status(201).json(branch);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateBranchSchema.parse(req.body);
    res.json(await branchService.updateBranch(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateBranchStatusSchema.parse(req.body);
    res.json(await branchService.updateBranchStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}
```

- [ ] **Step 6: `src/routes/branch.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as branchController from "../controllers/branchController";

const router = Router();
router.get("/", requireAuth, requirePermission("branches.view"), branchController.list);
router.post("/", requireAuth, requirePermission("branches.manage"), branchController.create);
router.put("/:id", requireAuth, requirePermission("branches.manage"), branchController.update);
router.patch("/:id/status", requireAuth, requirePermission("branches.manage"), branchController.updateStatus);
export default router;
```

- [ ] **Step 7: Mount in `app.ts`, run tests, commit**

```typescript
import branchRoutes from "./routes/branch.routes";
app.use("/api/branches", branchRoutes);
```

Run: `npx vitest run tests/branches.test.ts` → Expected: PASS (2 tests).

```bash
git add BellaBack/src BellaBack/tests/branches.test.ts
git commit -m "feat(backend): branches CRUD with permission enforcement"
```

---

### Task 9: Users CRUD + branch assignment (TDD)

**Files:**
- Create: `BellaBack/src/services/userService.ts`
- Create: `BellaBack/src/controllers/userController.ts`
- Create: `BellaBack/src/routes/user.routes.ts`
- Create: `BellaBack/src/validators/user.validators.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/users.test.ts`

**Interfaces:**
- Consumes: `userRepository` (Task 5), `hashPassword` (Task 3), `logAudit` (Task 4), `requireAuth`/`requirePermission` (Tasks 5–6).
- Produces: `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `PATCH /api/users/:id/status`, `PUT /api/users/:id/branches` (body `{ branchIds: string[]; allBranches: boolean }`) → `UserDTO` with `passwordHash` stripped and `branches: Branch[]`. Consumed by frontend Users page (Task 22).

- [ ] **Step 1: Write failing test**

```typescript
// tests/users.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Users CRUD + branch assignment", () => {
  let cookie: string;
  let cashierRoleId: string;
  let branchId: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    cashierRoleId = cashierRole.id;
    const branch = await prisma.branch.create({ data: { name: "Users Test Branch" } });
    branchId = branch.id;

    const admin = await prisma.user.upsert({
      where: { username: "users_test_admin" },
      update: {},
      create: {
        firstName: "Users", lastName: "Admin", displayName: "Users Admin",
        username: "users_test_admin", email: "users_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;
  });

  it("creates a user, lists it, updates it, assigns a branch, and disables it", async () => {
    const create = await request(app).post("/api/users").set("Cookie", [cookie]).send({
      firstName: "Nueva", lastName: "Vendedora", displayName: "Nueva Vendedora",
      username: "nueva_vendedora", email: "nueva@bellamakeup.demo", password: "Password#123", roleId: cashierRoleId,
    });
    expect(create.status).toBe(201);
    expect(create.body.passwordHash).toBeUndefined();
    const id = create.body.id;

    const list = await request(app).get("/api/users").set("Cookie", [cookie]);
    expect(list.body.some((u: any) => u.id === id)).toBe(true);

    const assign = await request(app).put(`/api/users/${id}/branches`).set("Cookie", [cookie]).send({ branchIds: [branchId], allBranches: false });
    expect(assign.body.branches.map((b: any) => b.id)).toContain(branchId);

    const disable = await request(app).patch(`/api/users/${id}/status`).set("Cookie", [cookie]).send({ status: "DISABLED" });
    expect(disable.body.status).toBe("DISABLED");
  });
});
```

Run: `npx vitest run tests/users.test.ts`
Expected: FAIL — 404.

- [ ] **Step 2: `src/validators/user.validators.ts`**

```typescript
import { z } from "zod";

export const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().min(1),
  username: z.string().min(3),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  roleId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
});

export const updateUserStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export const assignBranchesSchema = z.object({
  branchIds: z.array(z.string().uuid()),
  allBranches: z.boolean(),
});
```

- [ ] **Step 3: `src/services/userService.ts`**

```typescript
import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import * as userRepository from "../repositories/userRepository";
import { hashPassword } from "../utils/password";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

function toDTO(user: any) {
  const { passwordHash, userBranches, ...rest } = user;
  return { ...rest, branches: userBranches?.map((ub: any) => ub.branch) ?? [] };
}

export async function listUsers() {
  const users = await userRepository.listUsers();
  return users.map(toDTO);
}

export async function createUser(input: any, actorId: string) {
  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.createUser({
    firstName: input.firstName, lastName: input.lastName, displayName: input.displayName,
    username: input.username, email: input.email, phone: input.phone,
    passwordHash, avatarSeed: randomUUID(), roleId: input.roleId,
  });
  await logAudit({ userId: actorId, action: "users.create", module: "users", entityType: "user", entityId: user.id, details: { username: user.username } });
  return toDTO(user);
}

export async function updateUser(id: string, input: any, actorId: string) {
  const user = await userRepository.updateUser(id, input);
  await logAudit({ userId: actorId, action: "users.update", module: "users", entityType: "user", entityId: id });
  return toDTO(user);
}

export async function updateUserStatus(id: string, status: "ACTIVE" | "DISABLED", actorId: string) {
  const user = await userRepository.updateUser(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "users.enable" : "users.disable", module: "users", entityType: "user", entityId: id });
  return toDTO(user);
}

export async function assignBranches(id: string, branchIds: string[], allBranches: boolean, actorId: string) {
  const existing = await userRepository.findUserById(id);
  if (!existing) throw new AppError(404, "Usuario no encontrado");

  await prisma.$transaction([
    prisma.userBranch.deleteMany({ where: { userId: id } }),
    prisma.userBranch.createMany({ data: branchIds.map((branchId) => ({ userId: id, branchId })) }),
    prisma.user.update({ where: { id }, data: { allBranches } }),
  ]);
  await logAudit({ userId: actorId, action: "users.assign_branches", module: "users", entityType: "user", entityId: id, details: { branchIds, allBranches } });

  const updated = await userRepository.findUserById(id);
  return toDTO(updated);
}
```

- [ ] **Step 4: `src/controllers/userController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { createUserSchema, updateUserSchema, updateUserStatusSchema, assignBranchesSchema } from "../validators/user.validators";
import * as userService from "../services/userService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await userService.listUsers()); } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createUserSchema.parse(req.body);
    res.status(201).json(await userService.createUser(data, req.user!.id));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateUserSchema.parse(req.body);
    res.json(await userService.updateUser(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateUserStatusSchema.parse(req.body);
    res.json(await userService.updateUserStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}

export async function assignBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const { branchIds, allBranches } = assignBranchesSchema.parse(req.body);
    res.json(await userService.assignBranches(req.params.id, branchIds, allBranches, req.user!.id));
  } catch (err) { next(err); }
}
```

- [ ] **Step 5: `src/routes/user.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as userController from "../controllers/userController";

const router = Router();
router.get("/", requireAuth, requirePermission("users.view"), userController.list);
router.post("/", requireAuth, requirePermission("users.create"), userController.create);
router.put("/:id", requireAuth, requirePermission("users.edit"), userController.update);
router.patch("/:id/status", requireAuth, requirePermission("users.disable"), userController.updateStatus);
router.put("/:id/branches", requireAuth, requirePermission("users.edit"), userController.assignBranches);
export default router;
```

- [ ] **Step 6: Mount in `app.ts`, run tests, commit**

```typescript
import userRoutes from "./routes/user.routes";
app.use("/api/users", userRoutes);
```

Run: `npx vitest run tests/users.test.ts` → Expected: PASS (1 test).

```bash
git add BellaBack/src BellaBack/tests/users.test.ts
git commit -m "feat(backend): users CRUD and branch assignment"
```

---

### Task 10: Profile endpoints + DiceBear avatar helper (TDD)

**Files:**
- Create: `BellaBack/src/utils/avatar.ts`
- Create: `BellaBack/src/services/profileService.ts`
- Create: `BellaBack/src/controllers/profileController.ts`
- Create: `BellaBack/src/routes/profile.routes.ts`
- Create: `BellaBack/src/validators/profile.validators.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/profile.test.ts`
- Test: `BellaBack/tests/avatar.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 5), `hashPassword`/`comparePassword` (Task 3), `logAudit` (Task 4).
- Produces: `generateRandomSeed(): string` and `buildAvatarUrl(style: string, seed: string): string` from `avatar.ts` (also used by `userService.createUser` in Task 9). `GET /api/profile`, `PUT /api/profile`, `PUT /api/profile/password`, `GET /api/profile/avatar-options?count=6`, `PUT /api/profile/avatar`.

- [ ] **Step 1: Write failing test for avatar util**

```typescript
// tests/avatar.test.ts
import { describe, it, expect } from "vitest";
import { generateRandomSeed, buildAvatarUrl } from "../src/utils/avatar";

describe("avatar utils", () => {
  it("generates a non-empty random seed", () => {
    const seed = generateRandomSeed();
    expect(seed.length).toBeGreaterThan(0);
  });

  it("builds a DiceBear adventurer URL from style and seed", () => {
    const url = buildAvatarUrl("adventurer", "bella-admin");
    expect(url).toBe("https://api.dicebear.com/9.x/adventurer/svg?seed=bella-admin");
  });
});
```

Run: `npx vitest run tests/avatar.test.ts` → Expected: FAIL — module not found.

- [ ] **Step 2: `src/utils/avatar.ts`**

```typescript
import { randomUUID } from "crypto";

const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

export function generateRandomSeed(): string {
  return randomUUID();
}

export function buildAvatarUrl(style: string, seed: string): string {
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export function generateAvatarOptions(style: string, count: number): Array<{ seed: string; url: string }> {
  return Array.from({ length: count }, () => {
    const seed = generateRandomSeed();
    return { seed, url: buildAvatarUrl(style, seed) };
  });
}
```

Run: `npx vitest run tests/avatar.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 3: Write failing test for profile endpoints**

```typescript
// tests/profile.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Profile endpoints", () => {
  let cookie: string;

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const user = await prisma.user.upsert({
      where: { username: "profile_test_user" },
      update: {},
      create: {
        firstName: "Profile", lastName: "Test", displayName: "Profile Test",
        username: "profile_test_user", email: "profile_test_user@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "original-seed", roleId: role.id,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: role.id })}`;
  });

  it("gets and updates the profile, changes password, and changes avatar", async () => {
    const get = await request(app).get("/api/profile").set("Cookie", [cookie]);
    expect(get.status).toBe(200);
    expect(get.body.passwordHash).toBeUndefined();

    const update = await request(app).put("/api/profile").set("Cookie", [cookie]).send({ displayName: "Nuevo Nombre" });
    expect(update.body.displayName).toBe("Nuevo Nombre");

    const options = await request(app).get("/api/profile/avatar-options?count=4").set("Cookie", [cookie]);
    expect(options.body.length).toBe(4);
    const chosenSeed = options.body[0].seed;

    const avatarUpdate = await request(app).put("/api/profile/avatar").set("Cookie", [cookie]).send({ seed: chosenSeed });
    expect(avatarUpdate.body.avatarSeed).toBe(chosenSeed);

    const passwordUpdate = await request(app).put("/api/profile/password").set("Cookie", [cookie]).send({ currentPassword: "Password#123", newPassword: "NewPassword#456" });
    expect(passwordUpdate.status).toBe(200);
  });

  it("rejects a password change with an incorrect current password", async () => {
    const res = await request(app).put("/api/profile/password").set("Cookie", [cookie]).send({ currentPassword: "wrong", newPassword: "NewPassword#456" });
    expect(res.status).toBe(400);
  });
});
```

Run: `npx vitest run tests/profile.test.ts` → Expected: FAIL — 404.

- [ ] **Step 4: `src/validators/profile.validators.ts`**

```typescript
import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const updateAvatarSchema = z.object({
  style: z.string().default("adventurer"),
  seed: z.string().min(1),
});
```

- [ ] **Step 5: `src/services/profileService.ts`**

```typescript
import { findUserById, updateUser } from "../repositories/userRepository";
import { comparePassword, hashPassword } from "../utils/password";
import { generateAvatarOptions } from "../utils/avatar";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";
import { toPublicUser } from "./authService";

export async function getProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, "Usuario no encontrado");
  return toPublicUser(user);
}

export async function updateProfile(userId: string, input: any) {
  const user = await updateUser(userId, input);
  await logAudit({ userId, action: "profile.update", module: "profile", entityType: "user", entityId: userId });
  return toPublicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  await updateUser(userId, { passwordHash: await hashPassword(newPassword) });
  await logAudit({ userId, action: "profile.change_password", module: "profile", entityType: "user", entityId: userId });
}

export function getAvatarOptions(style: string, count: number) {
  return generateAvatarOptions(style, count);
}

export async function changeAvatar(userId: string, style: string, seed: string) {
  const user = await updateUser(userId, { avatarStyle: style, avatarSeed: seed });
  await logAudit({ userId, action: "profile.change_avatar", module: "profile", entityType: "user", entityId: userId });
  return toPublicUser(user);
}
```

- [ ] **Step 6: `src/controllers/profileController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { updateProfileSchema, updatePasswordSchema, updateAvatarSchema } from "../validators/profile.validators";
import * as profileService from "../services/profileService";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json(await profileService.getProfile(req.user!.id)); } catch (err) { next(err); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateProfileSchema.parse(req.body);
    res.json(await profileService.updateProfile(req.user!.id, data));
  } catch (err) { next(err); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
    await profileService.changePassword(req.user!.id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export function getAvatarOptions(req: Request, res: Response) {
  const count = Number(req.query.count ?? 6);
  res.json(profileService.getAvatarOptions("adventurer", count));
}

export async function changeAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    const { style, seed } = updateAvatarSchema.parse(req.body);
    res.json(await profileService.changeAvatar(req.user!.id, style, seed));
  } catch (err) { next(err); }
}
```

- [ ] **Step 7: `src/routes/profile.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as profileController from "../controllers/profileController";

const router = Router();
router.get("/", requireAuth, profileController.getProfile);
router.put("/", requireAuth, profileController.updateProfile);
router.put("/password", requireAuth, profileController.changePassword);
router.get("/avatar-options", requireAuth, profileController.getAvatarOptions);
router.put("/avatar", requireAuth, profileController.changeAvatar);
export default router;
```

- [ ] **Step 8: Mount in `app.ts`, run tests, commit**

```typescript
import profileRoutes from "./routes/profile.routes";
app.use("/api/profile", profileRoutes);
```

Run: `npx vitest run tests/profile.test.ts` → Expected: PASS (2 tests).

```bash
git add BellaBack/src BellaBack/tests/profile.test.ts BellaBack/tests/avatar.test.ts
git commit -m "feat(backend): profile endpoints with DiceBear avatar selection"
```

---

### Task 11: Company settings endpoint (TDD)

**Files:**
- Create: `BellaBack/src/repositories/companySettingsRepository.ts`
- Create: `BellaBack/src/services/companySettingsService.ts`
- Create: `BellaBack/src/controllers/companySettingsController.ts`
- Create: `BellaBack/src/routes/companySettings.routes.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/companySettings.test.ts`

**Interfaces:**
- Consumes: `requireAuth`/`requirePermission` (Tasks 5–6), `logAudit` (Task 4).
- Produces: `GET /api/company-settings`, `PUT /api/company-settings` → `CompanySettings` DTO. Consumed by frontend Company Settings page (Task 26) and later by ticket configuration in Phase 4.

- [ ] **Step 1: Write failing test**

```typescript
// tests/companySettings.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Company settings", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "settings_test_admin" },
      update: {},
      create: {
        firstName: "Settings", lastName: "Admin", displayName: "Settings Admin",
        username: "settings_test_admin", email: "settings_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("gets and updates company settings", async () => {
    const get = await request(app).get("/api/company-settings").set("Cookie", [cookie]);
    expect(get.status).toBe(200);
    expect(get.body.companyName).toBe("Bella Makeup");

    const update = await request(app).put("/api/company-settings").set("Cookie", [cookie]).send({ phone: "555-999-0000" });
    expect(update.body.phone).toBe("555-999-0000");
  });
});
```

Run: `npx vitest run tests/companySettings.test.ts` → Expected: FAIL — 404.

- [ ] **Step 2: `src/repositories/companySettingsRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export async function getCompanySettings() {
  const existing = await prisma.companySettings.findFirst();
  if (existing) return existing;
  return prisma.companySettings.create({ data: { companyName: "Bella Makeup" } });
}

export async function updateCompanySettings(id: string, data: Prisma.CompanySettingsUpdateInput) {
  return prisma.companySettings.update({ where: { id }, data });
}
```

- [ ] **Step 3: `src/services/companySettingsService.ts`**

```typescript
import * as repo from "../repositories/companySettingsRepository";
import { logAudit } from "./auditService";

export const getSettings = () => repo.getCompanySettings();

export async function updateSettings(input: any, actorId: string) {
  const current = await repo.getCompanySettings();
  const updated = await repo.updateCompanySettings(current.id, input);
  await logAudit({ userId: actorId, action: "settings.update", module: "settings", entityType: "company_settings", entityId: updated.id });
  return updated;
}
```

- [ ] **Step 4: `src/controllers/companySettingsController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import * as service from "../services/companySettingsService";

export async function get(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getSettings()); } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.updateSettings(req.body, req.user!.id)); } catch (err) { next(err); }
}
```

- [ ] **Step 5: `src/routes/companySettings.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as controller from "../controllers/companySettingsController";

const router = Router();
router.get("/", requireAuth, controller.get);
router.put("/", requireAuth, requirePermission("settings.manage"), controller.update);
export default router;
```

- [ ] **Step 6: Mount in `app.ts`, run tests, commit**

```typescript
import companySettingsRoutes from "./routes/companySettings.routes";
app.use("/api/company-settings", companySettingsRoutes);
```

Run: `npx vitest run tests/companySettings.test.ts` → Expected: PASS (1 test).

```bash
git add BellaBack/src BellaBack/tests/companySettings.test.ts
git commit -m "feat(backend): company settings endpoint"
```

---

### Task 12: Audit list endpoint

**Files:**
- Create: `BellaBack/src/controllers/auditController.ts`
- Create: `BellaBack/src/routes/audit.routes.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/audit.routes.test.ts`

**Interfaces:**
- Consumes: `listAudit` (Task 4), `requireAuth`/`requirePermission` (Tasks 5–6).
- Produces: `GET /api/audit?module=&userId=&branchId=&from=&to=&page=&pageSize=` → `{ items: AuditLogDTO[], total, page, pageSize }` where `AuditLogDTO` includes `user: { id, displayName, avatarStyle, avatarSeed } | null` and `branch: { id, name } | null`. Consumed by frontend Audit page (Task 27).

- [ ] **Step 1: Write failing test**

```typescript
// tests/audit.routes.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("GET /api/audit", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "audit_route_test_admin" },
      update: {},
      create: {
        firstName: "Audit", lastName: "Admin", displayName: "Audit Admin",
        username: "audit_route_test_admin", email: "audit_route_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("lists paginated audit entries with user info", async () => {
    const res = await request(app).get("/api/audit?page=1&pageSize=10").set("Cookie", [cookie]);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });
});
```

Run: `npx vitest run tests/audit.routes.test.ts` → Expected: FAIL — 404.

- [ ] **Step 2: `src/controllers/auditController.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { listAudit } from "../services/auditService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { module, userId, branchId, from, to, page, pageSize } = req.query;
    const result = await listAudit({
      module: module as string | undefined,
      userId: userId as string | undefined,
      branchId: branchId as string | undefined,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    res.json({ items: result.items, total: result.total, page: Number(page ?? 1), pageSize: Number(pageSize ?? 25) });
  } catch (err) { next(err); }
}
```

- [ ] **Step 3: `src/routes/audit.routes.ts`**

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as auditController from "../controllers/auditController";

const router = Router();
router.get("/", requireAuth, requirePermission("audit.view"), auditController.list);
export default router;
```

- [ ] **Step 4: Mount in `app.ts`, run tests, commit**

```typescript
import auditRoutes from "./routes/audit.routes";
app.use("/api/audit", auditRoutes);
```

Run: `npx vitest run tests/audit.routes.test.ts` → Expected: PASS (1 test).

```bash
git add BellaBack/src BellaBack/tests/audit.routes.test.ts
git commit -m "feat(backend): GET /api/audit with filters and pagination"
```

---

### Task 13: Final backend wiring — error handler, security middleware, rate limiting, full-stack smoke test

**Files:**
- Create: `BellaBack/src/middleware/errorHandler.ts`
- Modify: `BellaBack/src/app.ts`
- Test: `BellaBack/tests/smoke.test.ts`

**Interfaces:**
- Consumes: every route module from Tasks 5–12.
- Produces: the final wired `app` used by `server.ts` and by all backend tests.

- [ ] **Step 1: `src/middleware/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Datos inválidos", issues: err.issues });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: "Error interno del servidor" });
}
```

- [ ] **Step 2: Finalize `src/app.ts`**

```typescript
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import roleRoutes from "./routes/role.routes";
import branchRoutes from "./routes/branch.routes";
import profileRoutes from "./routes/profile.routes";
import companySettingsRoutes from "./routes/companySettings.routes";
import auditRoutes from "./routes/audit.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (env.NODE_ENV !== "test") app.use(morgan("dev"));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", loginLimiter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/audit", auditRoutes);

app.use(errorHandler);

export default app;
```

- [ ] **Step 3: Write and run a full-flow smoke test**

```typescript
// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("full-stack smoke flow", () => {
  it("logs in as the seeded admin, reads /api/auth/me, lists branches, and logs out", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "BellaAdmin#2026" });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"];

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("admin");

    const branches = await request(app).get("/api/branches").set("Cookie", cookies);
    expect(branches.status).toBe(200);
    expect(branches.body.length).toBeGreaterThanOrEqual(2);

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect(logout.status).toBe(200);
  });
});
```

Run: `npm run prisma:seed && npx vitest run`
Expected: all backend test files PASS.

- [ ] **Step 4: Commit**

```bash
git add BellaBack/src/middleware/errorHandler.ts BellaBack/src/app.ts BellaBack/tests/smoke.test.ts
git commit -m "feat(backend): security middleware, error handler, and full-flow smoke test"
```

---

## Frontend Tasks

### Task 14: Vite + React + TypeScript scaffold

**Files:**
- Create: `BellaFront/package.json`, `BellaFront/vite.config.ts`, `BellaFront/tsconfig.json`, `BellaFront/tsconfig.node.json`, `BellaFront/index.html`
- Create: `BellaFront/src/main.tsx`, `BellaFront/src/app/App.tsx`
- Create: `BellaFront/.gitignore`

**Interfaces:**
- Produces: a running Vite dev server on port 5173 rendering `<App />`, the mount point later tasks build on top of.

- [ ] **Step 1: Scaffold with Vite and install extra deps**

Run: `cd BellaFront && npm create vite@latest . -- --template react-ts` (accept overwriting the empty `src/` since it only has empty folders), then:

Run: `npm install react-router-dom lucide-react @fontsource/outfit @fontsource/inter`

- [ ] **Step 2: `.gitignore`**

```
node_modules
dist
.env
```

- [ ] **Step 3: Restore project folder structure inside `src/`** (Vite's template creates its own `src/`; recreate the empty folders the plan's File Structure section expects: `app`, `assets`, `components`, `context`, `hooks`, `pages`, `services`, `styles`, `types` — Vite's default `App.tsx`/`App.css`/`assets/react.svg` get removed/replaced in Task 15–17.)

- [ ] **Step 4: Minimal `src/app/App.tsx` and updated `src/main.tsx`**

```tsx
// src/app/App.tsx
export default function App() {
  return <div>Bella Makeup</div>;
}
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Verify it runs**

Run: `npm run dev`
Expected: dev server starts on `http://localhost:5173` and the page renders "Bella Makeup" with no console errors.

- [ ] **Step 6: Commit**

```bash
git add BellaFront
git commit -m "chore(frontend): Vite + React + TypeScript scaffold"
```

---

### Task 15: Design tokens, fonts, global styles

**Files:**
- Create: `BellaFront/src/styles/tokens.css`
- Create: `BellaFront/src/styles/global.css`
- Modify: `BellaFront/src/main.tsx`

**Interfaces:**
- Produces: CSS custom properties (`--color-*`, `--font-*`, `--space-*`) available globally, consumed by every component in later tasks via plain CSS/CSS Modules (no CSS-in-JS dependency added).

- [ ] **Step 1: `src/styles/tokens.css`**

```css
:root {
  --color-primary: #18181B;
  --color-bg: #F7F3F1;
  --color-white: #FFFFFF;
  --color-pink-soft: #F4D9DC;
  --color-pink-elegant: #DFA8B2;
  --color-pink-deep: #A85C70;
  --color-text-secondary: #6F6868;
  --color-border: #E7DDDA;
  --color-accent: #9FFF00;

  --font-heading: "Outfit", sans-serif;
  --font-body: "Inter", sans-serif;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;
  --space-6: 48px;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
}
```

- [ ] **Step 2: `src/styles/global.css`**

```css
@import "@fontsource/outfit/500.css";
@import "@fontsource/outfit/600.css";
@import "@fontsource/outfit/700.css";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "./tokens.css";

* {
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 {
  font-family: var(--font-heading);
  font-weight: 600;
  margin: 0;
}

button {
  font-family: var(--font-body);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Import in `main.tsx`**

```tsx
import "./styles/global.css";
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev`, open the browser.
Expected: page background is `#F7F3F1`, text renders in Inter, no 404s for font files in the Network tab.

- [ ] **Step 5: Commit**

```bash
git add BellaFront/src/styles BellaFront/src/main.tsx
git commit -m "feat(frontend): design tokens and global styles (palette, Outfit/Inter)"
```

---

### Task 16: API client, shared types, AuthContext

**Files:**
- Create: `BellaFront/src/types/api.ts`
- Create: `BellaFront/src/services/apiClient.ts`
- Create: `BellaFront/src/services/authService.ts`
- Create: `BellaFront/src/context/AuthContext.tsx`
- Create: `BellaFront/src/hooks/useAuth.ts`, `BellaFront/src/hooks/usePermission.ts`
- Create: `BellaFront/.env`, `BellaFront/.env.example`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (throws `ApiError` with `.status` on non-2xx, auto-retries once after a silent `/api/auth/refresh` on 401). `AuthProvider`, `useAuth()` → `{ user, loading, login, logout }`. `usePermission(code: string): boolean`. `User`, `Role`, `Branch`, `AuditLogEntry`, `CompanySettings` types matching the backend DTOs from Tasks 5–12. Consumed by every service and page from Task 18 onward.

- [ ] **Step 1: `.env` / `.env.example`**

```
VITE_API_URL=http://localhost:4000/api
```

- [ ] **Step 2: `src/types/api.ts`**

```typescript
export interface Branch {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  schedule?: string | null;
  managerName?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
  assignedUsersCount: number;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  username: string;
  email: string;
  phone?: string | null;
  avatarStyle: string;
  avatarSeed: string;
  roleId: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  allBranches: boolean;
  branches: Branch[];
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  address?: string | null;
  phone?: string | null;
  socialLinks?: Record<string, string> | null;
  logoUrl?: string | null;
  currency: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  branch: { id: string; name: string } | null;
  details?: Record<string, unknown> | null;
}
```

- [ ] **Step 3: `src/services/apiClient.ts`**

```typescript
const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      .then((res) => res.ok)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (res.status === 401 && !_retried && path !== "/auth/login") {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, options, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Error de red");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: `src/services/authService.ts`**

```typescript
import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export function login(username: string, password: string) {
  return apiFetch<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout() {
  return apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
}

export function me() {
  return apiFetch<{ user: User }>("/auth/me");
}
```

- [ ] **Step 5: `src/context/AuthContext.tsx`**

```tsx
import { createContext, useCallback, useEffect, useState, ReactNode } from "react";
import type { User } from "../types/api";
import * as authService from "../services/authService";
import { ApiError } from "../services/apiClient";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user } = await authService.login(username, password);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 6: `src/hooks/useAuth.ts` and `src/hooks/usePermission.ts`**

```typescript
// src/hooks/useAuth.ts
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

```typescript
// src/hooks/usePermission.ts
import { useAuth } from "./useAuth";

export function usePermission(code: string): boolean {
  const { user } = useAuth();
  return !!user?.role.permissions.includes(code);
}
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run build` (or `tsc --noEmit`)
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add BellaFront/src/types BellaFront/src/services BellaFront/src/context BellaFront/src/hooks BellaFront/.env.example
git commit -m "feat(frontend): API client, shared types, AuthContext with token refresh"
```

---

### Task 17: App shell (Sidebar/Topbar/Avatar), ProtectedRoute, PermissionGate, router

**Files:**
- Create: `BellaFront/src/components/common/Avatar.tsx`
- Create: `BellaFront/src/components/common/StatusState.tsx`
- Create: `BellaFront/src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `UserMenu.tsx`
- Create: `BellaFront/src/components/auth/ProtectedRoute.tsx`, `PermissionGate.tsx`
- Create: `BellaFront/src/app/router.tsx`
- Modify: `BellaFront/src/app/App.tsx`

**Interfaces:**
- Consumes: `useAuth`, `usePermission` (Task 16), `User`/`Role` types (Task 16).
- Produces: `<Avatar user={{ avatarStyle, avatarSeed, displayName }} size="sm"|"md"|"lg" />` (used everywhere an avatar is shown — profile, menu, audit), `<StatusState kind="loading"|"empty"|"error" message?={string} />`, `<AppShell>` (sidebar+topbar layout wrapper for authenticated pages), `<ProtectedRoute>` (redirects to `/login` if unauthenticated), `<PermissionGate code="...">` (renders children only if `usePermission(code)` is true). `router` exported from `router.tsx`, mounted by `App.tsx`.

- [ ] **Step 1: `src/components/common/Avatar.tsx`**

```tsx
import { buildAvatarUrl } from "../../services/avatarUrl";

interface AvatarProps {
  avatarStyle: string;
  avatarSeed: string;
  displayName: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX: Record<NonNullable<AvatarProps["size"]>, number> = { sm: 28, md: 40, lg: 96 };

export function Avatar({ avatarStyle, avatarSeed, displayName, size = "md" }: AvatarProps) {
  const px = SIZE_PX[size];
  return (
    <img
      src={buildAvatarUrl(avatarStyle, avatarSeed)}
      alt={`Avatar de ${displayName}`}
      width={px}
      height={px}
      style={{ borderRadius: "50%", border: "1px solid var(--color-border)", background: "var(--color-white)" }}
    />
  );
}
```

Create `src/services/avatarUrl.ts` (shared with `AvatarPicker` in Task 19):

```typescript
const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

export function buildAvatarUrl(style: string, seed: string): string {
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
```

- [ ] **Step 2: `src/components/common/StatusState.tsx`**

```tsx
import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import "./StatusState.css";

interface StatusStateProps {
  kind: "loading" | "empty" | "error";
  message?: string;
}

const DEFAULTS: Record<StatusStateProps["kind"], string> = {
  loading: "Cargando...",
  empty: "Sin resultados por ahora.",
  error: "Ocurrió un error. Intenta de nuevo.",
};

export function StatusState({ kind, message }: StatusStateProps) {
  const Icon = kind === "loading" ? Loader2 : kind === "empty" ? Inbox : AlertTriangle;
  return (
    <div className={`status-state status-state--${kind}`}>
      <Icon size={28} className={kind === "loading" ? "spin" : undefined} />
      <p>{message ?? DEFAULTS[kind]}</p>
    </div>
  );
}
```

```css
/* src/components/common/StatusState.css */
.status-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-3);
  color: var(--color-text-secondary);
  text-align: center;
}
.status-state--error { color: var(--color-pink-deep); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 3: `src/components/auth/ProtectedRoute.tsx` and `PermissionGate.tsx`**

```tsx
// src/components/auth/ProtectedRoute.tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { StatusState } from "../common/StatusState";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <StatusState kind="loading" message="Verificando sesión..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

```tsx
// src/components/auth/PermissionGate.tsx
import { ReactNode } from "react";
import { usePermission } from "../../hooks/usePermission";

export function PermissionGate({ code, children }: { code: string; children: ReactNode }) {
  const allowed = usePermission(code);
  if (!allowed) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: `src/components/layout/UserMenu.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `AppShell.tsx`**

```tsx
// src/components/layout/UserMenu.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../common/Avatar";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="user-menu">
      <button className="user-menu__trigger" onClick={() => setOpen((o) => !o)}>
        <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="sm" />
        <span>{user.displayName}</span>
      </button>
      {open && (
        <div className="user-menu__dropdown">
          <Link to="/perfil" onClick={() => setOpen(false)}><UserIcon size={16} /> Mi perfil</Link>
          <button onClick={() => logout()}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/components/layout/Sidebar.tsx
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, ShieldCheck, Building2, Settings, ScrollText } from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";

const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`;

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">Bella Makeup</div>
      <NavLink to="/" end className={linkClass}><LayoutDashboard size={18} /> Inicio</NavLink>
      <PermissionGate code="users.view">
        <NavLink to="/usuarios" className={linkClass}><Users size={18} /> Usuarios</NavLink>
      </PermissionGate>
      <PermissionGate code="roles.view">
        <NavLink to="/roles" className={linkClass}><ShieldCheck size={18} /> Roles</NavLink>
      </PermissionGate>
      <PermissionGate code="branches.view">
        <NavLink to="/sucursales" className={linkClass}><Building2 size={18} /> Sucursales</NavLink>
      </PermissionGate>
      <PermissionGate code="audit.view">
        <NavLink to="/auditoria" className={linkClass}><ScrollText size={18} /> Auditoría</NavLink>
      </PermissionGate>
      <PermissionGate code="settings.manage">
        <NavLink to="/configuracion" className={linkClass}><Settings size={18} /> Configuración</NavLink>
      </PermissionGate>
    </nav>
  );
}
```

```tsx
// src/components/layout/Topbar.tsx
import { UserMenu } from "./UserMenu";

export function Topbar() {
  return (
    <header className="topbar">
      <div />
      <UserMenu />
    </header>
  );
}
```

```tsx
// src/components/layout/AppShell.tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./AppShell.css";

export function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

```css
/* src/components/layout/AppShell.css */
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 240px;
  background: var(--color-white);
  border-right: 1px solid var(--color-border);
  padding: var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sidebar__brand { font-family: var(--font-heading); font-size: 1.25rem; margin-bottom: var(--space-4); }
.sidebar__link {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
  color: var(--color-primary); text-decoration: none; font-size: 0.95rem;
}
.sidebar__link--active { background: var(--color-pink-soft); color: var(--color-pink-deep); font-weight: 600; }
.app-shell__main { flex: 1; display: flex; flex-direction: column; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); background: var(--color-white); }
.app-shell__content { padding: var(--space-5); flex: 1; }
@media (max-width: 768px) {
  .app-shell { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--color-border); }
  .sidebar__brand { display: none; }
}
```

- [ ] **Step 5: `src/app/router.tsx` and updated `App.tsx`**

```tsx
// src/app/router.tsx
import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { UsersPage } from "../pages/users/UsersPage";
import { RolesPage } from "../pages/roles/RolesPage";
import { BranchesPage } from "../pages/branches/BranchesPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { AuditPage } from "../pages/audit/AuditPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <ProfilePage /> },
          { path: "/perfil", element: <ProfilePage /> },
          { path: "/usuarios", element: <UsersPage /> },
          { path: "/roles", element: <RolesPage /> },
          { path: "/sucursales", element: <BranchesPage /> },
          { path: "/configuracion", element: <CompanySettingsPage /> },
          { path: "/auditoria", element: <AuditPage /> },
        ],
      },
    ],
  },
]);
```

```tsx
// src/app/App.tsx
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { router } from "./router";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Verify it compiles (pages don't exist yet — this step only confirms wiring, Tasks 18–24 create the pages)**

This task's build will fail until Tasks 18–24 create the imported page components — that is expected. Move directly to Task 18 before attempting to run the app end-to-end (Task 25 is the first point everything compiles together).

- [ ] **Step 7: Commit**

```bash
git add BellaFront/src/components BellaFront/src/services/avatarUrl.ts BellaFront/src/app
git commit -m "feat(frontend): app shell, protected routing, permission gate, avatar/status components"
```

---

### Task 18: Login page

**Files:**
- Create: `BellaFront/src/pages/auth/LoginPage.tsx`
- Create: `BellaFront/src/pages/auth/LoginPage.css`

**Interfaces:**
- Consumes: `useAuth().login` (Task 16).
- Produces: the `/login` route element referenced by `router.tsx` (Task 17).

- [ ] **Step 1: `src/pages/auth/LoginPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import "./LoginPage.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Bella Makeup</h1>
        <p className="login-card__subtitle">Inicia sesión para continuar</p>

        <label htmlFor="username">Usuario o correo</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />

        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="login-card__error" role="alert">{error}</p>}

        <button type="submit" disabled={submitting}>{submitting ? "Ingresando..." : "Ingresar"}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `src/pages/auth/LoginPage.css`**

```css
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  padding: var(--space-3);
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.login-card h1 { font-family: var(--font-heading); font-size: 1.75rem; }
.login-card__subtitle { color: var(--color-text-secondary); margin: 0 0 var(--space-3); }
.login-card label { font-size: 0.85rem; color: var(--color-text-secondary); margin-top: var(--space-2); }
.login-card input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 1rem;
}
.login-card input:focus { outline: 2px solid var(--color-pink-elegant); border-color: transparent; }
.login-card button {
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--color-primary);
  color: var(--color-white);
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
}
.login-card button:disabled { opacity: 0.6; cursor: not-allowed; }
.login-card__error { color: var(--color-pink-deep); font-size: 0.9rem; }
```

- [ ] **Step 3: Commit**

```bash
git add BellaFront/src/pages/auth
git commit -m "feat(frontend): login page"
```

---

### Task 19: Profile page + DiceBear AvatarPicker

**Files:**
- Create: `BellaFront/src/services/profileService.ts`
- Create: `BellaFront/src/pages/profile/ProfilePage.tsx`, `ProfilePage.css`
- Create: `BellaFront/src/components/profile/AvatarPicker.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 16), `Avatar`, `StatusState` (Task 17).
- Produces: `getProfile()`, `updateProfile()`, `changePassword()`, `getAvatarOptions()`, `changeAvatar()` in `profileService.ts`, matching the backend contract from Task 10. `/perfil` route element.

- [ ] **Step 1: `src/services/profileService.ts`**

```typescript
import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export const getProfile = () => apiFetch<User>("/profile");

export const updateProfile = (input: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "email" | "phone">>) =>
  apiFetch<User>("/profile", { method: "PUT", body: JSON.stringify(input) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<{ ok: true }>("/profile/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) });

export const getAvatarOptions = (count = 6) =>
  apiFetch<Array<{ seed: string; url: string }>>(`/profile/avatar-options?count=${count}`);

export const changeAvatar = (seed: string, style = "adventurer") =>
  apiFetch<User>("/profile/avatar", { method: "PUT", body: JSON.stringify({ seed, style }) });
```

- [ ] **Step 2: `src/components/profile/AvatarPicker.tsx`**

```tsx
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAvatarOptions, changeAvatar } from "../../services/profileService";
import type { User } from "../../types/api";

export function AvatarPicker({ user, onChanged }: { user: User; onChanged: (u: User) => void }) {
  const [options, setOptions] = useState<Array<{ seed: string; url: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadOptions() {
    setLoading(true);
    try {
      setOptions(await getAvatarOptions(6));
    } finally {
      setLoading(false);
    }
  }

  async function pick(seed: string) {
    setSaving(seed);
    try {
      const updated = await changeAvatar(seed);
      onChanged(updated);
      setOptions([]);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="avatar-picker">
      <button type="button" onClick={loadOptions} disabled={loading} className="avatar-picker__generate">
        <RefreshCw size={16} className={loading ? "spin" : undefined} /> Generar opciones de avatar
      </button>
      {options.length > 0 && (
        <div className="avatar-picker__grid">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.seed}
              className="avatar-picker__option"
              disabled={saving === opt.seed}
              onClick={() => pick(opt.seed)}
            >
              <img src={opt.url} alt="Opción de avatar" width={64} height={64} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `src/pages/profile/ProfilePage.tsx`**

```tsx
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { AvatarPicker } from "../../components/profile/AvatarPicker";
import * as profileService from "../../services/profileService";
import { ApiError } from "../../services/apiClient";
import type { User } from "../../types/api";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user: sessionUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", displayName: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    profileService
      .getProfile()
      .then((u) => {
        setUser(u);
        setForm({ firstName: u.firstName, lastName: u.lastName, displayName: u.displayName, email: u.email, phone: u.phone ?? "" });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    try {
      const updated = await profileService.updateProfile(form);
      setUser(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    try {
      await profileService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordMessage({ type: "success", text: "Contraseña actualizada." });
      setPasswordForm({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña" });
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !user) return <StatusState kind="error" message="No se pudo cargar tu perfil." />;

  return (
    <div className="profile-page">
      <h1>Mi perfil</h1>

      <section className="profile-card">
        <div className="profile-card__header">
          <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
          <div>
            <h2>{user.displayName}</h2>
            <p>{user.role.name}{sessionUser?.allBranches ? " · Todas las sucursales" : ""}</p>
          </div>
        </div>
        <AvatarPicker user={user} onChanged={setUser} />
      </section>

      <form className="profile-card" onSubmit={handleSave}>
        <h2>Datos personales</h2>
        <label>Nombre<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
        <label>Apellido<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
        <label>Nombre mostrado<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <button type="submit" disabled={saveState === "saving"}>Guardar cambios</button>
        {saveState === "saved" && <p className="profile-card__success">Cambios guardados.</p>}
        {saveState === "error" && <p className="profile-card__error">No se pudo guardar. Intenta de nuevo.</p>}
      </form>

      <form className="profile-card" onSubmit={handlePasswordChange}>
        <h2>Cambiar contraseña</h2>
        <label>Contraseña actual<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required /></label>
        <label>Nueva contraseña<input type="password" minLength={8} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required /></label>
        <button type="submit">Actualizar contraseña</button>
        {passwordMessage && <p className={passwordMessage.type === "success" ? "profile-card__success" : "profile-card__error"}>{passwordMessage.text}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: `src/pages/profile/ProfilePage.css`**

```css
.profile-page { display: flex; flex-direction: column; gap: var(--space-4); max-width: 560px; }
.profile-card {
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.profile-card__header { display: flex; align-items: center; gap: var(--space-3); }
.profile-card label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--color-text-secondary); }
.profile-card input { padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: var(--font-body); }
.profile-card button { align-self: flex-start; margin-top: var(--space-2); padding: var(--space-2) var(--space-4); background: var(--color-primary); color: var(--color-white); border: none; border-radius: var(--radius-sm); cursor: pointer; }
.profile-card__success { color: var(--color-pink-deep); }
.profile-card__error { color: #B3261E; }
.avatar-picker__grid { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
.avatar-picker__option { border: 1px solid var(--color-border); border-radius: 50%; padding: 2px; background: var(--color-white); cursor: pointer; }
.avatar-picker__generate { display: inline-flex; align-items: center; gap: 6px; background: var(--color-pink-soft); border: none; border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); cursor: pointer; width: fit-content; }
```

- [ ] **Step 5: Commit**

```bash
git add BellaFront/src/services/profileService.ts BellaFront/src/pages/profile BellaFront/src/components/profile
git commit -m "feat(frontend): profile page with DiceBear avatar picker"
```

---

### Task 20: Users page (list, create/edit, activate/disable, branch assignment)

**Files:**
- Create: `BellaFront/src/services/userService.ts`, `BellaFront/src/services/branchService.ts`, `BellaFront/src/services/roleService.ts`
- Create: `BellaFront/src/pages/users/UsersPage.tsx`, `UserFormModal.tsx`, `UsersPage.css`
- Create: `BellaFront/src/components/common/Modal.tsx`, `Badge.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 16), `Avatar`/`StatusState` (Task 17), backend contracts from Tasks 8–9.
- Produces: `listUsers()`, `createUser()`, `updateUser()`, `updateUserStatus()`, `assignBranches()` in `userService.ts`; `listBranches()` in `branchService.ts` (reused by Task 22); `listRoles()` in `roleService.ts` (reused by Task 21). `<Modal open onClose title>`, `<Badge tone="success"|"neutral"|"danger">`.

- [ ] **Step 1: `src/services/branchService.ts` and `src/services/roleService.ts`**

```typescript
// src/services/branchService.ts
import { apiFetch } from "./apiClient";
import type { Branch } from "../types/api";

export const listBranches = () => apiFetch<Branch[]>("/branches");
export const createBranch = (input: Partial<Branch>) => apiFetch<Branch>("/branches", { method: "POST", body: JSON.stringify(input) });
export const updateBranch = (id: string, input: Partial<Branch>) => apiFetch<Branch>(`/branches/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const updateBranchStatus = (id: string, status: "ACTIVE" | "INACTIVE") => apiFetch<Branch>(`/branches/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
```

```typescript
// src/services/roleService.ts
import { apiFetch } from "./apiClient";
import type { Role } from "../types/api";

export const listRoles = () => apiFetch<Role[]>("/roles");
```

- [ ] **Step 2: `src/services/userService.ts`**

```typescript
import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export const listUsers = () => apiFetch<User[]>("/users");

export const createUser = (input: { firstName: string; lastName: string; displayName: string; username: string; email: string; phone?: string; password: string; roleId: string }) =>
  apiFetch<User>("/users", { method: "POST", body: JSON.stringify(input) });

export const updateUser = (id: string, input: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "email" | "phone" | "roleId">>) =>
  apiFetch<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const updateUserStatus = (id: string, status: "ACTIVE" | "DISABLED") =>
  apiFetch<User>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });

export const assignBranches = (id: string, branchIds: string[], allBranches: boolean) =>
  apiFetch<User>(`/users/${id}/branches`, { method: "PUT", body: JSON.stringify({ branchIds, allBranches }) });
```

- [ ] **Step 3: `src/components/common/Modal.tsx` and `Badge.tsx`**

```tsx
// src/components/common/Modal.tsx
import { ReactNode } from "react";
import { X } from "lucide-react";
import "./Modal.css";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
```

```css
/* src/components/common/Modal.css */
.modal-overlay { position: fixed; inset: 0; background: rgba(24,24,27,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--color-white); border-radius: var(--radius-lg); padding: var(--space-4); width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
.modal__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
.modal__header button { background: none; border: none; cursor: pointer; }
```

```tsx
// src/components/common/Badge.tsx
import "./Badge.css";

export function Badge({ tone, children }: { tone: "success" | "neutral" | "danger"; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
```

```css
/* src/components/common/Badge.css */
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.badge--success { background: var(--color-pink-soft); color: var(--color-pink-deep); }
.badge--neutral { background: #EFEFEF; color: var(--color-text-secondary); }
.badge--danger { background: #FBE5E1; color: #B3261E; }
```

- [ ] **Step 4: `src/pages/users/UserFormModal.tsx`**

```tsx
import { useState } from "react";
import { Modal } from "../../components/common/Modal";
import * as userService from "../../services/userService";
import type { Role, User } from "../../types/api";

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
  roles: Role[];
  editingUser?: User;
}

export function UserFormModal({ open, onClose, onSaved, roles, editingUser }: UserFormModalProps) {
  const [form, setForm] = useState({
    firstName: editingUser?.firstName ?? "",
    lastName: editingUser?.lastName ?? "",
    displayName: editingUser?.displayName ?? "",
    username: editingUser?.username ?? "",
    email: editingUser?.email ?? "",
    password: "",
    roleId: editingUser?.roleId ?? roles[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = editingUser
        ? await userService.updateUser(editingUser.id, form)
        : await userService.createUser(form);
      onSaved(saved);
      onClose();
    } catch {
      setError("No se pudo guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingUser ? "Editar usuario" : "Nuevo usuario"}>
      <form onSubmit={handleSubmit} className="user-form">
        <label>Nombre<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
        <label>Apellido<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
        <label>Nombre mostrado<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>Usuario<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required disabled={!!editingUser} /></label>
        <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        {!editingUser && (
          <label>Contraseña<input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        )}
        <label>Rol
          <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {error && <p className="user-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: `src/pages/users/UsersPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Plus, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { StatusState } from "../../components/common/StatusState";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { UserFormModal } from "./UserFormModal";
import * as userService from "../../services/userService";
import * as roleService from "../../services/roleService";
import * as branchService from "../../services/branchService";
import type { User, Role, Branch } from "../../types/api";
import "./UsersPage.css";

export function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>(undefined);

  useEffect(() => {
    Promise.all([userService.listUsers(), roleService.listRoles(), branchService.listBranches()])
      .then(([u, r, b]) => { setUsers(u); setRoles(r); setBranches(b); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  function upsertUser(user: User) {
    setUsers((prev) => {
      if (!prev) return [user];
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [user, ...prev];
    });
  }

  async function toggleStatus(user: User) {
    const updated = await userService.updateUserStatus(user.id, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
    upsertUser(updated);
  }

  async function toggleAllBranches(user: User, branchId: string) {
    const current = new Set(user.branches.map((b) => b.id));
    current.has(branchId) ? current.delete(branchId) : current.add(branchId);
    const updated = await userService.assignBranches(user.id, Array.from(current), user.allBranches);
    upsertUser(updated);
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error") return <StatusState kind="error" message="No se pudieron cargar los usuarios." />;

  return (
    <div className="users-page">
      <div className="users-page__header">
        <h1>Usuarios</h1>
        <PermissionGate code="users.create">
          <button onClick={() => { setEditingUser(undefined); setModalOpen(true); }}><Plus size={16} /> Nuevo usuario</button>
        </PermissionGate>
      </div>

      {users && users.length === 0 && <StatusState kind="empty" message="Todavía no hay usuarios." />}

      {users && users.length > 0 && (
        <table className="users-table">
          <thead>
            <tr><th></th><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Avatar avatarStyle={u.avatarStyle} avatarSeed={u.avatarSeed} displayName={u.displayName} size="sm" /></td>
                <td>{u.displayName}</td>
                <td>{u.username}</td>
                <td>{u.role.name}</td>
                <td>
                  {u.allBranches ? "Todas" : (
                    <select
                      multiple
                      value={u.branches.map((b) => b.id)}
                      onChange={(e) => {
                        const branchId = e.target.options[e.target.selectedIndex]?.value;
                        if (branchId) toggleAllBranches(u, branchId);
                      }}
                    >
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
                <td>
                  <PermissionGate code="users.edit">
                    <button onClick={() => { setEditingUser(u); setModalOpen(true); }} aria-label="Editar"><Pencil size={16} /></button>
                  </PermissionGate>
                  <PermissionGate code="users.disable">
                    <button onClick={() => toggleStatus(u)} aria-label="Cambiar estado">
                      {u.status === "ACTIVE" ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={upsertUser} roles={roles} editingUser={editingUser} />
    </div>
  );
}
```

- [ ] **Step 6: `src/pages/users/UsersPage.css`**

```css
.users-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.users-page__header button { display: inline-flex; align-items: center; gap: 6px; background: var(--color-primary); color: var(--color-white); border: none; border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); cursor: pointer; }
.users-table { width: 100%; border-collapse: collapse; background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.users-table th, .users-table td { padding: var(--space-2) var(--space-3); text-align: left; border-bottom: 1px solid var(--color-border); font-size: 0.9rem; }
.users-table button { background: none; border: none; cursor: pointer; padding: 4px; color: var(--color-text-secondary); }
@media (max-width: 768px) {
  .users-table thead { display: none; }
  .users-table, .users-table tbody, .users-table tr, .users-table td { display: block; width: 100%; }
  .users-table tr { border-bottom: 1px solid var(--color-border); padding: var(--space-2) 0; }
}
```

- [ ] **Step 7: Commit**

```bash
git add BellaFront/src/services/userService.ts BellaFront/src/services/branchService.ts BellaFront/src/services/roleService.ts BellaFront/src/components/common/Modal.tsx BellaFront/src/components/common/Modal.css BellaFront/src/components/common/Badge.tsx BellaFront/src/components/common/Badge.css BellaFront/src/pages/users
git commit -m "feat(frontend): users page with create/edit, status toggle, branch assignment"
```

---

### Task 21: Roles page (read-only: description, permissions, assigned users)

**Files:**
- Create: `BellaFront/src/pages/roles/RolesPage.tsx`, `RolesPage.css`

**Interfaces:**
- Consumes: `roleService.listRoles()` (Task 20), `StatusState` (Task 17).
- Produces: `/roles` route element. Phase 1 does not include custom role creation (spec section 51 only requires viewing name/description/permissions/assigned users) — no "create role" button is rendered, per the "no fake buttons" constraint.

- [ ] **Step 1: `src/pages/roles/RolesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { StatusState } from "../../components/common/StatusState";
import { listRoles } from "../../services/roleService";
import type { Role } from "../../types/api";
import "./RolesPage.css";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    listRoles()
      .then((r) => { setRoles(r); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !roles) return <StatusState kind="error" message="No se pudieron cargar los roles." />;

  return (
    <div className="roles-page">
      <h1>Roles</h1>
      <div className="roles-grid">
        {roles.map((role) => (
          <article key={role.id} className="role-card">
            <header>
              <h2>{role.name}</h2>
              <span className="role-card__count">{role.assignedUsersCount} usuario{role.assignedUsersCount === 1 ? "" : "s"}</span>
            </header>
            <p className="role-card__description">{role.description}</p>
            <div className="role-card__permissions">
              {role.permissions.map((p) => <span key={p} className="role-card__permission">{p}</span>)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/pages/roles/RolesPage.css`**

```css
.roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
.role-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); }
.role-card header { display: flex; justify-content: space-between; align-items: baseline; }
.role-card__count { font-size: 0.8rem; color: var(--color-text-secondary); }
.role-card__description { color: var(--color-text-secondary); font-size: 0.9rem; margin: var(--space-2) 0 var(--space-3); }
.role-card__permissions { display: flex; flex-wrap: wrap; gap: 6px; }
.role-card__permission { font-size: 0.72rem; background: var(--color-pink-soft); color: var(--color-pink-deep); padding: 2px 8px; border-radius: 999px; }
```

- [ ] **Step 3: Commit**

```bash
git add BellaFront/src/pages/roles
git commit -m "feat(frontend): roles page showing description, permissions, assigned users"
```

---

### Task 22: Branches page (CRUD + activation)

**Files:**
- Create: `BellaFront/src/pages/branches/BranchesPage.tsx`, `BranchFormModal.tsx`, `BranchesPage.css`

**Interfaces:**
- Consumes: `branchService` (Task 20), `Modal`/`Badge`/`StatusState` (Tasks 17, 20).
- Produces: `/sucursales` route element.

- [ ] **Step 1: `src/pages/branches/BranchFormModal.tsx`**

```tsx
import { useState } from "react";
import { Modal } from "../../components/common/Modal";
import * as branchService from "../../services/branchService";
import type { Branch } from "../../types/api";

export function BranchFormModal({ open, onClose, onSaved, editingBranch }: {
  open: boolean; onClose: () => void; onSaved: (b: Branch) => void; editingBranch?: Branch;
}) {
  const [form, setForm] = useState({
    name: editingBranch?.name ?? "",
    address: editingBranch?.address ?? "",
    phone: editingBranch?.phone ?? "",
    schedule: editingBranch?.schedule ?? "",
    managerName: editingBranch?.managerName ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = editingBranch
        ? await branchService.updateBranch(editingBranch.id, form)
        : await branchService.createBranch(form);
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingBranch ? "Editar sucursal" : "Nueva sucursal"}>
      <form onSubmit={handleSubmit} className="branch-form">
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Dirección<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Horario<input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} /></label>
        <label>Responsable<input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} /></label>
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: `src/pages/branches/BranchesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Badge } from "../../components/common/Badge";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { BranchFormModal } from "./BranchFormModal";
import * as branchService from "../../services/branchService";
import type { Branch } from "../../types/api";
import "./BranchesPage.css";

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | undefined>(undefined);

  useEffect(() => {
    branchService.listBranches()
      .then((b) => { setBranches(b); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  function upsert(branch: Branch) {
    setBranches((prev) => {
      if (!prev) return [branch];
      const exists = prev.some((b) => b.id === branch.id);
      return exists ? prev.map((b) => (b.id === branch.id ? branch : b)) : [...prev, branch];
    });
  }

  async function toggleStatus(branch: Branch) {
    const updated = await branchService.updateBranchStatus(branch.id, branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    upsert(updated);
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error") return <StatusState kind="error" message="No se pudieron cargar las sucursales." />;

  return (
    <div className="branches-page">
      <div className="branches-page__header">
        <h1>Sucursales</h1>
        <PermissionGate code="branches.manage">
          <button onClick={() => { setEditingBranch(undefined); setModalOpen(true); }}><Plus size={16} /> Nueva sucursal</button>
        </PermissionGate>
      </div>

      {branches && branches.length === 0 && <StatusState kind="empty" message="Todavía no hay sucursales." />}

      <div className="branches-grid">
        {branches?.map((b) => (
          <article key={b.id} className="branch-card">
            <header>
              <h2>{b.name}</h2>
              <Badge tone={b.status === "ACTIVE" ? "success" : "neutral"}>{b.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>
            </header>
            {b.address && <p>{b.address}</p>}
            {b.phone && <p>{b.phone}</p>}
            {b.schedule && <p>{b.schedule}</p>}
            {b.managerName && <p>Responsable: {b.managerName}</p>}
            <PermissionGate code="branches.manage">
              <div className="branch-card__actions">
                <button onClick={() => { setEditingBranch(b); setModalOpen(true); }}><Pencil size={14} /> Editar</button>
                <button onClick={() => toggleStatus(b)}><Power size={14} /> {b.status === "ACTIVE" ? "Desactivar" : "Activar"}</button>
              </div>
            </PermissionGate>
          </article>
        ))}
      </div>

      <BranchFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={upsert} editingBranch={editingBranch} />
    </div>
  );
}
```

- [ ] **Step 3: `src/pages/branches/BranchesPage.css`**

```css
.branches-page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.branches-page__header button { display: inline-flex; align-items: center; gap: 6px; background: var(--color-primary); color: var(--color-white); border: none; border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); cursor: pointer; }
.branches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
.branch-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); font-size: 0.9rem; color: var(--color-text-secondary); }
.branch-card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
.branch-card h2 { color: var(--color-primary); font-size: 1.1rem; }
.branch-card__actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
.branch-card__actions button { display: inline-flex; align-items: center; gap: 4px; background: var(--color-pink-soft); border: none; border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer; color: var(--color-pink-deep); }
```

- [ ] **Step 4: Commit**

```bash
git add BellaFront/src/pages/branches
git commit -m "feat(frontend): branches page with CRUD and activation"
```

---

### Task 23: Company settings page

**Files:**
- Create: `BellaFront/src/services/companySettingsService.ts`
- Create: `BellaFront/src/pages/settings/CompanySettingsPage.tsx`, `CompanySettingsPage.css`

**Interfaces:**
- Consumes: `apiFetch` (Task 16), backend contract from Task 11.
- Produces: `/configuracion` route element.

- [ ] **Step 1: `src/services/companySettingsService.ts`**

```typescript
import { apiFetch } from "./apiClient";
import type { CompanySettings } from "../types/api";

export const getCompanySettings = () => apiFetch<CompanySettings>("/company-settings");
export const updateCompanySettings = (input: Partial<CompanySettings>) =>
  apiFetch<CompanySettings>("/company-settings", { method: "PUT", body: JSON.stringify(input) });
```

- [ ] **Step 2: `src/pages/settings/CompanySettingsPage.tsx`**

```tsx
import { FormEvent, useEffect, useState } from "react";
import { StatusState } from "../../components/common/StatusState";
import * as settingsService from "../../services/companySettingsService";
import type { CompanySettings } from "../../types/api";
import "./CompanySettingsPage.css";

export function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    settingsService.getCompanySettings()
      .then((s) => { setSettings(s); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaveState("saving");
    try {
      const updated = await settingsService.updateCompanySettings(settings);
      setSettings(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !settings) return <StatusState kind="error" message="No se pudo cargar la configuración." />;

  return (
    <div className="settings-page">
      <h1>Configuración de la empresa</h1>
      <form className="settings-card" onSubmit={handleSubmit}>
        <label>Nombre comercial<input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} required /></label>
        <label>Dirección<input value={settings.address ?? ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></label>
        <label>Teléfono<input value={settings.phone ?? ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></label>
        <label>Moneda<input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></label>
        <button type="submit" disabled={saveState === "saving"}>Guardar cambios</button>
        {saveState === "saved" && <p className="settings-card__success">Cambios guardados.</p>}
        {saveState === "error" && <p className="settings-card__error">No se pudo guardar. Intenta de nuevo.</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 3: `src/pages/settings/CompanySettingsPage.css`**

```css
.settings-card { max-width: 480px; background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4); }
.settings-card label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--color-text-secondary); }
.settings-card input { padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: var(--font-body); }
.settings-card button { align-self: flex-start; margin-top: var(--space-2); padding: var(--space-2) var(--space-4); background: var(--color-primary); color: var(--color-white); border: none; border-radius: var(--radius-sm); cursor: pointer; }
.settings-card__success { color: var(--color-pink-deep); }
.settings-card__error { color: #B3261E; }
```

- [ ] **Step 4: Commit**

```bash
git add BellaFront/src/services/companySettingsService.ts BellaFront/src/pages/settings
git commit -m "feat(frontend): company settings page"
```

---

### Task 24: Audit page (`/auditoria`) with filters

**Files:**
- Create: `BellaFront/src/services/auditService.ts`
- Create: `BellaFront/src/pages/audit/AuditPage.tsx`, `AuditPage.css`

**Interfaces:**
- Consumes: `apiFetch` (Task 16), `Avatar`/`StatusState` (Task 17), backend contract from Task 12.
- Produces: `/auditoria` route element.

- [ ] **Step 1: `src/services/auditService.ts`**

```typescript
import { apiFetch } from "./apiClient";
import type { AuditLogEntry } from "../types/api";

export interface AuditFilters {
  module?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export function listAudit(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.module) params.set("module", filters.module);
  if (filters.branchId) params.set("branchId", filters.branchId);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 25));
  return apiFetch<{ items: AuditLogEntry[]; total: number; page: number; pageSize: number }>(`/audit?${params.toString()}`);
}
```

- [ ] **Step 2: `src/pages/audit/AuditPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { listAudit } from "../../services/auditService";
import * as branchService from "../../services/branchService";
import type { AuditLogEntry, Branch } from "../../types/api";
import "./AuditPage.css";

const MODULES = ["auth", "profile", "users", "branches", "settings"];

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [module, setModule] = useState("");
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    branchService.listBranches().then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    setStatus("loading");
    listAudit({ module: module || undefined, branchId: branchId || undefined, page })
      .then((res) => { setEntries(res.items); setTotal(res.total); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [module, branchId, page]);

  return (
    <div className="audit-page">
      <h1>Auditoría</h1>

      <div className="audit-filters">
        <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
          <option value="">Todos los módulos</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar la auditoría." />}
      {status === "ready" && entries?.length === 0 && <StatusState kind="empty" message="No hay eventos con estos filtros." />}

      {status === "ready" && entries && entries.length > 0 && (
        <ul className="audit-list">
          {entries.map((entry) => (
            <li key={entry.id} className="audit-item">
              {entry.user ? (
                <Avatar avatarStyle={entry.user.avatarStyle} avatarSeed={entry.user.avatarSeed} displayName={entry.user.displayName} size="sm" />
              ) : (
                <div className="audit-item__system-avatar" />
              )}
              <div>
                <p><strong>{entry.user?.displayName ?? "Sistema"}</strong> — {entry.action}</p>
                <p className="audit-item__meta">
                  {entry.module}{entry.branch ? ` · ${entry.branch.name}` : ""} · {new Date(entry.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 25 && (
        <div className="audit-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span>Página {page}</span>
          <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `src/pages/audit/AuditPage.css`**

```css
.audit-filters { display: flex; gap: var(--space-2); margin: var(--space-3) 0; }
.audit-filters select { padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: var(--font-body); }
.audit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.audit-item { display: flex; gap: var(--space-3); align-items: flex-start; background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
.audit-item p { margin: 0; font-size: 0.9rem; }
.audit-item__meta { color: var(--color-text-secondary); font-size: 0.78rem; margin-top: 2px !important; }
.audit-item__system-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--color-pink-soft); }
.audit-pagination { display: flex; gap: var(--space-3); align-items: center; margin-top: var(--space-3); }
.audit-pagination button { padding: var(--space-1) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-white); cursor: pointer; }
.audit-pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 4: Commit**

```bash
git add BellaFront/src/services/auditService.ts BellaFront/src/pages/audit
git commit -m "feat(frontend): audit page with module/branch filters and pagination"
```

---

### Task 25: Final integration pass — run both apps end-to-end, seed, manual smoke checklist, fix issues

**Files:**
- No new files expected; fixes land wherever the bug is (any file from Tasks 1–24).

**Interfaces:**
- Consumes: everything.
- Produces: a verified-working Phase 1 system.

- [ ] **Step 1: Boot the full stack**

Run, in order:
```bash
cd BellaBack && docker compose up -d
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```
In a second terminal:
```bash
cd BellaFront && npm run dev
```
Expected: backend on `http://localhost:4000`, frontend on `http://localhost:5173`, no startup errors in either terminal.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd BellaBack && npx vitest run`
Expected: every test file from Tasks 3–13 passes. Fix any failure before continuing (check Prisma migration is applied, `.env` values, and port conflicts first).

- [ ] **Step 3: Manual smoke checklist in the browser**

Open `http://localhost:5173` and verify, fixing any issue found before checking it off:
- [ ] Visiting `/` while logged out redirects to `/login`.
- [ ] Logging in with `admin` / `BellaAdmin#2026` succeeds and lands on `/perfil` (admin's default landing page in Phase 1).
- [ ] Sidebar shows Usuarios, Roles, Sucursales, Auditoría, Configuración (admin has every permission).
- [ ] `/perfil`: editing name/email and clicking "Guardar cambios" shows a success confirmation; "Generar opciones de avatar" shows 6 DiceBear images; picking one updates the avatar in the header immediately.
- [ ] `/usuarios`: create a test user with role "Vendedor / Cajero", confirm it appears in the list with the correct role and an auto-generated avatar.
- [ ] Log out, log back in as the new test user: sidebar should NOT show Usuarios, Roles, Sucursales, Auditoría, or Configuración (cashier role lacks those `*.view`/`*.manage` permissions).
- [ ] Log back in as `admin`. `/roles`: all 7 roles appear with their Spanish descriptions, permission chips, and correct assigned-user counts (cashier role should show 2: seeded none + the test user created above).
- [ ] `/sucursales`: create a branch, edit it, deactivate it, confirm the badge updates to "Inactiva".
- [ ] Assign the test user to one branch (not "todas") from `/usuarios`; confirm the assignment persists after a page refresh.
- [ ] `/configuracion`: update the phone number, confirm it persists after a refresh.
- [ ] `/auditoria`: confirm entries exist for the login, the profile update, the avatar change, the user creation, the branch creation/edit/deactivation, and the settings update — each with the correct actor avatar/name and a readable action label.
- [ ] Resize the browser to a mobile width (< 480px): sidebar collapses to a horizontal scrollable bar, no horizontal page overflow, forms and tables remain usable.
- [ ] Open DevTools Console and Network tabs while repeating the above: zero uncaught console errors, zero unexpected 4xx/5xx responses (401s during the initial `/auth/me` check before login are expected and handled).

- [ ] **Step 4: Fix any issues found, re-run Steps 2–3 until clean**

For each bug found, identify the owning file from the File Structure section, fix it there (not with a workaround in an unrelated file), and re-run the specific failing check.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(phase1): resolve issues found during end-to-end verification"
```

(Skip this commit if Steps 2–3 passed clean on the first try — do not create an empty commit.)

---
