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

  console.log("Seed complete. Demo login: admin / BellaAdmin#2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
