# docs/DECISIONS.md — Registro de decisiones menores

Las decisiones estructurales viven en `docs/adr/`. Aquí se registra todo lo demás:
elecciones puntuales, suposiciones, y el motivo de descartar algo.

Formato: fecha · decisión · motivo · impacto.

---

### 2026-08-06 — `modules/` pasa a ser capa de composición

`domain/` y `application/` se elevan por encima de `modules/`. Motivo: la estructura
propuesta permitía entidades duplicadas dentro de cada módulo y a la vez en `domain/`, lo
que genera ambigüedad sobre dónde vive una regla. Impacto: `modules/` contiene wiring y la
API pública de cada área, no lógica de negocio. Ver `ARCHITECTURE.md` § 2.

### 2026-08-06 — Se añade el estado `NEEDS_REVIEW` a `Reminder`

Los estados sugeridos no cubrían la entrega incierta (proceso caído entre el envío y la
confirmación). Sin un estado propio, el sistema debía elegir entre duplicar o perder en
silencio. Impacto: un estado más y un comando CLI de resolución.
Ver `docs/REMINDER_ENGINE.md` § 7.

### 2026-08-06 — Preferir no duplicar antes que no perder

Ante una entrega incierta se prefiere un mensaje no enviado y revisado por una persona
frente a un mensaje duplicado a un cliente. Motivo: el coste reputacional de duplicar es
mayor, y el volumen (< 15/día) hace trivial la revisión manual. Impacto: `NEEDS_REVIEW`
nunca se reintenta automáticamente.

### 2026-08-06 — Luxon como librería de fechas

No estaba en el stack propuesto. Motivo: las zonas horarias IANA son un requisito central y
tratarlas con `Intl` a mano es verboso y propenso a errores; `Temporal` no está garantizado
como estable en la versión objetivo de Node. Impacto: una dependencia de runtime más.
**Pendiente de aprobación del propietario** (dependencia crítica, `AGENTS.md` § 7).

### 2026-08-06 — TypeScript 5.9.3 en lugar de 7.0.2

`typescript-eslint@8.66.0` declara el peer `typescript: <6.1.0`. Las reglas de lint con
información de tipos son parte de la estrategia de calidad, así que se elige la versión
compatible. Impacto: revisar cuando typescript-eslint soporte la línea 7.
Ver `docs/REFERENCES.md` § 4.

### 2026-08-06 — Baileys en la línea `6.7.x`, no en `7.0.0-rc`

El dist-tag `latest` apunta a un release candidate con 14 iteraciones, cambios
incompatibles y una dependencia binaria nativa. Impacto: se asume el riesgo conocido de
`libsignal` instalado desde Git en 6.7.24, mitigado con lockfile fijado.
Reevaluación en la tarea M4-08.

### 2026-08-06 — Clave de idempotencia de grabación incluye `scheduledAt`

Alternativa descartada: clave sin el instante, con actualización del recordatorio al
reprogramar. Motivo: incluir el instante hace que reprogramar genere una clave nueva de
forma natural, sin lógica de actualización que pueda fallar a medias. Impacto: al
reprogramar hay que cancelar explícitamente el recordatorio antiguo.

### 2026-08-06 — Los envíos son secuenciales con pausa aleatoria

Motivo: a < 15 mensajes/día no hay ninguna razón para paralelizar, y un ritmo humano reduce
el riesgo de restricción de la cuenta. Impacto: un tick con muchos recordatorios tarda más;
irrelevante a este volumen.

### 2026-08-06 — El MVP no procesa mensajes entrantes

La confirmación del cliente se pide en el texto, pero no se lee automáticamente (SPEC Q-02
pendiente). Motivo: leer entrantes cambia el perfil de privacidad del sistema (PRI-02).
Impacto: la confirmación la verifica una persona en el MVP.

### 2026-08-06 — Fastify se mantiene pese a usarse solo para tres rutas

`node:http` bastaría hoy. Se mantiene por el plan de APIs internas futuras y por
`app.inject()` en las pruebas. **Revisión programada en M6**: si no han aparecido más
rutas, considerar la eliminación.

### 2026-08-06 — Husky y lint-staged aplazados

`pnpm check` y CI ya cubren la verificación. Se decidirá en M1-09 si aportan valor
suficiente frente a la fricción que añaden.

### 2026-08-06 — Confirmado: Node 24 LTS ahora, TypeScript 7 aplazado

Propietario confirma subir a Node 24.19.0 (Krypton) desde el inicio de M1: todo el stack
(Prisma 7, Fastify 5, Zod 4, Pino 10, Vitest 4, ESLint 10, Baileys 6.7.24) ya soporta
`>=24`, sin bloqueos. TypeScript 7 permanece descartado: `typescript-eslint` (verificado de
nuevo, incluso en pre-releases `8.66.1-alpha.*`) sigue declarando el peer
`typescript: ">=4.8.4 <6.1.0"`, y perder el lint con información de tipos rompería la
regla `no-restricted-imports` que hace cumplir los límites de capa (`AGENTS.md` § 2).
Revisar en cada milestone si typescript-eslint amplía el rango; si ocurre, es un bump de
versión documentado, no un ADR.

### 2026-08-06 — No se adopta ningún servidor MCP

Ver `docs/TOOLS_AND_SKILLS.md`. Las herramientas estándar cubren M0–M7 y ninguna
herramienta con acceso potencial a `.env` o a la sesión de WhatsApp se conecta a un agente.

### 2026-08-06 — Prisma 7 requiere `@prisma/adapter-pg`

`prisma generate` rechazó `datasource.url` en `schema.prisma` (P1012): Prisma 7 mueve la
conexión a un driver adapter pasado al constructor de `PrismaClient`. Se añaden
`@prisma/adapter-pg` y `pg` como dependencias de runtime no previstas en la verificación
original. Impacto: `prisma.config.ts` nuevo; `schema.prisma` queda con `datasource` sin
`url`. Ver `docs/REFERENCES.md` § 2.

### 2026-08-06 — `pnpm check` usa `test:unit`, no `test` completo

`AGENTS.md` § 4 y `CONTRIBUTING.md` describen `pnpm check` como
`format:check + lint + typecheck + test`. `TASKS.md` (M1-09) especifica explícitamente
`test:unit`, porque la suite de integración exige `postgres-test` levantado y `pnpm check`
debe poder ejecutarse sin Docker. Se sigue `TASKS.md` por ser la instrucción más concreta
para esta tarea; el conflicto queda registrado aquí en vez de resolverse en silencio
(`AGENTS.md` § 11). Impacto: CI ejecuta `pnpm check` (unitarias) pero no las de integración
en esta fase; `test:integration` queda como comando manual.

### 2026-08-06 — Node 24.19.0 instalado con nvm-windows durante M1-00

`docs/DECISIONS.md` (entrada anterior del mismo día) ya registraba la decisión del
propietario de subir a Node 24 desde el inicio de M1. Se instaló y activó con
`nvm install 24.19.0 && nvm use 24.19.0` (el gestor `nvm-windows` ya estaba disponible en
la máquina). `corepack prepare` falló inicialmente por una firma de paquete no reconocida
(`Cannot find matching keyid`); se resolvió actualizando `corepack` a la última versión
(`npm install -g corepack@latest`) antes de reintentar, sin desactivar la verificación de
integridad.

### 2026-08-06 — Husky no se adopta en M1-09

`pnpm check` (formato, lint, typecheck, pruebas unitarias, build) y el workflow de CI ya
cubren la verificación obligatoria antes de cualquier entrega. Añadir Husky/lint-staged
introduciría un gancho de pre-commit adicional sin una necesidad concreta todavía. Se
revisará si aparece fricción real (p. ej. commits que se saltan `pnpm check` con
`--no-verify`).

### 2026-08-07 — `Intl` para ventanas horarias en M3

Se implementa la conversión IANA con `Intl.DateTimeFormat` en lugar de añadir Luxon en
esta etapa. Motivo: Luxon figura como dependencia crítica pendiente de aprobación del
propietario y Node 24 ya proporciona las primitivas necesarias para el volumen y las zonas
del MVP. Impacto: la lógica de conversión queda encapsulada en `BusinessWindowService` y
debe ampliarse con pruebas de DST si se incorporan zonas con horario de verano. La decisión
de dependencia de Luxon queda abierta para una futura revisión.

### 2026-08-07 — Repositorios ligados a la transacción Prisma

El `TransactionManager` entrega repositorios construidos con el `TransactionClient` de
Prisma dentro del callback de `$transaction`. Motivo: usar repositorios creados con el
cliente raíz dentro del callback no participa en la transacción y permite que un rollback
deje escrituras persistidas. Impacto: los casos de uso que combinan entidad, recordatorio e
intento deben usar exclusivamente los repositorios recibidos por el callback.

### 2026-08-07 — Migración correctiva para el formato de periodo

La primera migración escapó incorrectamente `\\d` en la expresión regular de PostgreSQL y
rechazaba periodos válidos como `2026-08`. Se conserva la migración aplicada y se añade
`202608070002_fix_period_constraint` con una expresión `[0-9]` equivalente y verificable.

### 2026-08-07 — Métricas de recordatorios consultadas bajo demanda

`GET /status` consulta los conteos directamente mediante `ReminderRepository` en cada
petición, en vez de mantener contadores mutables en memoria. Motivo: el worker puede
reiniciarse y varios procesos pueden modificar recordatorios; PostgreSQL es la fuente de
verdad. Impacto: el diagnóstico refleja el estado persistido y asume que la base de datos
está disponible para responder el endpoint.

### 2026-08-07 — Integración PostgreSQL serial entre archivos

Los archivos de integración de Vitest se ejecutan en serie porque comparten una base de datos
de pruebas y el claim del worker selecciona recordatorios globalmente. La concurrencia del
claim permanece dentro del caso de prueba, usando dos conexiones independientes. Motivo:
evitar interferencia entre fixtures y conservar una prueba fiel de `SKIP LOCKED`.

### 2026-08-07 — La autorización de grupos requiere un instante manual

`group:add` no autoriza grupos y `group:authorize` exige `--authorized-at` explícito. Motivo:
la autorización representa una decisión del propietario sobre un grupo ya conocido, no un
evento que el bot deba inferir por descubrir grupos. Impacto: un grupo sin `authorizedAt`
nunca es elegible para envío; la acción queda auditada con actor `CLI`.

### 2026-08-07 — Los respaldos se cifran en el servidor con una clave pública GPG

M6-04 usa `pg_dump --format=custom` y cifra el flujo con la clave pública del propietario;
la clave privada permanece fuera del VPS. Motivo: el servidor necesita crear respaldos
automáticos, pero no debe tener capacidad de descifrarlos. El script escribe la contraseña
solo en un `.pgpass` temporal `0600`, evita secretos en argv y limita la purga a sus propios
archivos con retención de 30 días. La restauración real queda para M6-07.

### 2026-08-07 — La rotación de logs vive en el módulo persistente de PM2

M6-05 usa `pm2-logrotate@3.0.0`, configurado como el usuario `totembot`, con límite de 20 MiB,
14 archivos, gzip, rotación diaria a medianoche UTC y comprobación cada 30 segundos. Motivo:
PM2 es quien abre los logs y puede coordinar su rotación sin introducir un segundo mecanismo de
reapertura de descriptores. La configuración se aplica con un script repetible y la instalación
en producción sigue siendo `OWNER_REQUIRED`.

---

## Preguntas abiertas

Las preguntas de producto viven en `SPEC.md` § 9 (Q-01 … Q-07). Las técnicas pendientes:

- **T-01** ¿Almacenar la sesión de Baileys en PostgreSQL cifrada en lugar de en archivos?
  Decisión en M4. Compromiso: sobrevive a una reinstalación, pero mete una credencial de
  acceso total en los respaldos.
- **T-02** ¿PM2 o una unidad systemd? Decisión en M6. systemd reduce superficie; PM2 da
  rotación de logs y arranque en boot con menos trabajo.
- **T-03** ¿Feriados nacionales en la ventana horaria? Fuera de la v1; evaluar tras el piloto.
- **T-04** ¿Notificación automática al operador cuando `needsReview > 0`? Post-MVP;
  nunca a un grupo de cliente.
