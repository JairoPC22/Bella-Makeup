import { findUserById, updateUser } from "../repositories/userRepository";
import { revokeAllUserRefreshTokens } from "../repositories/refreshTokenRepository";
import { comparePassword, hashPassword } from "../utils/password";
import { generateAvatarOptions } from "../utils/avatar";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";
import { toPublicUser } from "./authService";

export async function getProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, "Usuario no encontrado");
  return toPublicUser(user);
}

export async function updateProfile(userId: string, input: any) {
  await updateUser(userId, input);
  const user = await findUserById(userId);
  await logAudit({ userId, action: "profile.update", module: "profile", entityType: "user", entityId: userId, details: { changes: input } });
  return toPublicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  await updateUser(userId, { passwordHash: await hashPassword(newPassword) });
  // Un cambio de contraseña debe cortar cualquier sesión robada: se revocan
  // todos los refresh tokens del usuario para que las cookies viejas dejen
  // de funcionar.
  await revokeAllUserRefreshTokens(userId);
  await logAudit({ userId, action: "profile.change_password", module: "profile", entityType: "user", entityId: userId });
}

export function getAvatarOptions(style: string, count: number) {
  return generateAvatarOptions(style, count);
}

export async function changeAvatar(userId: string, style: string, seed: string) {
  await updateUser(userId, { avatarStyle: style, avatarSeed: seed });
  const user = await findUserById(userId);
  await logAudit({ userId, action: "profile.change_avatar", module: "profile", entityType: "user", entityId: userId, details: { style, seed } });
  return toPublicUser(user);
}
