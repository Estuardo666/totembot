# docs/REFERENCES.md — Fuentes oficiales y versiones

Verificación realizada el **2026-08-06** consultando el registro npm
(`npm view <paquete> version|engines|dist-tags`), `https://nodejs.org/dist/index.json` y los
repositorios oficiales. Ningún dato de esta tabla proviene de memoria del modelo.

## 1. Entorno verificado (máquina de desarrollo)

| Herramienta     | Detectado                               | Objetivo                                        | Nota                                                                                                                                                                                                                            |
| --------------- | --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js         | v22.13.0 (máquina de desarrollo actual) | **24.19.0 LTS (Krypton) — decidido 2026-08-06** | 22.13 cumplía el mínimo pero justo en el límite de ESLint 10 (`^22.13.0`). Subir a 24 LTS es tarea M1-00, sin bloqueos: todo el stack (Prisma 7, Fastify 5, Zod 4, Pino 10, Vitest 4, ESLint 10, Baileys 6.7.24) soporta `>=24` |
| npm             | 10.9.2                                  | —                                               | solo para arrancar Corepack                                                                                                                                                                                                     |
| **pnpm**        | **no instalado**                        | 11.20.0                                         | tarea M1-00: `corepack enable && corepack prepare pnpm@11 --activate`                                                                                                                                                           |
| Git             | 2.52.0.windows.1                        | —                                               | ok                                                                                                                                                                                                                              |
| Docker          | 29.6.1                                  | —                                               | ok, para PostgreSQL local                                                                                                                                                                                                       |
| Repositorio Git | **no inicializado**                     | —                                               | tarea M1-01                                                                                                                                                                                                                     |

Node LTS al 2026-08-06: **v24.19.0 (Krypton, activo)** y v22.23.2 (Jod, mantenimiento).
v26.7.0 es _Current_, sin LTS: no se usa.

## 2. Dependencias

Formato: propósito · fuente oficial · versión evaluada → **seleccionada** · Node ·
riesgos · alternativas · motivo.

### `@whiskeysockets/baileys` — adaptador de WhatsApp

- **Fuente:** https://github.com/WhiskeySockets/Baileys · docs https://baileys.wiki
- **Evaluado:** `latest` = `7.0.0-rc14`; `legacy` = `6.7.24`
- **Seleccionado:** **`6.7.24`** (fijado, sin `^`)
- **Node:** `>=20.0.0`
- **Riesgos:** no oficial (riesgo de baneo y de rotura de protocolo); 7.0.0 lleva 14 RC sin
  GA e introduce cambios incompatibles y la dependencia binaria `whatsapp-rust-bridge`;
  **6.7.24 resuelve `libsignal` desde `git+https://github.com/whiskeysockets/libsignal-node.git`**,
  sin verificación de integridad del registro npm; existen forks y paquetes con nombres
  similares (typosquatting).
- **Alternativas:** WhatsApp Cloud API oficial (no permite el mismo uso en grupos, coste por
  conversación, requiere aprobación de plantillas); `whatsapp-web.js` (requiere Chromium,
  más pesado y con el mismo riesgo de no-oficialidad).
- **Motivo:** es el proyecto de referencia, el más mantenido y el único que cubre el caso
  de uso sin un navegador. Se fija la línea estable y se aísla tras `MessagingGateway`.
- **Verificado:** 2026-08-06

### `prisma` / `@prisma/client` — ORM y migraciones

- **Fuente:** https://github.com/prisma/prisma · https://www.prisma.io/docs
- **Evaluado y seleccionado:** **`7.9.1`**
- **Node:** `^20.19 || ^22.12 || >=24.0`
- **Riesgos:** cambios de configuración del generador en la línea 7; el cliente generado
  añade peso al build.
- **Alternativas:** Drizzle (más ligero, menos maduro en migraciones), Kysely + node-pg
  (más control, más código propio), SQL crudo.
- **Motivo:** migraciones versionadas sólidas, tipado fuerte, y `$queryRaw` disponible para
  el claim con `SKIP LOCKED`, que es lo único que Prisma no expresa bien.
- **Verificado:** 2026-08-06

### `fastify` — HTTP para health checks

- **Fuente:** https://github.com/fastify/fastify · https://fastify.dev/docs/latest/
- **Seleccionado:** **`5.11.2`**
- **Node:** sin restricción declarada (soporta 20+)
- **Riesgos:** ninguno relevante; el uso es mínimo.
- **Alternativas:** `node:http` puro (suficiente para 3 rutas), Express (más lento, menos
  tipado).
- **Motivo:** ya previsto para futuras APIs internas; `app.inject()` facilita las pruebas.
  Si el uso se quedara en tres rutas, `node:http` sería defendible: revisar en M6.
- **Verificado:** 2026-08-06

### `zod` — validación en los límites

- **Fuente:** https://github.com/colinhacks/zod
- **Seleccionado:** **`4.4.3`**
- **Riesgos:** la línea 4 cambió la API respecto a la 3; seguir la documentación de v4.
- **Alternativas:** Valibot (más ligero), TypeBox, io-ts.
- **Motivo:** estándar de facto, integración natural con la validación de entorno y de
  variables de plantilla.
- **Verificado:** 2026-08-06

### `pino` — logging estructurado

- **Fuente:** https://github.com/pinojs/pino
- **Seleccionado:** **`10.3.1`** (+ `pino-pretty` `13.1.3` solo en desarrollo)
- **Riesgos:** Baileys 6.x depende internamente de `pino@^9.6`; habrá dos copias en el
  árbol de dependencias. Es inocuo (no compartimos instancia de logger con Baileys) pero se
  documenta para evitar sorpresas en el lockfile.
- **Alternativas:** Winston (más lento), `console` estructurado a mano.
- **Motivo:** rendimiento, JSON nativo y `redact` de primera clase, que es un requisito de
  seguridad de este proyecto.
- **Verificado:** 2026-08-06

### `vitest` — pruebas

- **Fuente:** https://github.com/vitest-dev/vitest
- **Seleccionado:** **`4.1.10`**
- **Node:** `^20.0.0 || ^22.0.0 || >=24.0.0`
- **Riesgos:** ninguno relevante.
- **Alternativas:** `node:test` (sin cobertura ni watch cómodos), Jest (más lento con TS/ESM).
- **Motivo:** velocidad, ESM y TypeScript sin configuración adicional, proyectos separados
  para unit/integration.
- **Verificado:** 2026-08-06

### `typescript`

- **Fuente:** https://github.com/microsoft/TypeScript
- **Evaluado:** `latest` = `7.0.2`; también existen `6.0.3` y `5.9.3`
- **Seleccionado:** **`5.9.3`**
- **Riesgo detectado y decisivo:** `typescript-eslint@8.66.0` declara el peer
  `typescript: ">=4.8.4 <6.1.0"`. **TypeScript 7 no está soportado por typescript-eslint**,
  y las reglas con información de tipos son parte de la estrategia de calidad de este
  proyecto. TS 6.0.3 sí entraría en el rango, pero 5.9.3 maximiza la compatibilidad con
  Prisma 7 y Vitest 4 sin aportar nada que el proyecto necesite.
- **Alternativas:** TS 6.0.3 (soportado por el linter, aún poco rodado), TS 7 (rechazado
  por el peer del linter).
- **Motivo:** compatibilidad verificada con toda la cadena de herramientas. Revisar cuando
  typescript-eslint publique soporte para la línea 7.
- **Verificado:** 2026-08-06

### `eslint` + `typescript-eslint`

- **Fuente:** https://github.com/eslint/eslint · https://github.com/typescript-eslint/typescript-eslint
- **Seleccionado:** **`eslint@10.8.0`**, **`typescript-eslint@8.66.0`**
- **Node de ESLint 10:** `^20.19.0 || ^22.13.0 || >=24` — la máquina de desarrollo está en
  22.13.0, justo en el mínimo. Otra razón para subir a Node 24.
- **Motivo:** reglas con información de tipos y `no-restricted-imports` para hacer cumplir
  los límites de capa de forma automática.
- **Verificado:** 2026-08-06

### `prettier`

- **Fuente:** https://github.com/prettier/prettier · **Seleccionado:** `3.9.6` · sin riesgos.

### `luxon` (+ `@types/luxon`)

- **Fuente:** https://github.com/moment/luxon
- **Seleccionado:** **`3.7.2`**
- **Riesgos:** requiere ICU completo (presente en las distribuciones oficiales de Node).
- **Alternativas:** `date-fns` + `date-fns-tz` (zonas menos integradas), `Temporal` nativo
  (no garantizado como estable en la versión objetivo de Node), `Intl` a mano (verboso y
  propenso a errores).
- **Motivo:** las zonas horarias IANA son un requisito central y Luxon las trata como
  ciudadanos de primera clase. **No estaba en el stack propuesto**: se añade aquí como
  dependencia crítica y queda pendiente de aprobación (`OWNER_REQUIRED`, tarea M3-03).
- **Verificado:** 2026-08-06

### `pm2` — ejecución persistente

- **Fuente:** https://github.com/Unitech/pm2 · https://pm2.keymetrics.io/docs/
- **Seleccionado:** **`7.0.3`** (instalado globalmente en el servidor, no como dependencia
  del proyecto)
- **Riesgos:** el modo `cluster` no debe usarse para el worker.
- **Alternativas:** unidad systemd (menos dependencias, sin gestión de logs integrada);
  seria una opción válida si se quiere reducir superficie. Revisar en M6.
- **Motivo:** reinicio automático, arranque en boot y rotación de logs con poco esfuerzo.
- **Verificado:** 2026-08-06

### `tsx` — ejecución en desarrollo

- **Fuente:** https://github.com/privatenumber/tsx · **Seleccionado:** `4.23.9` · solo `devDependency`.

### `husky` + `lint-staged` (opcional)

- **Fuente:** https://github.com/typicode/husky · https://github.com/lint-staged/lint-staged
- **Evaluado:** `9.1.7` / `17.3.0` · **Descartados en M1-09.** `pnpm check` y CI ya cubren
  la verificación obligatoria; ver `docs/DECISIONS.md`.

### `eslint-plugin-no-only-tests`

- **Fuente:** https://github.com/levibuzolic/eslint-plugin-no-only-tests
- **Seleccionado:** **`3.4.0`** · `devDependency`
- **Riesgos:** ninguno; paquete de un solo propósito, sin dependencias.
- **Motivo:** `TASKS.md` M1-05 exige que un `.only`/`.skip` accidental en pruebas falle el
  lint (`CONTRIBUTING.md` § 7).
- **Verificado:** 2026-08-06 (tarea M1)

### PostgreSQL

- **Fuente:** https://www.postgresql.org/docs/
- **Seleccionado:** **17.x** (imagen `postgres:17` en Docker Compose y en CI)
- **Motivo:** `FOR UPDATE SKIP LOCKED`, índices parciales, `CHECK`, `timestamptz` y `jsonb`
  son exactamente las primitivas sobre las que se apoya el motor de recordatorios.
- **Verificado:** 2026-08-06

### `@prisma/adapter-pg` + `pg` — driver adapter de Prisma 7

- **Fuente:** https://github.com/prisma/prisma (paquete `@prisma/adapter-pg`) ·
  https://github.com/brianc/node-postgres
- **Seleccionado:** **`@prisma/adapter-pg@7.9.1`**, **`pg@8.22.0`** (+ `@types/pg@8.20.4`
  como `devDependency`)
- **Node:** sin restricción declarada adicional a la de Prisma 7 (`^20.19 || ^22.12 || >=24.0`)
- **Riesgos:** ninguno relevante; `pg` es el cliente PostgreSQL de referencia en el
  ecosistema Node.
- **Alternativas:** ninguna razonable — Prisma 7 exige un `driverAdapter` explícito y ya no
  acepta `datasource.url` en `schema.prisma` (la URL se pasa al adapter en tiempo de
  ejecución); no estaba anticipado en la verificación inicial de versiones.
- **Motivo:** requisito técnico de Prisma 7 para poder generar el cliente y conectarse a
  PostgreSQL. Descubierto al ejecutar `pnpm db:generate` en la tarea M1-01/M1-04.
- **Verificado:** 2026-08-06 (tarea M1)

### `bullmq` — **no adoptado**

- **Fuente:** https://github.com/taskforcesh/bullmq · https://docs.bullmq.io/
- **Evaluado:** `6.0.8` · **No se instala en el MVP.**
- **Motivo:** requiere Redis, un segundo almacén de estado que puede divergir de la fuente
  de verdad, más operación y más modos de fallo, para un volumen de < 300 mensajes/mes que
  PostgreSQL absorbe sin esfuerzo. Ver [adr/0003](adr/0003-database-backed-scheduler.md),
  que fija los criterios objetivos que dispararían la migración.
- **Verificado:** 2026-08-06

## 3. Resumen de versiones seleccionadas

| Paquete                     | Versión                   | Ámbito            |
| --------------------------- | ------------------------- | ----------------- |
| Node.js                     | **24.19.0 LTS (Krypton)** | runtime           |
| pnpm                        | 11.20.0                   | gestor            |
| PostgreSQL                  | 17.x                      | base de datos     |
| `@whiskeysockets/baileys`   | 6.7.24 (fijada)           | runtime           |
| `@prisma/client` / `prisma` | 7.9.1                     | runtime / dev     |
| `fastify`                   | 5.11.2                    | runtime           |
| `zod`                       | 4.4.3                     | runtime           |
| `pino`                      | 10.3.1                    | runtime           |
| `luxon`                     | 3.7.2                     | runtime           |
| `typescript`                | 5.9.3                     | dev               |
| `eslint`                    | 10.8.0                    | dev               |
| `typescript-eslint`         | 8.66.0                    | dev               |
| `prettier`                  | 3.9.6                     | dev               |
| `vitest`                    | 4.1.10                    | dev               |
| `tsx`                       | 4.23.9                    | dev               |
| `pm2`                       | 7.0.3                     | servidor (global) |

## 4. Incompatibilidades detectadas

1. **TypeScript 7 vs typescript-eslint** — peer `<6.1.0`. Resuelto seleccionando TS 5.9.3.
2. **ESLint 10 vs Node 22.13.0** — el mínimo es exactamente `^22.13.0`. Cualquier Node 22
   anterior rompería. Resuelto recomendando Node 24 LTS.
3. **Baileys 6.7.24 y `libsignal` por Git** — sin integridad del registro npm. Mitigado con
   lockfile fijado, `--frozen-lockfile` y revisión manual de la entrada del lockfile.
4. **Doble copia de pino** (10.x propia, 9.x dentro de Baileys). Inocuo, documentado.

## 5. Política de reverificación

Estas versiones se revalidan antes de iniciar M1 y en cada actualización de dependencias,
volviendo a consultar el registro npm y actualizando la fecha de verificación. No se
actualiza una dependencia crítica sin registrar el motivo aquí.
