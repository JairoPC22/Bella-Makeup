import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "../utils/AppError";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const UPLOADS_PRODUCTS_DIR = path.resolve(process.cwd(), "uploads/products");

export const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_PRODUCTS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError(400, "Formato de imagen no permitido (solo JPG, PNG o WEBP)"));
    }
    cb(null, true);
  },
});

const ALLOWED_MESSAGE_ATTACHMENT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const UPLOADS_MESSAGES_DIR = path.resolve(process.cwd(), "uploads/messages");

export const messageAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_MESSAGES_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MESSAGE_ATTACHMENT_MIME.has(file.mimetype)) {
      return cb(new AppError(400, "Formato de archivo no permitido (solo JPG, PNG, WEBP o PDF)"));
    }
    cb(null, true);
  },
});
