import { Request, Response, NextFunction } from "express";
import { loginSchema } from "../validators/auth.validators";
import { verifyPinSchema } from "../validators/pin.validators";
import * as authService from "../services/authService";
import * as pinAuthService from "../services/pinAuthService";
import { PIN_GENERIC_ERROR } from "../services/pinAuthService";
import { findUserById } from "../repositories/userRepository";
import { toPublicUser } from "../services/authService";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(username, password);
    res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ message: "No hay sesión" });
    const { accessToken, refreshToken, user } = await authService.refresh(token);
    res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refresh_token;
    if (req.user && token) await authService.logout(req.user.id, token);
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await findUserById(req.user!.id);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-pin — runs on the CASHIER's session (requireAuth),
// because the supervisor is physically present at the cashier's terminal
// rather than logging in themselves. Responds with the literal
// { ok, ... } / { ok: false, error } envelope the calling module expects,
// which is why the failure path returns a value instead of throwing into
// errorHandler's generic { message } shape.
export async function verifyPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin, requiredPermission } = verifyPinSchema.parse(req.body);
    const result = await pinAuthService.verifySupervisorPin(req.user!.id, pin, requiredPermission);
    if (!result.ok) return res.status(401).json({ ok: false, error: PIN_GENERIC_ERROR });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
