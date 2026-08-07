# Totem WhatsApp Reminder Bot

Bot interno de recordatorios para **Totem Mass Media**. Envía recordatorios operativos
(grabaciones, revisiones de tareas audiovisuales y pagos) a **grupos privados de WhatsApp
ya existentes** de clientes de la agencia.

> **Estado actual: M1 — Esqueleto técnico (en curso).**
> Existe un servidor Fastify mínimo con `/health` y `/ready`, configuración validada,
> logging con redacción y CI. No hay dominio, no hay worker funcional, no hay sesión de
> WhatsApp vinculada. No se ha enviado ningún mensaje. **El bot no funciona todavía.**

---

## 1. Qué es

- Un monolito modular en Node.js + TypeScript.
- Un worker periódico que consulta PostgreSQL y envía recordatorios idempotentes.
- Un adaptador de WhatsApp basado en Baileys, desactivado por defecto.
- Una herramienta interna, para uso interno, sobre grupos que la agencia ya administra.

## 2. Qué NO es

- No es una herramienta de marketing masivo ni de campañas.
- No hace scraping de contactos ni descubrimiento invasivo de grupos.
- No envía mensajes a números o grupos desconocidos.
- No responde automáticamente a todas las conversaciones.
- No usa IA generativa en esta versión.
- No es un producto multi-tenant ni SaaS.
- No incluye panel web en el primer milestone.

## 3. Arquitectura resumida

Monolito modular con dominio aislado de la infraestructura (puertos y adaptadores).

```
Fastify (health)   CLI (admin)        Worker (poll cada N min)
        \               |                    /
         \              |                   /
             Casos de uso (application)
                        |
                  Dominio (puro)
                        |
   Puertos: MessagingGateway, *Repository, Clock, IdGenerator, TransactionManager
                        |
   Adaptadores: Prisma/PostgreSQL, Baileys, FakeMessagingGateway, Pino
```

La base de datos es la **única fuente de verdad**. Cada recordatorio tiene una clave de
idempotencia con restricción `UNIQUE`, y el worker lo reserva con un _claim_ atómico antes
de enviarlo. Ver [ARCHITECTURE.md](ARCHITECTURE.md) y [docs/REMINDER_ENGINE.md](docs/REMINDER_ENGINE.md).

## 4. Requisitos

| Requisito  | Versión objetivo       | Notas                                                                |
| ---------- | ---------------------- | -------------------------------------------------------------------- |
| Node.js    | **24.x LTS** (Krypton) | mínimo soportado 22.13; ver [docs/REFERENCES.md](docs/REFERENCES.md) |
| pnpm       | 11.x                   | administrador de paquetes obligatorio                                |
| PostgreSQL | 17.x                   | local vía Docker Compose                                             |
| Docker     | cualquiera reciente    | solo para PostgreSQL de desarrollo                                   |
| Git        | 2.4x                   |                                                                      |

## 5. Desarrollo local

```bash
corepack enable && corepack prepare pnpm@11.20.0 --activate
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm dev
```

`pnpm check` ejecuta formato, lint, typecheck, pruebas unitarias y build; es el comando
obligatorio antes de dar por terminado cualquier cambio.

`WHATSAPP_ENABLED=false` y `WHATSAPP_DRY_RUN=true` son los valores por defecto y deben
permanecer así en desarrollo.

## 6. Seguridad

- La sesión de Baileys (`WHATSAPP_AUTH_DIRECTORY`) es equivalente a una credencial de
  acceso total a la cuenta de WhatsApp. Nunca entra en Git ni en logs.
- No se registran QR, tokens, credenciales ni contenido de conversaciones.
- La vinculación de la cuenta es una acción manual y local del propietario.
- Ver [SECURITY.md](SECURITY.md).

## 7. Comandos previstos

Ver la tabla completa en [CONTRIBUTING.md](CONTRIBUTING.md#comandos). Resumen:
`pnpm dev`, `pnpm dev:worker`, `pnpm build`, `pnpm start`, `pnpm start:worker`,
`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:unit`,
`pnpm test:integration`, `pnpm test:coverage`, `pnpm db:generate`, `pnpm db:migrate`,
`pnpm db:deploy`, `pnpm db:studio`, `pnpm check`.

## 8. Ruta hacia producción

`M0` documentación → `M1` esqueleto → `M2` dominio y persistencia → `M3` motor de
recordatorios (dry-run) → `M4` adaptador Baileys → `M5` casos de uso → `M6` operación en
Hostinger (PM2) → `M7` piloto controlado con un grupo de prueba.
Ver [TASKS.md](TASKS.md) y [DEPLOYMENT.md](DEPLOYMENT.md).

## 9. Riesgo de integración no oficial

**Baileys no es una API oficial de Meta/WhatsApp.** Es una reimplementación de terceros del
protocolo de WhatsApp Web. Implica riesgo real de:

- Desconexiones y necesidad de re-vinculación.
- Cambios incompatibles del protocolo sin previo aviso.
- Limitaciones, bloqueos temporales o **baneo definitivo del número** utilizado.
- Ausencia de soporte y de garantías de disponibilidad.

Mitigación adoptada: número secundario dedicado para el piloto, volumen bajo, solo grupos
propios, horario comercial, sin mensajería masiva. La alternativa oficial (WhatsApp Cloud
API) queda documentada como plan B en [docs/adr/0004-baileys-adapter-boundary.md](docs/adr/0004-baileys-adapter-boundary.md).

## 10. Documentación

| Documento                          | Contenido                                     |
| ---------------------------------- | --------------------------------------------- |
| [AGENTS.md](AGENTS.md)             | Reglas canónicas para agentes de IA y humanos |
| [CLAUDE.md](CLAUDE.md)             | Instrucciones específicas para Claude Code    |
| [SPEC.md](SPEC.md)                 | Requisitos y criterios de aceptación          |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura y flujos                         |
| [TASKS.md](TASKS.md)               | Backlog ejecutable por milestones             |
| [SECURITY.md](SECURITY.md)         | Seguridad y respuesta a incidentes            |
| [TESTING.md](TESTING.md)           | Estrategia de pruebas                         |
| [DEPLOYMENT.md](DEPLOYMENT.md)     | Despliegue en Hostinger con PM2               |
| [OPERATIONS.md](OPERATIONS.md)     | Runbook operativo                             |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Flujo de trabajo y comandos                   |
| [docs/](docs/)                     | Diseño detallado, ADRs y referencias          |
