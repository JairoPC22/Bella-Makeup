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
