import { findUserByUsernameOrEmail, findUserById, touchLastLogin } from "../repositories/userRepository";
import { storeRefreshToken, isRefreshTokenValid, revokeRefreshToken } from "../repositories/refreshTokenRepository";
import { comparePassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";
import { mapRole } from "../utils/roleMapper";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// The single chokepoint through which every user object leaves this API
// (/api/auth/me, /api/users, /api/profile all route through here), so it is
// also the single place credential hashes get stripped. `pinHash` is
// destructured out alongside `passwordHash` for exactly that reason: it is a
// bcrypt hash of a 4-6 digit secret, which is brute-forceable offline in
// seconds if it ever leaked, and the whole point of the supervisor-PIN
// primitive is that nobody — not even an admin reading GET /api/users — can
// learn who holds which PIN. Adding the field to the schema without adding
// it here would have silently published it on three existing endpoints.
export function toPublicUser(user: any) {
  const { passwordHash, pinHash, role, userBranches, ...rest } = user;
  return {
    ...rest,
    // Booleans, not the hash: the frontend legitimately needs to know
    // whether the current user has a PIN configured (to show "set" vs
    // "change" in the profile UI) without ever receiving the hash itself.
    hasPin: Boolean(pinHash),
    role: mapRole(role),
    branches: userBranches?.map((ub: any) => ub.branch) ?? [],
  };
}

export async function login(username: string, password: string) {
  const user = await findUserByUsernameOrEmail(username);
  if (!user || user.status !== "ACTIVE" || !(await comparePassword(password, user.passwordHash))) {
    throw new AppError(401, "Usuario o contraseña incorrectos");
  }

  const accessToken = signAccessToken({ sub: user.id, roleId: user.roleId });
  const refreshToken = signRefreshToken({ sub: user.id });
  await storeRefreshToken(user.id, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  await touchLastLogin(user.id);
  await logAudit({ userId: user.id, action: "auth.login", module: "auth" });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "Sesión inválida");
  }
  const valid = await isRefreshTokenValid(payload.sub, refreshToken);
  if (!valid) throw new AppError(401, "Sesión inválida");

  const user = await findUserById(payload.sub);
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "Sesión inválida");

  // Rotate: revoke the presented refresh token and issue+store a new one so a
  // captured refresh token cannot be replayed indefinitely.
  await revokeRefreshToken(user.id, refreshToken);
  const newRefreshToken = signRefreshToken({ sub: user.id });
  await storeRefreshToken(user.id, newRefreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));

  const accessToken = signAccessToken({ sub: user.id, roleId: user.roleId });
  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user) };
}

export async function logout(userId: string, refreshToken: string) {
  await revokeRefreshToken(userId, refreshToken);
  await logAudit({ userId, action: "auth.logout", module: "auth" });
}
