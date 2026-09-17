import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: required("DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};

// Dev machines juggle several local Vite servers, so the port BellaFront
// actually binds to drifts (5173, 5174, 5175, ...). Accept any localhost
// port in dev instead of hardcoding one, to avoid CORS breaking every time
// a new dev server picks a different free port.
export function isAllowedCorsOrigin(origin: string): boolean {
  const configured = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  if (configured.includes(origin)) return true;
  if (env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) {
    return true;
  }
  return false;
}
