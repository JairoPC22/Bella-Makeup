import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listAudit } from "../services/auditService";

const auditQuerySchema = z.object({
  module: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { module, userId, branchId, from, to, page, pageSize } = auditQuerySchema.parse(req.query);
    const result = await listAudit({ module, userId, branchId, from, to, page, pageSize });
    res.json({ items: result.items, total: result.total, page: page ?? 1, pageSize: pageSize ?? 25 });
  } catch (err) { next(err); }
}
