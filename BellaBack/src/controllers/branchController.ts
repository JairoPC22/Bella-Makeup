import { Request, Response, NextFunction } from "express";
import { createBranchSchema, updateBranchSchema, updateBranchStatusSchema } from "../validators/branch.validators";
import * as branchService from "../services/branchService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await branchService.listBranches());
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBranchSchema.parse(req.body);
    const branch = await branchService.createBranch(data, req.user!.id);
    res.status(201).json(branch);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateBranchSchema.parse(req.body);
    res.json(await branchService.updateBranch(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateBranchStatusSchema.parse(req.body);
    res.json(await branchService.updateBranchStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}
