import { Request, Response, NextFunction } from "express";
import { listAudit } from "../services/auditService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { module, userId, branchId, from, to, page, pageSize } = req.query;
    const result = await listAudit({
      module: module as string | undefined,
      userId: userId as string | undefined,
      branchId: branchId as string | undefined,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    res.json({ items: result.items, total: result.total, page: Number(page ?? 1), pageSize: Number(pageSize ?? 25) });
  } catch (err) { next(err); }
}
