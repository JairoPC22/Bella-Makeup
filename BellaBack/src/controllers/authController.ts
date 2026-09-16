import { Request, Response, NextFunction } from "express";
import { loginSchema } from "../validators/auth.validators";
import * as authService from "../services/authService";
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
    const { accessToken, user } = await authService.refresh(token);
    res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
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
