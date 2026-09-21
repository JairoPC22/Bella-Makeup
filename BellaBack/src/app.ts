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
// helmet()'s default Cross-Origin-Resource-Policy is "same-origin", which
// silently blocks <img>/attachment loads from the frontend's own origin
// (e.g. localhost:5174 fetching localhost:4000/uploads/...) even though the
// request itself succeeds with a 200 — the browser just refuses to render
// the response, and it's invisible to curl since CORP is only enforced by
// browsers. Scoped override to "cross-origin" for this static route only,
// so the rest of the API keeps helmet's stricter default.
//
// Same story for helmet()'s default Content-Security-Policy, which includes
// "frame-ancestors 'self'" — that blocks the frontend from embedding a
// /uploads file (e.g. a message attachment PDF) in an <iframe>, since the
// frontend runs on a different origin/port than this API. Real Chrome
// enforces this (confirmed via a real Chrome-channel Playwright run — the
// default Playwright/headless Chromium doesn't ship a PDF viewer at all, so
// it never surfaces this particular failure and silently no-ops instead).
// Disabling just the frame-ancestors directive for this static route (like
// the CORP override above) is enough: everything under /uploads is a plain
// static file (image/pdf/xlsx), never HTML/JS, so there's no clickjacking
// surface here for frame-ancestors to protect in the first place.
//
// helmet()'s frameguard middleware sets the legacy "X-Frame-Options:
// SAMEORIGIN" header too, which blocks cross-origin framing independently
// of (and in addition to) the CSP frame-ancestors directive above — modern
// browsers honor CSP frame-ancestors when present, but older ones fall back
// to X-Frame-Options, so both have to be cleared for the <iframe> PDF embed
// to render in every browser. There's no helmet sub-middleware that "unsets"
// X-Frame-Options (xFrameOptions() always sets a value), so it's removed
// directly once helmet has already set it.
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
app.use("/api/messages", messageRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/mermas", mermaRoutes);
app.use("/api/suppliers", supplierRoutes);
// /api/public — the anonymous storefront surface, a sibling root next to
// every authenticated /api/* router above, not nested under any of them.
// No requireAuth anywhere in public.routes.ts by design.
app.use("/api/public", publicRoutes);
app.use("/api/orders", orderRoutes);
app.use(errorHandler);

export default app;
