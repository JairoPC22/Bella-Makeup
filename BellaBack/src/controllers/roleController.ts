import { Request, Response, NextFunction } from "express";
import * as roleService from "../services/roleService";
import { createRoleSchema, updateRolePermissionsSchema } from "../validators/role.validators";

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

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRoleSchema.parse(req.body);
    const role = await roleService.createRole(data, req.user!.id);
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await roleService.deleteRole(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
