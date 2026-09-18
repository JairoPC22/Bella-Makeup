import { Request, Response, NextFunction } from "express";
import * as roleService from "../services/roleService";
import { updateRolePermissionsSchema } from "../validators/role.validators";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await roleService.listRoles());
  } catch (err) {
    next(err);
  }
}

export async function updatePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const { permissions } = updateRolePermissionsSchema.parse(req.body);
    const role = await roleService.updateRolePermissions(req.params.id, permissions, req.user!.id);
    res.json(role);
  } catch (err) {
    next(err);
  }
}
