import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as customerController from "../controllers/customerController";

const router = Router();

// sales.view (not a dedicated customers.view permission): searching for a
// customer is only ever done as a step within viewing/creating a sale, and
// there's no standalone "customer management" screen in this task's scope
// — anyone who can see sales can look up a customer to attach to one.
router.get("/", requireAuth, requirePermission("sales.view"), customerController.list);
router.post("/", requireAuth, requirePermission("sales.create"), customerController.create);

export default router;
