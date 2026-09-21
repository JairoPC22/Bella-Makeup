import { Request, Response, NextFunction } from "express";
import { createUserSchema, updateUserSchema, updateUserStatusSchema, assignBranchesSchema } from "../validators/user.validators";
import { setPinSchema } from "../validators/pin.validators";
import * as userService from "../services/userService";
import * as pinAuthService from "../services/pinAuthService";

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

// PUT /api/users/me/pin — self-service only (requireAuth, no permission
// gate): the acting user's own id comes from the token, never from the URL,
// so there is no path by which one user sets another's PIN.
export async function setOwnPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin, currentPassword } = setPinSchema.parse(req.body);
    await pinAuthService.setOwnPin(req.user!.id, pin, currentPassword);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
