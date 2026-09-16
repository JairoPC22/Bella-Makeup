import { Request, Response, NextFunction } from "express";
import * as roleService from "../services/roleService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await roleService.listRoles());
  } catch (err) {
    next(err);
  }
}
