import express from "express";
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
import userRoutes from "./routes/user.routes";
import profileRoutes from "./routes/profile.routes";
import companySettingsRoutes from "./routes/companySettings.routes";
import auditRoutes from "./routes/audit.routes";
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
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/audit", auditRoutes);
app.use(errorHandler);

export default app;
