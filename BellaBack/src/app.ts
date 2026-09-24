import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env, isAllowedCorsOrigin } from "./config/env";
import authRoutes from "./routes/auth.routes";
import roleRoutes from "./routes/role.routes";
import branchRoutes from "./routes/branch.routes";
import categoryRoutes from "./routes/category.routes";
import brandRoutes from "./routes/brand.routes";
import productRoutes from "./routes/product.routes";
import productImageRoutes from "./routes/productImage.routes";
import userRoutes from "./routes/user.routes";
import profileRoutes from "./routes/profile.routes";
import companySettingsRoutes from "./routes/companySettings.routes";
import auditRoutes from "./routes/audit.routes";
import inventoryRoutes from "./routes/inventory.routes";
import inventoryCountRoutes from "./routes/inventoryCount.routes";
import messageRoutes from "./routes/message.routes";
import customerRoutes from "./routes/customer.routes";
import saleRoutes from "./routes/sale.routes";
import transferRoutes from "./routes/transfer.routes";
import purchaseRoutes from "./routes/purchase.routes";
import cashSessionRoutes from "./routes/cashSession.routes";
import returnRoutes from "./routes/return.routes";
import mermaRoutes from "./routes/merma.routes";
import supplierRoutes from "./routes/supplier.routes";
import publicRoutes from "./routes/public.routes";
import orderRoutes from "./routes/order.routes";
import ratingRoutes from "./routes/rating.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedCorsOrigin(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
// El Cross-Origin-Resource-Policy por defecto de helmet() ("same-origin")
// bloquea en silencio que el frontend cargue imágenes/adjuntos desde
// /uploads (la petición responde 200 pero el navegador se niega a
// renderizarla) — se relaja a "cross-origin" solo en esta ruta estática.
// Lo mismo pasa con el CSP por defecto ("frame-ancestors 'self'"), que
// impide incrustar un PDF de /uploads en un <iframe> desde el frontend (otro
// origen); se desactiva esa directiva solo aquí, ya que todo lo que vive
// bajo /uploads es archivo estático plano (nunca HTML/JS), así que no hay
// superficie real de clickjacking que proteger. X-Frame-Options (el header
// legado equivalente) se remueve por la misma razón, ya que ningún
// middleware de helmet lo "desactiva" directamente.
app.use(
  "/uploads",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  helmet.contentSecurityPolicy({ useDefaults: true, directives: { frameAncestors: null } }),
  (_req, res, next) => {
    res.removeHeader("X-Frame-Options");
    next();
  },
  express.static(path.resolve(process.cwd(), "uploads"))
);
if (env.NODE_ENV !== "test") app.use(morgan("dev"));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", loginLimiter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/products", productRoutes);
app.use("/api/products", productImageRoutes); // routes internally define "/:productId/images..."
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/inventory-counts", inventoryCountRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/mermas", mermaRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/ratings", ratingRoutes);
// /api/public es la tienda pública, sin requireAuth (acceso anónimo por diseño).
app.use("/api/public", publicRoutes);
app.use("/api/orders", orderRoutes);
app.use(errorHandler);

export default app;
