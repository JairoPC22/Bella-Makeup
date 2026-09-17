import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../config/env";

const ACCESS_SECRET = env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = env.JWT_REFRESH_SECRET;

export interface AccessTokenPayload {
  sub: string;
  roleId: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  // HS256 signing is deterministic and `iat`/`exp` are second-granularity, so
  // two tokens signed for the same subject within the same second would
  // otherwise be byte-identical. A random `jti` guarantees every issued
  // refresh token is unique, which rotation depends on.
  return jwt.sign({ ...payload, jti: randomUUID() }, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
}
