// PM2 — M6-01. Producción en Hostinger.
//
// Este archivo NO contiene secretos. Las variables se leen de
// /opt/totem-bot/shared/.env (0600, propiedad de totembot) con `node --env-file`,
// de modo que nada sensible entra en el repositorio ni en `pm2 describe`.
//
// Desplegar es OWNER_REQUIRED (ver OPERATIONS.md § Acciones OWNER_REQUIRED).

const ENV_FILE = process.env.TOTEM_ENV_FILE ?? "/opt/totem-bot/shared/.env";
const LOG_DIR = process.env.TOTEM_LOG_DIR ?? "/var/log/totem-bot";
const CWD = process.env.TOTEM_APP_DIR ?? "/opt/totem-bot/current";

/** Ajustes comunes a los dos procesos. */
const common = {
  cwd: CWD,
  // Un solo proceso por app: nunca `cluster` para el worker (ver DEPLOYMENT.md § 6).
  instances: 1,
  exec_mode: "fork",
  node_args: [`--env-file=${ENV_FILE}`],
  // TZ=UTC en el sistema; la zona de negocio es APP_TIME_ZONE, no la del proceso.
  env_production: { NODE_ENV: "production", TZ: "UTC" },
  autorestart: true,
  restart_delay: 5000,
  exp_backoff_restart_delay: 1000,
  // El worker atiende SIGTERM y termina el tick en vuelo antes de salir.
  kill_timeout: 20000,
  time: true,
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "totem-server",
      script: "dist/server.js",
      max_memory_restart: "300M",
      out_file: `${LOG_DIR}/server.out.log`,
      error_file: `${LOG_DIR}/server.err.log`,
    },
    {
      ...common,
      name: "totem-worker",
      script: "dist/worker.js",
      max_memory_restart: "400M",
      out_file: `${LOG_DIR}/worker.out.log`,
      error_file: `${LOG_DIR}/worker.err.log`,
    },
  ],
};
