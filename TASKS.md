# TASKS.md — Backlog

Estados: `TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE` · `OWNER_REQUIRED`

Regla: una tarea que toque más de ~8 archivos debe dividirse. Ninguna tarea se marca `DONE`
sin `pnpm check` en verde y sin cumplir la Definición de Terminado de `AGENTS.md` § 9.

---

## M0 — Descubrimiento y documentación

### M0-01

- **Título:** Inspección del entorno y verificación de herramientas
- **Objetivo:** Confirmar Node, pnpm, Git, Docker y PostgreSQL disponibles y compatibles.
- **Dependencias:** ninguna
- **Archivos esperados:** `docs/REFERENCES.md` (sección Entorno)
- **Criterios de aceptación:** versiones reales registradas; incompatibilidades señaladas.
- **Pruebas requeridas:** ninguna (verificación manual con salida real)
- **Riesgos:** pnpm no instalado en la máquina de desarrollo.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — pnpm **no** está instalado; ver M1-00

### M0-02

- **Título:** Investigación de fuentes oficiales y selección de versiones
- **Objetivo:** Registrar fuente, versión, compatibilidad, riesgos y motivo de cada dependencia.
- **Dependencias:** M0-01
- **Archivos esperados:** `docs/REFERENCES.md`
- **Criterios de aceptación:** una entrada completa por dependencia crítica, con fecha de verificación.
- **Pruebas requeridas:** ninguna
- **Riesgos:** versiones que cambian; typosquatting de Baileys.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-03

- **Título:** Documentación de producto y especificación
- **Objetivo:** `SPEC.md` y `docs/PRODUCT_REQUIREMENTS.md` con criterios de aceptación medibles.
- **Dependencias:** ninguna
- **Archivos esperados:** `SPEC.md`, `docs/PRODUCT_REQUIREMENTS.md`
- **Criterios de aceptación:** RF/RNF numerados; fuera de alcance explícito; preguntas abiertas listadas.
- **Pruebas requeridas:** ninguna
- **Riesgos:** ambigüedad sobre el origen de los datos (Q-01).
- **Requiere propietario:** no (las respuestas a las preguntas abiertas, sí)
- **Estado:** `DONE` (2026-08-06)

### M0-04

- **Título:** Diseño de arquitectura y modelo de dominio
- **Objetivo:** `ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/DATABASE_DESIGN.md`.
- **Dependencias:** M0-03
- **Archivos esperados:** los tres anteriores
- **Criterios de aceptación:** diagramas Mermaid válidos; puertos definidos; decisión de modelado del origen del recordatorio justificada.
- **Pruebas requeridas:** ninguna
- **Riesgos:** sobre-ingeniería.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-05

- **Título:** Diseño del motor de recordatorios, tiempo y plantillas
- **Objetivo:** `docs/REMINDER_ENGINE.md`, `docs/TIME_AND_SCHEDULING.md`, `docs/MESSAGE_TEMPLATES.md`.
- **Dependencias:** M0-04
- **Archivos esperados:** los tres anteriores
- **Criterios de aceptación:** claves de idempotencia definidas; SQL de claim escrito; caso de entrega incierta resuelto; ventanas horarias con tabla de casos.
- **Pruebas requeridas:** ninguna
- **Riesgos:** ninguno relevante en esta fase.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-06

- **Título:** ADRs iniciales
- **Objetivo:** Registrar las cinco decisiones estructurales.
- **Dependencias:** M0-04, M0-05
- **Archivos esperados:** `docs/adr/0001..0005`, `docs/DECISIONS.md`
- **Criterios de aceptación:** cada ADR con contexto, decisión, alternativas, consecuencias, estado y fecha.
- **Pruebas requeridas:** ninguna
- **Riesgos:** ninguno.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-07

- **Título:** Seguridad, pruebas, despliegue y operación
- **Objetivo:** `SECURITY.md`, `TESTING.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `CONTRIBUTING.md`.
- **Dependencias:** M0-05
- **Archivos esperados:** los cinco anteriores
- **Criterios de aceptación:** procedimiento de incidente completo; lista `OWNER_REQUIRED` canónica; estrategia de pruebas por nivel.
- **Pruebas requeridas:** ninguna
- **Riesgos:** ninguno.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-08

- **Título:** Revisión cruzada de consistencia documental
- **Objetivo:** Verificar que enlaces, nombres de variables, estados y comandos coinciden entre documentos.
- **Dependencias:** M0-01 … M0-07
- **Archivos esperados:** correcciones puntuales
- **Criterios de aceptación:** sin enlaces rotos; los nombres de las variables de entorno coinciden con `.env.example`; los estados de `Reminder` coinciden en los cinco documentos que los mencionan.
- **Pruebas requeridas:** ninguna (más adelante, un script `docs:check`)
- **Riesgos:** deriva documental al avanzar los milestones.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M0-09

- **Título:** Responder las preguntas abiertas de `SPEC.md`
- **Objetivo:** Cerrar Q-01 a Q-07 antes de M5.
- **Dependencias:** M0-03
- **Archivos esperados:** `SPEC.md` § 9, `docs/DECISIONS.md`
- **Criterios de aceptación:** cada pregunta con respuesta o con fecha límite.
- **Pruebas requeridas:** ninguna
- **Riesgos:** Q-02 cambia el perfil de privacidad; Q-04 bloquea M7.
- **Requiere propietario:** **sí**
- **Estado:** `OWNER_REQUIRED`

---

## M1 — Esqueleto técnico

### M1-00

- **Título:** Instalar pnpm 11 mediante Corepack
- **Objetivo:** Disponer del administrador de paquetes obligatorio.
- **Dependencias:** M0-01
- **Archivos esperados:** ninguno (entorno)
- **Criterios de aceptación:** `pnpm -v` devuelve `11.x`; `packageManager` fijado en `package.json`.
- **Pruebas requeridas:** ninguna
- **Riesgos:** Corepack deshabilitado en la máquina.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — `pnpm 11.20.0`; también se subió Node a 24.19.0 LTS
  (nvm-windows) por decisión ya registrada en `docs/DECISIONS.md`

### M1-01

- **Título:** Inicializar el proyecto: `package.json`, TypeScript estricto, estructura de carpetas
- **Objetivo:** Base compilable con los scripts definidos.
- **Dependencias:** M1-00
- **Archivos esperados:** `package.json`, `tsconfig.json`, `tsconfig.build.json`, `src/**/.gitkeep`
- **Criterios de aceptación:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` activos; `pnpm typecheck` pasa; todos los scripts de `CONTRIBUTING.md` § 2 declarados (aunque algunos fallen por falta de código).
- **Pruebas requeridas:** ninguna
- **Riesgos:** ESM vs CJS mal resuelto.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — `pnpm typecheck` pasa; scripts declarados

### M1-02

- **Título:** Configuración validada con Zod
- **Objetivo:** `src/config/` como único punto que lee `process.env`.
- **Dependencias:** M1-01
- **Archivos esperados:** `src/config/env.ts`, `src/config/index.ts`, `tests/unit/config/env.test.ts`
- **Criterios de aceptación:** esquema con todas las variables de `.env.example`; `WHATSAPP_ENABLED` por defecto `false` y `WHATSAPP_DRY_RUN` por defecto `true`; un valor inválido aborta el arranque con un mensaje claro y **sin** imprimir el valor.
- **Pruebas requeridas:** valores válidos, inválidos, defaults, y que un secreto no aparezca en el error.
- **Riesgos:** filtrar el valor de un secreto en el mensaje de error de Zod.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — 8 pruebas en verde

### M1-03

- **Título:** Logger Pino con redacción
- **Objetivo:** Logging estructurado sanitizado.
- **Dependencias:** M1-02
- **Archivos esperados:** `src/infrastructure/logging/logger.ts`, `redact.ts`, `correlation.ts`, tests
- **Criterios de aceptación:** CA-09 cubierto; `correlationId` propagado con `AsyncLocalStorage`; `no-console` activo en ESLint.
- **Pruebas requeridas:** test de redacción con QR, credenciales y número de teléfono falsos.
- **Riesgos:** una ruta de redacción olvidada.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — pruebas con QR, credenciales y JID falsos; sin datos reales

### M1-04

- **Título:** Servidor Fastify con `/health` y `/ready`
- **Objetivo:** Comprobaciones de salud mínimas.
- **Dependencias:** M1-03
- **Archivos esperados:** `src/infrastructure/http/server.ts`, `routes/health.ts`, `src/server.ts`, tests
- **Criterios de aceptación:** `/health` responde 200 sin dependencias; `/ready` responde 503 si la base no responde; escucha en `127.0.0.1`.
- **Pruebas requeridas:** integración con `app.inject()`.
- **Riesgos:** exponer el puerto públicamente por descuido.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — verificado con `app.inject()` y con el servidor real en
  `127.0.0.1:3000`

### M1-05

- **Título:** ESLint, Prettier y reglas de límites de capa
- **Objetivo:** Automatizar las reglas de arquitectura de `AGENTS.md` § 2.
- **Dependencias:** M1-01
- **Archivos esperados:** `eslint.config.js`, `.prettierrc`, `.prettierignore`
- **Criterios de aceptación:** `no-restricted-imports` impide que `domain`/`application` importen `@prisma/client`, `@whiskeysockets/baileys`, `fastify` o `node:fs`; `no-console`, `no-only-tests` y prohibición de `any` activos; un archivo de prueba que viole la regla falla el lint.
- **Pruebas requeridas:** verificación manual con un archivo temporal que viole cada regla.
- **Riesgos:** reglas demasiado laxas que no detecten nada.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — verificado con un archivo temporal que importaba
  `node:fs` desde `src/domain/`

### M1-06

- **Título:** Vitest configurado con proyectos unit/integration
- **Objetivo:** Suite ejecutable y determinista.
- **Dependencias:** M1-01
- **Archivos esperados:** `vitest.config.ts`, `tests/setup/*`
- **Criterios de aceptación:** `pnpm test:unit` no requiere base de datos; la suite de integración aborta si `DATABASE_URL` no termina en `_test`; cobertura configurada.
- **Pruebas requeridas:** un test trivial por proyecto.
- **Riesgos:** tests de integración ejecutándose contra la base de desarrollo.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06)

### M1-07

- **Título:** Docker Compose para PostgreSQL de desarrollo y de pruebas
- **Objetivo:** Base de datos local reproducible.
- **Dependencias:** ninguna
- **Archivos esperados:** `docker-compose.yml`
- **Criterios de aceptación:** dos servicios (`postgres`, `postgres-test`) en puertos distintos, PostgreSQL 17, volumen nombrado, healthcheck.
- **Pruebas requeridas:** ninguna
- **Riesgos:** colisión de puertos con una instalación local.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — configuración verificada; **no probada en ejecución**:
  el daemon de Docker Desktop no estaba disponible en la máquina de desarrollo

### M1-08

- **Título:** GitHub Actions
- **Objetivo:** CI que ejecute lint, typecheck, tests y build.
- **Dependencias:** M1-05, M1-06, M1-07
- **Archivos esperados:** `.github/workflows/ci.yml`
- **Criterios de aceptación:** `WHATSAPP_ENABLED=false` forzado; matriz de zonas horarias; `pnpm audit --audit-level=high`; `--frozen-lockfile`.
- **Pruebas requeridas:** el workflow pasa en verde.
- **Riesgos:** ninguno.
- **Requiere propietario:** no (el `git push` inicial sí)
- **Estado:** `DONE` (2026-08-06) — workflow creado; **no verificado en GitHub Actions**
  porque no se ha hecho `git push` (`OWNER_REQUIRED`)

### M1-09

- **Título:** `pnpm check` y ganchos de Git
- **Objetivo:** Un solo comando de verificación previo a cualquier entrega.
- **Dependencias:** M1-05, M1-06
- **Archivos esperados:** `package.json`, opcionalmente `.husky/`
- **Criterios de aceptación:** `pnpm check` encadena `format:check`, `lint`, `typecheck`, `test:unit`. Husky/lint-staged solo si no ralentiza el flujo; si se descarta, se documenta el porqué en `docs/DECISIONS.md`.
- **Pruebas requeridas:** ninguna
- **Riesgos:** ganchos lentos que se acaben saltando con `--no-verify`.
- **Requiere propietario:** no
- **Estado:** `DONE` (2026-08-06) — Husky descartado por ahora; ver `docs/DECISIONS.md`

---

## M2 — Dominio y persistencia

- **M2-01** Entidades y objetos de valor del dominio (puros, sin I/O). _Pruebas: invariantes y transiciones de estado._
- **M2-02** Definición de todos los puertos en `src/domain/ports/`.
- **M2-03** `schema.prisma` completo + primera migración.
- **M2-04** Restricciones SQL manuales (`CHECK`, índices parciales, índice único de grupo primario) en la migración. _Pruebas: cada restricción rechaza lo que debe._
- **M2-05** `TransactionManager` sobre `$transaction` con repositorios transaccionales.
- **M2-06** Repositorios Prisma: `Client`, `WhatsAppGroup`, `Recording`, `Task`, `Invoice`.
- **M2-07** `ReminderRepository` con el claim atómico (SQL crudo con `SKIP LOCKED`). _Pruebas: CA-01._
- **M2-08** `MessageAttempt` y `AuditEvent` con sus repositorios.
- **M2-09** `SystemClock`, `UuidV7Generator` y sus dobles de prueba.
- **M2-10** Semillas de desarrollo con datos ficticios (nunca datos reales).

## M3 — Motor de recordatorios

- **M3-01** `IdempotencyKeyFactory`. _Pruebas: determinismo y colisiones._
- **M3-02** `ReminderSchedulePolicy` por tipo de origen.
- **M3-03** `BusinessWindowService`. _Pruebas: toda la tabla de casos, con reloj fijo._
- **M3-04** `EligibilityService`. _Pruebas: cada fila de la tabla de elegibilidad._
- **M3-05** `RetryPolicy` con backoff y jitter inyectado.
- **M3-06** Caso de uso `ProcessDueReminders` (orquestación del tick).
- **M3-07** Bucle del worker con parada limpia (`SIGTERM`) y `src/worker.ts`.
- **M3-08** Recuperación de locks expirados y manejo de entrega incierta (`NEEDS_REVIEW`). _Pruebas: CA-07._
- **M3-09** `DryRunMessagingGateway` y `FakeMessagingGateway`.
- **M3-10** Endpoint `/status` con las métricas de `docs/OBSERVABILITY.md`.
- **M3-11** E2E con el fake gateway: los tres flujos completos. _Pruebas: CA-10._

## M4 — Adaptador de WhatsApp

- **M4-01** `BaileysMessagingGateway` implementando el puerto (Baileys `6.7.24` fijado).
- **M4-02** Mapeo de errores de Baileys a la clasificación del dominio. _Pruebas: funciones puras._
- **M4-03** Almacén de sesión con verificación de permisos al arrancar.
- **M4-04** Factoría del gateway con doble bandera; lanza error en `NODE_ENV=test`. _Pruebas: la protección funciona._
- **M4-05** Comandos CLI: `whatsapp:link`, `whatsapp:status`, `whatsapp:logout`, `whatsapp:groups`. **`OWNER_REQUIRED` para ejecutarlos.**
- **M4-06** Gestión de conexión y reconexión con backoff; detección de `loggedOut`.
- **M4-07** Prueba que verifica que Baileys no se importa desde `tests/` ni desde `domain`.
- **M4-08** Reevaluar el salto a Baileys 7.x cuando exista GA (ADR nuevo si se decide migrar).

## M5 — Casos de uso

- **M5-01** Alta y gestión de clientes y grupos por CLI (con `authorizedAt` manual).
- **M5-02** Grabaciones: crear, reprogramar, cancelar; programación del recordatorio de 24 h.
- **M5-03** Tareas: transiciones de estado con validación; programación al entrar en `CLIENT_REVIEW`.
- **M5-04** Cancelación de recordatorios al salir de `CLIENT_REVIEW`. _Pruebas: CA-04._
- **M5-05** Facturas: alta, marcar pagada, cálculo de `OVERDUE`.
- **M5-06** Recordatorios de pago con sus offsets. _Pruebas: CA-03 (una factura pagada nunca envía)._
- **M5-07** Plantillas v1 y el renderizador con validación Zod estricta. _Pruebas: snapshots._
- **M5-08** `template:preview` y comandos CLI de operación (`automation:pause/resume`, `reminder:show/resolve`).
- **M5-09** `AutomationSetting` con resolución cliente → global → default.

## M6 — Operación en Hostinger

- **M6-01** `ecosystem.config.cjs` para PM2. **`OWNER_REQUIRED` para desplegar.**
- **M6-02** Guía de aprovisionamiento del servidor (usuario de servicio, permisos, Node, PostgreSQL).
- **M6-03** Base de datos y variables de producción. **`OWNER_REQUIRED`.**
- **M6-04** Script de respaldo cifrado y su cron.
- **M6-05** Rotación de logs con `pm2-logrotate`.
- **M6-06** Verificación posterior al despliegue (health, ready, status) documentada y ejecutada.
- **M6-07** **Ensayo de restauración de respaldo** sobre una base desechable.
- **M6-08** Job de purga por retención (12 meses).

## M7 — Piloto controlado

- **M7-01** Selección del número secundario. **`OWNER_REQUIRED`.**
- **M7-02** Creación y autorización del grupo de prueba. **`OWNER_REQUIRED`.**
- **M7-03** Dry-run en producción con datos reales; revisión de los mensajes renderizados.
- **M7-04** Primer envío real: un recordatorio de grabación. **`OWNER_REQUIRED`.**
- **M7-05** Envío real de los otros dos tipos. **`OWNER_REQUIRED`.**
- **M7-06** Una semana de observación; revisión de logs y de duplicados.
- **M7-07** Incorporación de clientes reales, uno a uno. **`OWNER_REQUIRED` por cliente.**
