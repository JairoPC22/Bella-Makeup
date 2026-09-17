import { buildAvatarUrl } from "../../services/avatarUrl";

interface AvatarProps {
  avatarStyle: string;
  avatarSeed: string;
  displayName: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX: Record<NonNullable<AvatarProps["size"]>, number> = { sm: 28, md: 40, lg: 96 };

export function Avatar({ avatarStyle, avatarSeed, displayName, size = "md" }: AvatarProps) {
  const px = SIZE_PX[size];
  return (
    <img
      src={buildAvatarUrl(avatarStyle, avatarSeed)}
      alt={`Avatar de ${displayName}`}
      width={px}
      height={px}
      style={{ borderRadius: "50%", border: "1px solid var(--color-border)", background: "var(--color-white)" }}
    />
  );
}
