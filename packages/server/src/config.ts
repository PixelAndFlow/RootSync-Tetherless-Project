import { fileURLToPath } from "node:url";
import { DEFAULT_THRESHOLDS, DEFAULT_ACTIVE_TIME_OPTIONS, type Thresholds, type ActiveTimeOptions } from "../../analytics/src/index.ts";

export interface Config {
  port: number;
  databaseUrl: string | null;
  contentDir: string;
  /** Origins allowed to call the API from a browser (the PWA's permanent address). */
  corsOrigins: string[];
  trainerSessionHours: number;
  thresholds: Thresholds;
  activeTime: ActiveTimeOptions;
  /** Requests per minute per client address for enrollment and trainer login. */
  authRateLimitPerMinute: number;
  /** Set when running behind a reverse proxy that sets X-Forwarded-For. */
  trustProxy: boolean;
}

const num = (v: string | undefined, fallback: number) => (v === undefined || v === "" ? fallback : Number(v));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config: Config = {
    port: num(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL || null,
    contentDir: env.CONTENT_DIR || fileURLToPath(new URL("../../../content/modules", import.meta.url)),
    corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    trainerSessionHours: num(env.TRAINER_SESSION_HOURS, 12),
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      pass_pct: num(env.PASS_PCT, DEFAULT_THRESHOLDS.pass_pct),
      struggling_pct: num(env.STRUGGLING_PCT, DEFAULT_THRESHOLDS.struggling_pct),
      weak_topic_pct: num(env.WEAK_TOPIC_PCT, DEFAULT_THRESHOLDS.weak_topic_pct),
    },
    activeTime: {
      ...DEFAULT_ACTIVE_TIME_OPTIONS,
      idleLimitMs: num(env.IDLE_LIMIT_MINUTES, DEFAULT_ACTIVE_TIME_OPTIONS.idleLimitMs / 60000) * 60000,
    },
    authRateLimitPerMinute: num(env.AUTH_RATE_LIMIT_PER_MINUTE, 10),
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
  };
  for (const [k, v] of Object.entries({ port: config.port, pass: config.thresholds.pass_pct, struggling: config.thresholds.struggling_pct, idle: config.activeTime.idleLimitMs })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid configuration value for ${k}`);
  }
  return config;
}
