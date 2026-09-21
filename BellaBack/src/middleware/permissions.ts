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

// "Holds at least ONE of these codes." Needed by the caja module, where a
// single route legitimately serves two different populations: a cashier
// closing their OWN drawer (cash.manage) and a manager closing a shift the
// cashier walked away from (cash.audit). Those two codes are deliberately
// held by disjoint seeded roles — Vendedor/Cajero has cash.manage but not
// cash.audit, Gerente de sucursal has cash.audit but not cash.manage — so
// a single requirePermission() gate would lock out one of them. The route
// gate only establishes "you may reach this endpoint at all"; which of the
// two populations you actually belong to (and therefore whether you may
// touch THIS session) is re-checked in the service against ownership, the
// same way branch scope always is.
export function requireAnyPermission(...codes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    const count = await prisma.rolePermission.count({
      where: { roleId: req.user.roleId, permission: { code: { in: codes } } },
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
