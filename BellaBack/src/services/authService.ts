import { findUserByUsernameOrEmail, findUserById, touchLastLogin } from "../repositories/userRepository";
import { storeRefreshToken, isRefreshTokenValid, revokeRefreshToken } from "../repositories/refreshTokenRepository";
import { comparePassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";
import { mapRole } from "../utils/roleMapper";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Único punto por el que sale cualquier objeto de usuario de esta API
// (/api/auth/me, /api/users, /api/profile pasan todos por aquí), así que
// es también el único lugar donde se quitan los hashes de credenciales.
// `pinHash` se extrae junto con `passwordHash` porque es un hash de un
// secreto de 4-6 dígitos, atacable por fuerza bruta offline en segundos si
// se filtrara; nadie, ni siquiera un admin, debe poder saber qué PIN tiene
// cada usuario.
export function toPublicUser(user: any) {
  const { passwordHash, pinHash, role, userBranches, ...rest } = user;
  return {
    ...rest,
    // Un booleano, no el hash: el frontend necesita saber si el usuario ya
    // tiene un PIN configurado (para mostrar "definir" o "cambiar" en el
    // perfil) sin recibir jamás el hash en sí.
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

  // Rotación: se revoca el refresh token presentado y se emite/guarda uno
  // nuevo, para que un token capturado no pueda reutilizarse indefinidamente.
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
