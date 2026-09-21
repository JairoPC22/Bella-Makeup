import { comparePassword, hashPassword } from "../utils/password";
import {
  findUserById,
  updateUser,
  findPinSupervisorCandidates,
  findUserBranchScope,
} from "../repositories/userRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

// ---------------------------------------------------------------------------
// Supervisor PIN authorization primitive.
//
// This is NOT the app's permission system (middleware/permissions.ts's
// requirePermission) and is not a replacement for it. The two answer
// different questions:
//
//   requirePermission(code)  -> "is the logged-in user allowed to do this?"
//   verifySupervisorPin(...) -> "is a SECOND person with authority physically
//                               here, right now, approving this?"
//
// The second is the manager's-key-turn of real retail: the cashier stays
// logged in, the supervisor walks over and types 4-6 digits on the cashier's
// screen, and the action proceeds attributed to both people. That's why
// verify-pin runs on the CASHIER's token — the supervisor never logs in.
//
// This module intentionally exposes only two functions and stores nothing
// itself. Other modules (returns, shrinkage write-offs — later tasks) call
// verifySupervisorPin, get back a supervisorId, and record that id in their
// OWN audit trail.
// ---------------------------------------------------------------------------

// 4-6 digits, nothing else. Shared with pin.validators.ts so the API-boundary
// check and the defensive service-level check can never drift apart.
export const PIN_REGEX = /^\d{4,6}$/;

// One message for every failure mode of verify-pin. Deliberately vague: it
// must not reveal whether the PIN was malformed, whether anyone with that
// permission exists at this branch, or whether the digits simply didn't
// match. Distinguishing those would let a cashier probe the org chart — "try
// any 4 digits; a different error means someone here can authorize returns" —
// and would confirm the existence of an authorizing supervisor to anyone who
// can reach a POS terminal. Still actionable for the honest case: it names
// both real causes (wrong PIN, or this person can't authorize THIS action) so
// the cashier knows to fetch a different supervisor.
export const PIN_GENERIC_ERROR = "PIN inválido o sin autorización para esta acción.";

export type VerifyPinResult =
  | { ok: true; supervisorId: string; supervisorName: string }
  | { ok: false };

// Self-service only, mirroring profileService.changePassword's shape exactly
// (verify the current password, hash the new secret with the same bcrypt
// utility, persist, audit).
//
// Re-entering the login password is required because this sets a SECOND
// credential: without it, anyone who walked up to an unlocked, already
// logged-in supervisor session could silently assign themselves a PIN they
// know and then self-authorize every future sensitive action.
//
// There is deliberately no admin-sets-someone-else's-PIN endpoint. A PIN that
// a third party can set is no longer evidence that a specific person was
// present — it becomes just another shared password. Keeping it strictly
// self-set is what makes "supervisorId" in a later module's audit trail
// actually mean "this individual approved it", the same reason a bank never
// lets a teller choose your debit card PIN.
//
// Note there is no role gate here: any authenticated user may set their own
// PIN. That's harmless by construction — a PIN only ever authorizes anything
// if its owner's role holds the permission being checked, so a cashier with a
// PIN set is simply never a candidate for a supervisor-grade action.
export async function setOwnPin(userId: string, pin: string, currentPassword: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  // Defensive: pin.validators.ts already enforces this at the API boundary,
  // but this function is exported and future callers may not go through it.
  if (!PIN_REGEX.test(pin)) {
    throw new AppError(400, "El PIN debe tener entre 4 y 6 dígitos numéricos.");
  }

  await updateUser(userId, { pinHash: await hashPassword(pin) });

  // Records THAT a PIN was set, never the PIN or its hash.
  await logAudit({
    userId,
    action: "users.set_pin",
    module: "users",
    entityType: "user",
    entityId: userId,
  });
}

// Returns a discriminated result rather than throwing on the failure path, so
// the controller can emit the exact { ok: false, error } body the spec
// requires instead of errorHandler's generic { message } shape.
export async function verifySupervisorPin(
  actorId: string,
  pin: string,
  requiredPermission: string
): Promise<VerifyPinResult> {
  const actor = await findUserBranchScope(actorId);
  if (!actor) throw new AppError(401, "Usuario no encontrado");

  // Every failure exits through here so that all four causes (malformed PIN,
  // no candidates at all, candidates but none matching, wrong digits) are
  // indistinguishable to the caller — same status, same body, and an audit
  // entry that records the attempt WITHOUT naming who was considered.
  const fail = async (): Promise<VerifyPinResult> => {
    await logAudit({
      userId: actorId,
      action: "auth.verify_pin_failed",
      module: "auth",
      details: { requiredPermission },
    });
    return { ok: false };
  };

  // Checked here rather than in the validator on purpose: rejecting a
  // malformed PIN with Zod's 400 "Datos inválidos" would leak that the PIN
  // never even reached the comparison stage, which is exactly the
  // distinction PIN_GENERIC_ERROR exists to hide.
  if (!PIN_REGEX.test(pin)) return fail();

  const branchIds = actor.allBranches ? undefined : actor.userBranches.map((ub) => ub.branchId);
  const candidates = await findPinSupervisorCandidates(requiredPermission, branchIds);

  for (const candidate of candidates) {
    // candidate.pinHash is non-null by the repository's `pinHash: { not: null }`
    // filter; the non-null assertion is only to satisfy the Prisma-generated
    // `string | null` type.
    if (await comparePassword(pin, candidate.pinHash!)) {
      // Success is attributed to BOTH parties: userId is the cashier whose
      // session performed the action, entityId/supervisorId is the person who
      // approved it. The calling module records the same supervisorId in its
      // own trail so the two can be reconciled.
      await logAudit({
        userId: actorId,
        action: "auth.verify_pin",
        module: "auth",
        entityType: "user",
        entityId: candidate.id,
        details: { requiredPermission, supervisorId: candidate.id },
      });
      return { ok: true, supervisorId: candidate.id, supervisorName: candidate.displayName };
    }
  }

  return fail();
}
