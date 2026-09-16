import { prisma } from "../config/prisma";
import crypto from "crypto";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function storeRefreshToken(userId: string, token: string, expiresAt: Date) {
  return prisma.refreshToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
}

export async function isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
  const record = await prisma.refreshToken.findFirst({
    where: { userId, tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
  });
  return !!record;
}

export function revokeRefreshToken(userId: string, token: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}
