import { randomUUID } from "crypto";

const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

export function generateRandomSeed(): string {
  return randomUUID();
}

export function buildAvatarUrl(style: string, seed: string): string {
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export function generateAvatarOptions(style: string, count: number): Array<{ seed: string; url: string }> {
  return Array.from({ length: count }, () => {
    const seed = generateRandomSeed();
    return { seed, url: buildAvatarUrl(style, seed) };
  });
}
