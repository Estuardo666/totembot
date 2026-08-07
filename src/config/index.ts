import { parseEnv, type AppConfig } from "./env.js";

export type { AppConfig };
export { EnvValidationError } from "./env.js";

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  cached ??= parseEnv(process.env);
  return cached;
}
