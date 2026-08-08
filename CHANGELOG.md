# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. El proyecto está en `0.x`: nada es estable todavía.

## [No publicado]

### Añadido — M1 (esqueleto técnico)

- pnpm 11.20.0 activado vía Corepack; Node.js actualizado a 24.19.0 LTS (M1-00).
- Proyecto TypeScript estricto: `package.json`, `tsconfig.json`, `tsconfig.build.json`,
  estructura de carpetas de `ARCHITECTURE.md` § 2 (M1-01).
- Configuración validada con Zod en `src/config/env.ts`: único punto de lectura de
  `process.env`, valores seguros por defecto (`WHATSAPP_ENABLED=false`,
  `WHATSAPP_DRY_RUN=true`), errores sin fuga de secretos (M1-02).
- Logging estructurado con Pino: redacción de campos sensibles, `correlationId` propagado
  con `AsyncLocalStorage` (M1-03).
- Servidor Fastify con `GET /health` y `GET /ready` (verifica configuración, base de datos,
  worker y WhatsApp), escuchando solo en `127.0.0.1` (M1-04).
- ESLint (flat config) + `typescript-eslint` con `no-restricted-imports` para impedir que
  `domain`/`application` importen infraestructura; Prettier (M1-05).
- Vitest con proyectos `unit` e `integration`; la suite de integración aborta si
  `DATABASE_URL` no termina en `_test`; cobertura con `@vitest/coverage-v8` (M1-06).
- `docker-compose.yml` con `postgres` (desarrollo) y `postgres-test` (pruebas), PostgreSQL
  17, healthcheck y volúmenes nombrados (M1-07).
- CI en GitHub Actions (`pnpm check`, `pnpm audit --audit-level=high`, matriz de zonas
  horarias, `WHATSAPP_ENABLED=false` forzado) (M1-08).
- `pnpm check` como comando único de verificación (M1-09).
- `prisma.config.ts` y cliente generado con el adaptador `@prisma/adapter-pg`.

### Añadido — M2–M5 (núcleo seguro del MVP)

- Entidades, transiciones de tareas, puertos, reloj inyectable, claves de idempotencia,
  ventanas horarias, elegibilidad y reintentos.
- Esquema Prisma completo, migración inicial con restricciones `CHECK`, unicidad de grupo
  primario, índice parcial del worker y claim atómico con `SKIP LOCKED`.
- Repositorios Prisma, casos de uso base para grabaciones, tareas e invoices, worker con
  parada limpia, endpoint `/status` y gateways fake/dry-run.
- Cinco plantillas v1 con Zod estricto, sanitización y `template:preview --sample`.
- Pruebas unitarias, integración HTTP y E2E segura; ningún mensaje real de WhatsApp fue
  enviado.
- Límites efectivos de recordatorios, ciclo de vida de grabaciones (`reschedule`/`cancel`/`TOO_LATE`),
  transición automática de facturas a `OVERDUE` y métricas persistidas en `/status`.
- E2E ampliado para grabación, revisión de tarea, factura vencida y dry-run, sin activar WhatsApp
  real.
- CLI administrativa de clientes y grupos (`client:create/list`, `group:add/authorize`) con
  validación Zod, autorización manual y auditoría.
- Operación CLI (`automation:pause/resume`, `reminder:show/resolve`) y seed idempotente de
  datos ficticios; la resolución de entrega incierta queda restringida a `NEEDS_REVIEW`.
- Pruebas unitarias de la CLI (`tests/unit/cli.test.ts`): parseo de banderas, validación
  Zod de estado, zona horaria IANA, JID de grupo, instante ISO-8601 con desfase, alcance
  único en `automation:pause/resume` y `template:preview` sin dependencias de base de datos.
- Prueba de integración CA-04 (`tests/integration/database/task-review.test.ts`): la salida
  de `CLIENT_REVIEW` cancela los recordatorios pendientes, respeta los ya enviados y una
  nueva ronda de revisión genera claves de idempotencia distintas.
- CLI M5-10 para grabaciones, tareas e invoices, con fechas, importes y estados validados
  por Zod, resolución de configuración por cliente y auditoría de operaciones.

### Añadido — M6 (operación)

- Purga de retención (M6-08, PRI-04): `RetentionPolicy` pura con corte estricto y recorte al
  último día del mes, caso de uso `PurgeExpiredRecords` que borra `MessageAttempt` y
  `AuditEvent` anteriores a la ventana, bucle propio en el worker separado del tick de envíos
  y comando `pnpm cli retention:purge`. Configurable con `RETENTION_MONTHS` (12) y
  `RETENTION_PURGE_INTERVAL_HOURS` (24).
- `ecosystem.config.cjs` para PM2 (M6-01): `totem-server` y `totem-worker`, un proceso en
  modo `fork` cada uno, `kill_timeout` de 20 s para el apagado limpio del worker y carga de
  variables con `node --env-file` desde `/opt/totem-bot/shared/.env`. Sin secretos en el
  repositorio. Desplegar sigue siendo `OWNER_REQUIRED`.
- `docs/PROVISIONING.md` (M6-02): aprovisionamiento del VPS — base del sistema en UTC, SSH
  sin root ni contraseña, cortafuegos, usuario de servicio `totembot`, Node 24 con pnpm y
  PM2, PostgreSQL 17 solo en `localhost`, permisos de disco (`wa-auth` en 0700) y lista de
  verificación. Ejecutarla es `OWNER_REQUIRED`.
- Respaldo cifrado (M6-04): `scripts/backup-postgres.sh` genera dumps `custom`, los cifra con
  GPG, evita solapamientos y aplica retención solo sobre sus propios archivos; cron diario a
  las 03:00 UTC en `scripts/totem-bot-backup.cron`. La instalación y la importación de la
  clave pública siguen siendo `OWNER_REQUIRED`.
- Rotación de logs (M6-05): `scripts/configure-pm2-logrotate.sh` fija `pm2-logrotate@3.0.0`,
  20 MiB por archivo, 14 archivos, gzip, rotación diaria UTC y comprobación cada 30 segundos.
  Instalarlo y aplicarlo en producción sigue siendo `OWNER_REQUIRED`.

### Corregido

- `PrismaReminderRepository.insertIfAbsent` usaba `create` dentro de `try/catch`: en
  PostgreSQL una violación de unicidad **aborta la transacción completa** (`25P02`), de
  modo que absorber el conflicto dejaba la transacción inutilizable y hacía fallar el
  resto del caso de uso. Ahora emite `ON CONFLICT DO NOTHING` vía `createMany` con
  `skipDuplicates`.

### Añadido — M0 (documentación)

- Documentación inicial del repositorio (milestone M0): `README.md`, `AGENTS.md`,
  `CLAUDE.md`, `SPEC.md`, `ARCHITECTURE.md`, `TASKS.md`, `SECURITY.md`, `TESTING.md`,
  `DEPLOYMENT.md`, `OPERATIONS.md`, `CONTRIBUTING.md`.
- Diseño de detalle en `docs/`: requisitos de producto, modelo de dominio, diseño de base
  de datos, motor de recordatorios, integración con WhatsApp, plantillas de mensaje, tiempo
  y ventanas horarias, observabilidad, herramientas y referencias.
- ADRs 0001–0005: monolito modular, PostgreSQL con Prisma, scheduler respaldado por la base
  de datos, frontera del adaptador de Baileys, recordatorios idempotentes.
- `.env.example` con los interruptores de seguridad en su posición segura por defecto
  (`WHATSAPP_ENABLED=false`, `WHATSAPP_DRY_RUN=true`).
- `.gitignore` con protección explícita de la sesión de Baileys y de los secretos.

### Notas

- **No hay adaptador real de WhatsApp** (M4-01): añadir la dependencia crítica Baileys y
  activar la integración siguen siendo `OWNER_REQUIRED`. `WHATSAPP_ENABLED=false` y
  `WHATSAPP_DRY_RUN=true` siguen siendo los valores por defecto. No hay sesión vinculada
  ni se ha enviado ningún mensaje.
- PostgreSQL de pruebas fue levantado en Docker; la migración, las constraints, el rollback,
  el claim concurrente y la recuperación de entrega incierta quedaron verificados con
  `pnpm test:integration` usando `postgres-test`.
- Se añaden `@prisma/adapter-pg` y `pg` como dependencias de runtime, no previstas en
  `docs/REFERENCES.md` original: Prisma 7 requiere un driver adapter explícito y ya no
  acepta `url` en `schema.prisma`. Registrado en `docs/REFERENCES.md` § 2.
- Versiones de dependencias verificadas contra el registro npm el 2026-08-06; ver
  `docs/REFERENCES.md`.
