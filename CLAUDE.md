# CLAUDE.md — Instrucciones para Claude Code

`AGENTS.md` es la fuente canónica. Este archivo **añade** flujo de trabajo específico para
Claude Code y no lo contradice. Ante duda, gana `AGENTS.md`.

---

## 1. Contexto del producto

Bot interno de recordatorios de WhatsApp para Totem Mass Media (agencia de marketing).
~20 grupos de clientes, ~70 tareas audiovisuales al mes. Tres recordatorios en el MVP:
grabación (24 h antes), revisión de tarea (48 h en `CLIENT_REVIEW`) y pagos.
Zona horaria de negocio: `America/Guayaquil`.

Lectura obligatoria antes de editar código: `AGENTS.md`, `SPEC.md`, `ARCHITECTURE.md`,
`TASKS.md` (la tarea concreta) y el `docs/*.md` del área que tocas.

## 2. Flujo de trabajo por tarea

1. Lee la tarea en `TASKS.md`. Si no existe una tarea, créala antes de codificar.
2. Verifica que sus **dependencias** estén en estado `DONE`.
3. Planifica: enumera los archivos que vas a crear o modificar y por qué. Si son más de
   ~8 archivos, la tarea es demasiado grande: divídela en `TASKS.md`.
4. Escribe primero la prueba que falla (dominio y motor de recordatorios: TDD obligatorio).
5. Implementa el cambio mínimo.
6. Ejecuta `pnpm check`.
7. Actualiza documentación, `CHANGELOG.md` y el estado en `TASKS.md`.
8. Reporta (sección 5).

Una tarea = un tema. No mezcles refactor con funcionalidad.

## 3. Archivos de referencia rápida

| Necesitas…                       | Lee                                               |
| -------------------------------- | ------------------------------------------------- |
| Qué debe hacer el sistema        | `SPEC.md`                                         |
| Límites de módulos y puertos     | `ARCHITECTURE.md`                                 |
| Entidades y relaciones           | `docs/DOMAIN_MODEL.md`, `docs/DATABASE_DESIGN.md` |
| Claims, idempotencia, reintentos | `docs/REMINDER_ENGINE.md`                         |
| Baileys y sesión                 | `docs/WHATSAPP_INTEGRATION.md`, `SECURITY.md`     |
| Plantillas de mensaje            | `docs/MESSAGE_TEMPLATES.md`                       |
| Fechas y ventanas horarias       | `docs/TIME_AND_SCHEDULING.md`                     |
| Logs, health, métricas           | `docs/OBSERVABILITY.md`                           |
| Pruebas                          | `TESTING.md`                                      |
| Versiones y fuentes oficiales    | `docs/REFERENCES.md`                              |

## 4. Verificación

Nunca declares un cambio correcto sin ejecutar:

```bash
pnpm check
```

Para trabajo puntual: `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`
(requiere PostgreSQL de pruebas levantado con Docker Compose).

Si un comando falla y no puedes arreglarlo, **repórtalo con la salida literal**; no lo
comentes, no lo saltes, no lo marques como `skip`.

## 5. Formato de reporte

Al terminar, entrega siempre:

- Archivos creados/modificados (rutas).
- Comandos ejecutados y su resultado real (pegado, no parafraseado).
- Criterios de aceptación cumplidos, uno por uno.
- Qué **no** se implementó y por qué.
- Suposiciones tomadas.
- Riesgos detectados y acciones `OWNER_REQUIRED` pendientes.

## 6. Requiere presencia del propietario

No las ejecutes ni digas que las hiciste. Detente y pídelas:
escanear QR, vincular/desvincular WhatsApp, elegir el número, credenciales de Hostinger,
crear la BD de producción, variables de producción, autorizar el grupo de prueba,
autorizar cualquier mensaje real, migraciones destructivas, cambios de alcance, nuevas
dependencias críticas, despliegue, incorporación de clientes reales.
Lista canónica: `OPERATIONS.md § Acciones OWNER_REQUIRED`.

## 7. Nunca de forma autónoma

- Poner `WHATSAPP_ENABLED=true` o `WHATSAPP_DRY_RUN=false`.
- Ejecutar código que abra un socket real de Baileys.
- Crear, leer o mover archivos de `WHATSAPP_AUTH_DIRECTORY`.
- Escribir secretos en el repositorio o imprimirlos.
- `git push`, crear remotos, abrir PRs o desplegar.
- Instalar skills, plugins o servidores MCP.
- Añadir Redis, BullMQ, un ORM adicional o un framework de DI.
- Modificar un ADR aceptado o los archivos listados en `AGENTS.md` § 5.

## 8. Estilo

Español en documentación, mensajes de usuario y plantillas. Inglés en código
(identificadores, tipos, nombres de archivo). Commits convencionales en inglés.
