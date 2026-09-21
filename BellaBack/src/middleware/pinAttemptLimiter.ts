import rateLimit from "express-rate-limit";
import { PIN_GENERIC_ERROR } from "../services/pinAuthService";

// Why this exists (flagged in the task report as a deliberate addition
// beyond the brief's literal wording):
//
// POST /api/auth/verify-pin is rate limited to 5 FAILED attempts per 15
// minutes per acting user, because a 4-digit PIN has only 10,000
// combinations and an unthrottled endpoint is trivially brute-forced.
// POST /api/returns and POST /api/mermas also take a raw `pinCode` and also
// call verifySupervisorPin — so without an equivalent limit they would be an
// unthrottled side door around the throttled front door, and the control on
// /verify-pin would be worth nothing. Any endpoint that accepts a PIN must
// carry the same ceiling.
//
// Keyed on the ACTING user's id, not the IP, for the reason documented on
// auth.routes.ts's verifyPinLimiter: every terminal in a store shares one
// public IP, so an IP key would let one cashier's fat fingers lock out the
// whole branch.
//
// `requestWasSuccessful` is narrowed to "anything that is not a 401". With
// skipSuccessfulRequests, that means ONLY a failed PIN authorization
// consumes the budget: a 400 (malformed body, over-return, insufficient
// stock), a 403 (missing permission or branch scope) and a 404 (unknown
// ticket) are ordinary operational errors, not authorization attempts, and
// must not push an honest cashier toward a lockout. It also keeps the
// limiter from becoming a side channel — the attempt counter moves for
// exactly one observable reason.
export function createPinAttemptLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode !== 401,
    keyGenerator: (req) => req.user?.id ?? "anonymous",
    // Deliberately the SAME generic message as every other PIN failure, in
    // errorHandler's { message } envelope (not verify-pin's { ok, error }
    // one, which is that endpoint's own contract). A distinct "you are
    // throttled" body would itself confirm that previous attempts reached
    // the comparison stage.
    handler: (_req, res) => res.status(429).json({ message: PIN_GENERIC_ERROR }),
  });
}
