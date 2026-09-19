import { z } from "zod";

// Zod's built-in `.uuid()` only accepts RFC 4122 version 1-8 / variant 8-b
// UUIDs. The seeded demo users (prisma/seed.ts) use deterministic ids like
// "00000000-0000-0000-0000-000000000001", which are valid UUID-shaped
// strings but fail that stricter check (version/variant nibbles are "0").
// Same fix already applied in user.validators.ts's `uuidShape` — validate
// UUID *shape* only here too, since participantIds routes straight to
// those same seeded user ids. Prisma still rejects ids that don't
// correspond to a real row.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

// `participantIds` is every OTHER person the caller wants in the
// conversation — the caller themselves is implicitly included server-side,
// never listed here. min(1) means "at least a 1:1"; 2+ entries makes it a
// group (see messageService.startConversation).
export const startConversationSchema = z.object({
  participantIds: z.array(uuidShape).min(1, "Selecciona al menos otro participante"),
  name: z.string().trim().max(120).optional().nullable(),
});

// body is optional here — a message is valid with attachments alone, so the
// "must have body or files" rule is enforced in messageService, not zod.
export const sendMessageSchema = z.object({
  body: z.string().optional(),
});
