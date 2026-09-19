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
    const { otherUserId } = startConversationSchema.parse(req.body);
    const conversation = await messageService.startConversation(req.user!.id, otherUserId);
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
    const { body } = sendMessageSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const message = await messageService.sendMessage(req.user!.id, req.params.id, { body, files });
    res.status(201).json(message);
  } catch (err) { next(err); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await messageService.listMessagingUsers(req.user!.id));
  } catch (err) { next(err); }
}
