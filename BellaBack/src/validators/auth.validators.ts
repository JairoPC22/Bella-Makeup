import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Usuario o correo requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});
