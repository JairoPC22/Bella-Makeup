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
