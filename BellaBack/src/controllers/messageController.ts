import { Request, Response, NextFunction } from "express";
import { startConversationSchema, sendMessageSchema } from "../validators/message.validators";
import * as messageService from "../services/messageService";

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await messageService.listMyConversations(req.user!.id));
  } catch (err) { next(err); }
}

export async function startConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const { fromBranchId, toBranchId } = startConversationSchema.parse(req.body);
    const conversation = await messageService.startConversation(req.user!.id, fromBranchId, toBranchId);
    res.status(201).json(conversation);
  } catch (err) { next(err); }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await messageService.listMessages(req.user!.id, req.params.id));
  } catch (err) { next(err); }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { fromBranchId, body } = sendMessageSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const message = await messageService.sendMessage(req.user!.id, req.params.id, { fromBranchId, body, files });
    res.status(201).json(message);
  } catch (err) { next(err); }
}

export async function listBranches(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await messageService.listMessagingBranches());
  } catch (err) { next(err); }
}
