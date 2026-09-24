import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission, requireAnyPermission } from "../middleware/permissions";
import * as cashSessionController from "../controllers/cashSessionController";

const router = Router();

// Listado general es supervisión gerencial; solo cash.audit, un cajero no debe verlo.
router.get("/", requireAuth, requirePermission("cash.audit"), cashSessionController.list);

// Pregunta propia del POS al iniciar; se registra antes de "/:id" para que Express no lo confunda con un id.
router.get("/current", requireAuth, requirePermission("cash.manage"), cashSessionController.current);

// El acceso a esta sesión en particular (propia u ajena) se revalida en el servicio.
router.get("/:id", requireAuth, requireAnyPermission("cash.manage", "cash.audit"), cashSessionController.getById);

router.post("/", requireAuth, requirePermission("cash.manage"), cashSessionController.open);

// Mismos dos casos que GET /:id: cierre propio o cierre gerencial de un turno olvidado.
router.post("/:id/close", requireAuth, requireAnyPermission("cash.manage", "cash.audit"), cashSessionController.close);

export default router;
