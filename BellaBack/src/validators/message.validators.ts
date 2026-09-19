import { z } from "zod";

// Zod's built-in `.uuid()` only accepts RFC 4122 version 1-8 / variant 8-b
// UUIDs. The seeded demo branches (prisma/seed.ts) use deterministic ids
// like "00000000-0000-0000-0000-000000000001", which are valid UUID-shaped
// strings but fail that stricter check (version/variant nibbles are "0").
// Same fix already applied in user.validators.ts's `uuidShape` — validate
// UUID *shape* only here too, since fromBranchId/toBranchId route straight
// to those same seeded branch ids. Prisma still rejects ids that don't
// correspond to a real row.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

export const startConversationSchema = z.object({
  fromBranchId: uuidShape,
  toBranchId: uuidShape,
});

// body is optional here — a message is valid with attachments alone, so the
// "must have body or files" rule is enforced in messageService, not zod.
export const sendMessageSchema = z.object({
  fromBranchId: uuidShape,
  body: z.string().optional(),
});
