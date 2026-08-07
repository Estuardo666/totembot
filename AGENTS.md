# AGENTS.md — Reglas para agentes y colaboradores

Este documento es la **fuente canónica de reglas de trabajo** de este repositorio.
Aplica a Codex, Claude Code, cualquier otro agente y a los desarrolladores humanos.
`CLAUDE.md` añade detalles específicos de Claude Code y **no puede contradecir este archivo**.

---

## 1. Jerarquía de documentos

En caso de conflicto, gana el documento de mayor precedencia:

1. `AGENTS.md` (este archivo) — reglas de proceso y seguridad.
2. `SPEC.md` — qué debe hacer el sistema.
3. `ARCHITECTURE.md` + `docs/adr/*` — cómo debe estar construido.
4. `TASKS.md` — qué se construye ahora y en qué orden.
5. `docs/*` — diseño de detalle.
6. `CLAUDE.md`, `CONTRIBUTING.md` — ergonomía de trabajo.

Si detectas una contradicción, **no la resuelvas en silencio**: corrígela en el documento
correspondiente o regístrala en `docs/DECISIONS.md` como pregunta abierta.

## 2. Reglas de arquitectura (no negociables sin ADR)

- Monolito modular. Sin microservicios, sin Kubernetes.
- `src/domain/` y `src/application/` **no** pueden importar: `@whiskeysockets/baileys`,
  `@prisma/client`, `fastify`, `pm2`, `node:fs`, `process.env`, ni ninguna librería de I/O.
- Toda dependencia externa entra por un **puerto** definido en `src/domain/ports/`.
- La dirección de dependencias apunta siempre hacia el dominio.
- Prohibido leer `process.env` fuera de `src/config/`.
- Prohibido `new Date()` fuera de la implementación del puerto `Clock`.
- Prohibida la lógica de negocio dentro de handlers Fastify, comandos CLI o listeners de Baileys.
- Un módulo de `src/modules/` no importa el interior de otro módulo; solo su API pública
  (`index.ts`) o tipos del dominio compartido.
- Sin singletons globales mutables. Inyección de dependencias explícita por constructor o
  factoría; **sin framework de DI**.

## 3. Reglas de código

- TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `any` prohibido; usa `unknown` + validación con Zod en los límites.
- Errores tipados (`Result` o clases de error del dominio); nada de `throw` de strings.
- Prohibido `catch {}` vacío o que silencie el error sin registrarlo ni propagarlo.
- Validación con Zod en todo límite del sistema: env, entradas HTTP, CLI, payloads de Baileys.
- Fechas siempre explícitas: instantes en UTC, presentación y reglas de negocio en
  `America/Guayaquil`. Nunca la zona horaria implícita del servidor.
- Funciones pequeñas y con un solo propósito.
- No añadas una dependencia si la plataforma (Node 24, PostgreSQL) ya resuelve el problema.

## 4. Comandos obligatorios

Antes de dar por terminado cualquier cambio:

```bash
pnpm check
```

`pnpm check` = `format:check` + `lint` + `typecheck` + `test`.
Si un comando aún no existe en el milestone actual, **dilo explícitamente**; no lo simules.

## 5. Archivos que no se modifican sin autorización del propietario

- `AGENTS.md`, `CLAUDE.md`, `SPEC.md`, `SECURITY.md`
- `docs/adr/*` ya aceptados (se **supersede** con un ADR nuevo; no se reescribe)
- `.env` (nunca debe existir en Git), `prisma/migrations/*` ya aplicadas
- `ecosystem.config.cjs` (PM2, producción)
- Workflows de `.github/`

## 6. Política de migraciones

- Toda migración se genera con Prisma y se versiona en `prisma/migrations/`.
- Nunca editar una migración ya aplicada en producción. Crear una nueva.
- Migraciones **destructivas** (drop de tabla/columna, cambio de tipo con pérdida) son
  `OWNER_REQUIRED`: requieren aprobación explícita y respaldo previo verificado.
- Expand → migrate → contract para cambios de esquema en caliente.
- `prisma migrate dev` solo en local. En producción, únicamente `prisma migrate deploy`.

## 7. Política de dependencias

- Añadir una dependencia requiere registrarla en `docs/REFERENCES.md` con: fuente oficial,
  propósito, versión, compatibilidad con Node, riesgos, alternativas y motivo.
- Dependencias críticas nuevas (runtime, seguridad, persistencia) son `OWNER_REQUIRED`.
- Verificar el nombre exacto del paquete y su repositorio oficial antes de instalar
  (riesgo de typosquatting; ver `SECURITY.md`).
- Versiones fijadas (sin `^`) para dependencias de runtime críticas.
- Prohibido Redis y BullMQ en el MVP sin un ADR aprobado que demuestre necesidad.

## 8. Reglas de seguridad

- **Nunca** enviar mensajes reales de WhatsApp durante desarrollo, pruebas o CI.
- `WHATSAPP_ENABLED` por defecto `false`; `WHATSAPP_DRY_RUN` por defecto `true`.
- Nunca registrar en logs: credenciales, tokens, QR, archivos de sesión, contenido completo
  de conversaciones, ni números de teléfono sin enmascarar.
- Nunca commitear secretos. Si ocurre, ver el procedimiento de incidente en `SECURITY.md`.
- Nunca exponer el QR ni el estado de sesión por una API pública.
- No inventar credenciales, IDs de grupo, JIDs ni datos de clientes reales, ni en tests.

## 9. Definición de terminado (DoD)

Una tarea está terminada solo si **todo** lo siguiente es cierto:

1. El código cumple las reglas de arquitectura de la sección 2.
2. Existen pruebas nuevas o actualizadas que fallan sin el cambio.
3. `pnpm check` pasa y su salida real se muestra en el reporte.
4. La documentación afectada (`SPEC.md`, `docs/*`, `CHANGELOG.md`) está actualizada.
5. Los criterios de aceptación de la tarea en `TASKS.md` se cumplen uno por uno.
6. El estado de la tarea en `TASKS.md` está actualizado.
7. No se introdujeron secretos ni se activó ninguna integración real.

## 10. Honestidad técnica

- Prohibido afirmar que algo funciona sin haber ejecutado la verificación.
- Prohibido ocultar un fallo con un mock incompleto, un `skip` o un `expect(true)`.
- Si una prueba se salta, debe decirse explícitamente y por qué.
- Prohibido simular haber realizado una acción `OWNER_REQUIRED`.
- Reportar siempre: comandos ejecutados, salida real, y qué quedó sin hacer.

## 11. Requisitos ambiguos

1. Busca la respuesta en `SPEC.md` y `docs/`.
2. Si sigue ambiguo y las interpretaciones no cambian el resultado, elige la más simple,
   documenta la suposición en el reporte y continúa.
3. Si cambian el resultado de forma material, **detente y pregunta**, y registra la
   pregunta en `SPEC.md` § Preguntas abiertas.
4. Nunca amplíes el alcance por tu cuenta.

## 12. Registro de decisiones

- Decisión estructural o irreversible → nuevo ADR en `docs/adr/NNNN-titulo.md`
  (formato: Contexto, Decisión, Alternativas, Consecuencias, Estado, Fecha).
- Decisión menor → entrada en `docs/DECISIONS.md`.
- Un ADR aceptado nunca se borra; se marca `Superseded by ADR-NNNN`.

## 13. Acciones `OWNER_REQUIRED`

El agente **nunca** las ejecuta ni las simula. Ver la lista completa en
[OPERATIONS.md § Acciones del propietario](OPERATIONS.md#acciones-owner_required).
