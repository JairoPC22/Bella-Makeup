const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

export function buildAvatarUrl(style: string, seed: string): string {
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
