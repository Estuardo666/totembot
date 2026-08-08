# CONTRIBUTING.md

`AGENTS.md` manda. Este documento es la ergonomía del día a día.

## 1. Puesta en marcha

```bash
corepack enable && corepack prepare pnpm@11 --activate
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm check
```

No hace falta ninguna credencial de WhatsApp para desarrollar. `WHATSAPP_ENABLED=false` y
`WHATSAPP_DRY_RUN=true` son los valores por defecto y no se cambian en local.

## 2. Comandos

| Comando                             | Qué hace                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                          | servidor Fastify en watch (`tsx watch src/server.ts`)                              |
| `pnpm dev:worker`                   | worker en watch                                                                    |
| `pnpm build`                        | compila a `dist/`                                                                  |
| `pnpm start` / `pnpm start:worker`  | ejecuta lo compilado                                                               |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                                                             |
| `pnpm format` / `pnpm format:check` | Prettier                                                                           |
| `pnpm typecheck`                    | `tsc --noEmit`                                                                     |
| `pnpm test`                         | toda la suite                                                                      |
| `pnpm test:unit`                    | solo unitarias (sin base de datos)                                                 |
| `pnpm test:integration`             | requiere `postgres-test` levantado                                                 |
| `pnpm test:coverage`                | cobertura                                                                          |
| `pnpm db:generate`                  | cliente Prisma                                                                     |
| `pnpm db:migrate`                   | `prisma migrate dev` (**solo local**)                                              |
| `pnpm db:deploy`                    | `prisma migrate deploy` (CI y producción)                                          |
| `pnpm db:seed`                      | Carga datos ficticios de desarrollo; nunca datos reales                            |
| `pnpm db:studio`                    | Prisma Studio                                                                      |
| `pnpm cli <comando>`                | CLI administrativa                                                                 |
| **`pnpm check`**                    | `format:check` + `lint` + `typecheck` + `test`. **Obligatorio antes de terminar.** |

## 3. Flujo

1. Una rama por tarea: `feat/M3-04-claim-atomico`, `fix/...`, `docs/...`, `chore/...`.
2. Tarea pequeña, con su entrada en `TASKS.md`.
3. Prueba primero en dominio y motor de recordatorios.
4. `pnpm check` en verde.
5. Documentación y `CHANGELOG.md` actualizados.
6. Estado de la tarea actualizado en `TASKS.md`.

## 4. Commits

Convencionales, en inglés, imperativo, con el ID de la tarea:

```text
feat(reminders): add atomic claim with SKIP LOCKED (M3-04)
fix(scheduling): move Sunday reminders to Monday window (M3-03)
docs(adr): record database-backed scheduler decision (M0-06)
test(billing): cover paid invoice never sends (M5-06)
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `build`, `ci`.
Sin secretos en el mensaje ni en el diff. Sin `git push` sin autorización.

## 5. Estilo

- Español en documentación, plantillas y mensajes al usuario final.
- Inglés en código: identificadores, tipos, nombres de archivo, comentarios, commits.
- Archivos en `kebab-case.ts`; tipos y clases en `PascalCase`; el resto en `camelCase`.
- Un export principal por archivo, con `index.ts` como API pública del módulo.
- Comentarios que explican el **porqué**, no el qué. Sin comentarios decorativos.

## 6. Añadir una dependencia

1. ¿Lo resuelve ya Node 24 o PostgreSQL? Si sí, no se añade.
2. Verificar el repositorio oficial y la actividad de mantenimiento.
3. Registrar la entrada completa en `docs/REFERENCES.md`.
4. Si es crítica (runtime, seguridad, persistencia): `OWNER_REQUIRED`.
5. Versión fija para dependencias de runtime.

## 7. Antes de pedir revisión

- [ ] `pnpm check` en verde, con la salida real disponible
- [ ] Pruebas nuevas que fallan sin el cambio
- [ ] Sin `any`, sin `catch {}` vacío, sin `console.log`, sin `.only`/`.skip`
- [ ] Sin secretos, sin datos reales de clientes, sin JIDs reales
- [ ] `domain`/`application` sin imports de infraestructura
- [ ] Documentación y `CHANGELOG.md` al día
- [ ] Criterios de aceptación de la tarea verificados uno a uno
