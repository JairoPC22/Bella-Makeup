import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission, requireAnyPermission } from "../middleware/permissions";
import * as cashSessionController from "../controllers/cashSessionController";

const router = Router();

// Broad listing is manager oversight over OTHER people's drawers, so it is
// cash.audit-only — a cashier has no business enumerating shifts.
router.get("/", requireAuth, requirePermission("cash.audit"), cashSessionController.list);

// "Do I already have a shift open here?" — the POS frontend's own boot-time
// question about its own user, so plain cash.manage. Registered BEFORE
// "/:id" so Express does not match "current" as an id.
router.get("/current", requireAuth, requirePermission("cash.manage"), cashSessionController.current);

// Either population may reach this route; whether the caller may see THIS
// particular session (own cut vs. someone else's) is re-checked in the
// service against ownership + cash.audit.
router.get("/:id", requireAuth, requireAnyPermission("cash.manage", "cash.audit"), cashSessionController.getById);

router.post("/", requireAuth, requirePermission("cash.manage"), cashSessionController.open);

// Same two populations as GET /:id: the owning cashier self-closing
// (cash.manage) and the documented manager override closing a forgotten
// shift (cash.audit). The service decides which one the caller actually is.
router.post("/:id/close", requireAuth, requireAnyPermission("cash.manage", "cash.audit"), cashSessionController.close);

export default router;
