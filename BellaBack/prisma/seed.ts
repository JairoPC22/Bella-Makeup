import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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
  { code: "transfers.view", description: "Ver transferencias entre sucursales" },
  { code: "transfers.create", description: "Crear transferencias entre sucursales" },
  { code: "transfers.receive", description: "Recibir transferencias entre sucursales" },
  { code: "transfers.cancel", description: "Cancelar transferencias entre sucursales" },
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
  { code: "purchases.cancel", description: "Cancelar compras" },
  // Supervisor co-sign permission for the PIN primitive
  // (POST /api/auth/verify-pin). Named after the existing
  // "discounts.authorize" precedent — an *authorize* permission marks
  // "this role may approve someone else's sensitive action", which is
  // exactly the question verify-pin asks of each candidate supervisor.
  // Granted to the same supervisor-grade roles discounts.authorize is
  // (Administrator + Branch Manager) and to nobody who merely operates
  // the purchasing module day to day.
  { code: "purchases.authorize", description: "Autorizar con PIN operaciones sensibles de compras" },
  { code: "suppliers.manage", description: "Gestionar proveedores" },
  // Caja (cash-drawer sessions). `cash.manage` is the POS-operator
  // permission: open your OWN shift and submit your OWN blind close.
  // `cash.audit` is the manager-oversight permission: read ANY session
  // (including other cashiers') and its revealed discrepancy history, plus
  // close a session on someone else's behalf (the forgotten end-of-day
  // sweep). Deliberately two separate codes rather than one: the whole
  // blind-count control collapses if the person counting the drawer is the
  // same person who can freely read every other drawer's expected totals.
  { code: "cash.manage", description: "Abrir y cerrar la caja propia" },
  { code: "cash.audit", description: "Auditar cortes de caja de cualquier cajero" },
  { code: "reports.view", description: "Ver reportes" },
  { code: "audit.view", description: "Ver auditoría" },
  { code: "ecommerce.manage", description: "Gestionar catálogo ecommerce" },
  { code: "orders.view", description: "Ver pedidos online" },
  { code: "orders.update", description: "Actualizar pedidos online" },
  { code: "settings.manage", description: "Gestionar configuración de la empresa" },
  { code: "messages.view", description: "Ver mensajes entre sucursales" },
  { code: "messages.send", description: "Enviar mensajes entre sucursales" },
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
      "transfers.view", "transfers.create", "transfers.receive", "transfers.cancel",
      "users.view", "branches.view", "reports.view", "audit.view",
      // Compras: a branch manager runs receiving on the ground, so they get
      // view/create/receive. They also get purchases.cancel because that is
      // exactly the precedent transfers.cancel already set for this role
      // (Administrator + Branch Manager are the only roles that may cancel a
      // transfer; the operator roles that create them — Almacenista — are
      // deliberately not trusted to unwind them). purchases.authorize follows
      // discounts.authorize's precedent: supervisor-grade roles only.
      "purchases.view", "purchases.create", "purchases.receive", "purchases.cancel", "purchases.authorize",
      // Caja: oversight only. A branch manager does NOT get cash.manage —
      // they don't ring up sales (no sales.create above), so they have no
      // drawer of their own to open. They get cash.audit, scoped exactly
      // the way transfers.cancel/purchases.cancel already were for this
      // role (Administrator + Branch Manager and nobody else), which also
      // carries the documented manager-override power to close a shift a
      // cashier walked away from.
      "cash.audit",
      "messages.view", "messages.send",
      // Online orders placed via the public storefront need to be
      // fulfillable by staff on the ground — a branch manager, like an
      // admin, can see and progress/cancel them. Mirrors the same
      // judgment already applied to transfers.cancel/sales.cancel above:
      // Cashier/Warehouse do NOT get this (see their permission lists
      // below), only Administrator and Branch Manager.
      "orders.view", "orders.update",
    ],
  },
  {
    code: "cashier",
    name: "Vendedor / Cajero",
    description:
      "Realiza ventas mediante POS, consulta productos y genera tickets. No puede modificar configuraciones administrativas ni realizar ajustes de inventario sin autorización.",
    // cash.manage sits exactly alongside sales.create here: the roles that
    // may ring up a POS sale are precisely the roles that need a drawer to
    // open and blind-close, so it mirrors sales.create's role set
    // (Administrator + Vendedor/Cajero) one for one.
    permissions: ["products.view", "inventory.view", "sales.view", "sales.create", "cash.manage", "discounts.apply", "messages.view", "messages.send"],
  },
  {
    code: "warehouse",
    name: "Almacenista",
    description:
      "Gestiona entradas, salidas, inventarios físicos, movimientos de mercancía y transferencias autorizadas.",
    // Almacenista already holds inventory.receive ("Recibir
    // transferencias/compras") and transfers.view/create/receive — receiving
    // supplier deliveries is literally this role's job, so it gets the
    // matching purchases.view/create/receive. It does NOT get
    // purchases.cancel, mirroring exactly how it does not get
    // transfers.cancel.
    permissions: ["products.view", "inventory.view", "inventory.adjust", "inventory.count", "inventory.transfer", "inventory.receive", "transfers.view", "transfers.create", "transfers.receive", "purchases.view", "purchases.create", "purchases.receive", "messages.view", "messages.send"],
  },
  {
    code: "purchasing",
    name: "Compras",
    description: "Gestiona proveedores, órdenes/compras y recepción de mercancía.",
    // Owns the supplier master data (suppliers.manage) since suppliers are a
    // purchasing concern, not a branch-owned one. Still no purchases.cancel:
    // same conservative line drawn for Almacenista above — the role that
    // raises a purchase order is not the role that may unwind it.
    permissions: ["products.view", "purchases.view", "purchases.create", "purchases.receive", "suppliers.manage", "inventory.view", "messages.view", "messages.send"],
  },
  {
    code: "online_store_admin",
    name: "Administrador de tienda online",
    description: "Gestiona catálogo online, productos publicados, pedidos y operaciones relacionadas con ecommerce.",
    permissions: ["products.view", "ecommerce.manage", "orders.view", "orders.update", "inventory.view", "messages.view", "messages.send"],
  },
  {
    code: "viewer",
    name: "Consulta / Reportes",
    description: "Puede consultar información y reportes autorizados sin modificar operaciones críticas.",
    // purchases.view added for the same reason this role already has
    // sales.view and transfers.view: purchases are read-only operational
    // data of exactly that class. Still no create/receive/cancel/authorize.
    permissions: ["products.view", "inventory.view", "sales.view", "transfers.view", "purchases.view", "reports.view", "branches.view", "messages.view"],
  },
];

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description, isSystem: true },
      create: { code: r.code, name: r.name, description: r.description, isSystem: true },
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

  await prisma.branch.upsert({
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

  const maquillaje = await prisma.category.upsert({
    where: { id: "10000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "10000000-0000-0000-0000-000000000001", name: "Maquillaje" },
  });
  const cuidadoPiel = await prisma.category.upsert({
    where: { id: "10000000-0000-0000-0000-000000000002" },
    update: {},
    create: { id: "10000000-0000-0000-0000-000000000002", name: "Cuidado de la piel" },
  });

  const bellaBrand = await prisma.brand.upsert({
    where: { id: "20000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "20000000-0000-0000-0000-000000000001", name: "Bella Makeup" },
  });

  const labial = await prisma.product.upsert({
    where: { sku: "LAB-MATTE-001" },
    update: {},
    create: {
      sku: "LAB-MATTE-001", name: "Labial Matte", categoryId: maquillaje.id, brandId: bellaBrand.id,
      cost: 80, price: 129, minStock: 5, maxStock: 100,
    },
  });
  const labialNude = await prisma.productVariant.upsert({
    where: { sku: "LAB-MATTE-001-NUDE" },
    update: {},
    create: { productId: labial.id, name: "Nude", sku: "LAB-MATTE-001-NUDE", minStock: 3, maxStock: 40 },
  });
  const labialRojo = await prisma.productVariant.upsert({
    where: { sku: "LAB-MATTE-001-ROJO" },
    update: {},
    create: { productId: labial.id, name: "Rojo", sku: "LAB-MATTE-001-ROJO", minStock: 3, maxStock: 40 },
  });

  const base = await prisma.product.upsert({
    where: { sku: "BASE-LIQ-001" },
    update: {},
    create: {
      sku: "BASE-LIQ-001", name: "Base Líquida", categoryId: maquillaje.id, brandId: bellaBrand.id,
      cost: 150, price: 280, minStock: 5, maxStock: 60,
    },
  });

  const crema = await prisma.product.upsert({
    where: { sku: "CREMA-HID-001" },
    update: {},
    create: {
      sku: "CREMA-HID-001", name: "Crema Hidratante", categoryId: cuidadoPiel.id, brandId: bellaBrand.id,
      cost: 90, price: 199, minStock: 4, maxStock: 50,
    },
  });

  const branchesForStock = await prisma.branch.findMany();
  const stockSeeds: Array<{ productId: string; variantId?: string; stock: number }> = [
    { productId: labial.id, variantId: labialNude.id, stock: 20 },
    { productId: labial.id, variantId: labialRojo.id, stock: 15 },
    { productId: base.id, stock: 12 },
    { productId: crema.id, stock: 8 },
  ];
  for (const branch of branchesForStock) {
    for (const s of stockSeeds) {
      if (s.variantId) {
        await prisma.inventory.upsert({
          where: { productId_variantId_branchId: { productId: s.productId, variantId: s.variantId, branchId: branch.id } },
          update: {},
          create: { productId: s.productId, variantId: s.variantId, branchId: branch.id, stock: s.stock },
        });
      } else {
        // Prisma's compound-unique input type for `productId_variantId_branchId` requires
        // `variantId: string` even though the column is nullable, so upsert can't target
        // rows where variantId is null. Fall back to findFirst + create for those rows.
        const existing = await prisma.inventory.findFirst({
          where: { productId: s.productId, variantId: null, branchId: branch.id },
        });
        if (!existing) {
          await prisma.inventory.create({
            data: { productId: s.productId, branchId: branch.id, stock: s.stock },
          });
        }
      }
    }
  }

  console.log("Seed complete. Demo login: admin / BellaAdmin#2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
