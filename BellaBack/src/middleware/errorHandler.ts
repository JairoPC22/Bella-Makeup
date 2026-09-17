import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { AppError } from "../utils/AppError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Datos inválidos", issues: err.issues });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Error al subir el archivo: ${err.message}` });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Ya existe un registro con esos datos." });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Registro no encontrado." });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ message: "Referencia inválida (el registro relacionado no existe)." });
    }
    // Fall through to the generic 500 for any other Prisma known-request error.
  }
  console.error(err);
  return res.status(500).json({ message: "Error interno del servidor" });
}
