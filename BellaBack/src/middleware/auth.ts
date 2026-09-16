import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roleId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ message: "No autenticado" });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, roleId: payload.roleId };
    next();
  } catch {
    return res.status(401).json({ message: "Sesión expirada" });
  }
}
