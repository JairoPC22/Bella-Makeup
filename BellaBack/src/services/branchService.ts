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
