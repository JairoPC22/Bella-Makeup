import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import roleRoutes from "./routes/role.routes";
import branchRoutes from "./routes/branch.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/branches", branchRoutes);
app.use(errorHandler);

export default app;
