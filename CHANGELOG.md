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
- `prisma/schema.prisma` mínimo (solo `datasource`/`generator`, sin modelar el dominio) y
  `prisma.config.ts`; cliente generado con el adaptador `@prisma/adapter-pg`.

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

- **No hay dominio ni casos de uso implementados** (M2/M3). **No hay worker funcional**
  (M3-07). **No hay adaptador real de WhatsApp** (M4): `WHATSAPP_ENABLED=false` y
  `WHATSAPP_DRY_RUN=true` siguen siendo los valores por defecto y no se han cambiado. No
  hay sesión de WhatsApp vinculada. No se ha enviado ningún mensaje.
- Se añaden `@prisma/adapter-pg` y `pg` como dependencias de runtime, no previstas en
  `docs/REFERENCES.md` original: Prisma 7 requiere un driver adapter explícito y ya no
  acepta `url` en `schema.prisma`. Registrado en `docs/REFERENCES.md` § 2.
- Versiones de dependencias verificadas contra el registro npm el 2026-08-06; ver
  `docs/REFERENCES.md`.
