import { z } from "zod";
import { uuidShape } from "./common.validators";

// `participantIds` son los OTROS participantes; el llamador se incluye del lado
// del servidor. min(1) es 1:1, 2+ es grupo (ver messageService.startConversation).
export const startConversationSchema = z.object({
  participantIds: z.array(uuidShape).min(1, "Selecciona al menos otro participante"),
  name: z.string().trim().max(120).optional().nullable(),
});

// body es opcional aquí; la regla de "body o adjuntos" se valida en messageService.
export const sendMessageSchema = z.object({
  body: z.string().optional(),
});
