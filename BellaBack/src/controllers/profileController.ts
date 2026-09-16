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
