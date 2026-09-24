import * as branchRepository from "../repositories/branchRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

export const listBranches = () => branchRepository.findAllBranches();

export async function createBranch(input: any, actorId: string) {
  const branch = await branchRepository.createBranch(input);
  await logAudit({ userId: actorId, action: "branches.create", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id, details: { name: branch.name } });
  return branch;
}

export async function updateBranch(id: string, input: any, actorId: string) {
  const existing = await branchRepository.findBranchById(id);
  if (!existing) throw new AppError(404, "Sucursal no encontrada");
  const branch = await branchRepository.updateBranch(id, input);
  await logAudit({ userId: actorId, action: "branches.update", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id, details: { changes: input } });
  return branch;
}

export async function updateBranchStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string) {
  const branch = await branchRepository.updateBranch(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "branches.activate" : "branches.deactivate", module: "branches", entityType: "branch", entityId: branch.id, branchId: branch.id });
  return branch;
}

export async function getRevenueReport(from?: Date, to?: Date) {
  const [branches, sums] = await Promise.all([
    branchRepository.findAllBranches(),
    branchRepository.sumRevenueByBranch(from, to),
  ]);
  const byBranch = new Map(sums.map((s) => [s.branchId, s]));
  const rows = branches.map((b) => {
    const s = byBranch.get(b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      revenue: Number(s?._sum.total ?? 0),
      saleCount: s?._count._all ?? 0,
    };
  });
  const grandTotal = rows.reduce((sum, r) => sum + r.revenue, 0);
  return { rows, grandTotal };
}
