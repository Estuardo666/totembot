# CLI administrativa

Todos los comandos se ejecutan localmente contra la base configurada en `DATABASE_URL`.
Las entradas se validan con Zod y las salidas de los comandos administrativos son JSON,
salvo `template:preview`, que imprime el texto renderizado.

## Clientes y grupos

```bash
pnpm cli client:create --name "Cliente ficticio" [--status ACTIVE|PAUSED|ARCHIVED] [--time-zone America/Guayaquil]
pnpm cli client:list [--status ACTIVE|PAUSED|ARCHIVED]
pnpm cli group:add <client-uuid> --jid <id>@g.us --label "Grupo interno" [--primary] [--enabled]
pnpm cli group:authorize <group-uuid> --authorized-at 2026-08-07T13:00:00.000Z
```

`group:add` siempre crea el grupo con `authorizedAt=null`. La autorización es una acción
manual del propietario: `group:authorize` exige un instante ISO-8601 explícito y no consulta
WhatsApp ni descubre grupos.

## Operación

```bash
pnpm cli automation:pause --global
pnpm cli automation:resume --client <client-uuid>
pnpm cli reminder:show <reminder-uuid>
pnpm cli reminder:resolve <reminder-uuid> --outcome delivered|not-delivered
```

La pausa acepta exactamente uno de `--global` o `--client`. La resolución solo permite
recordatorios en `NEEDS_REVIEW`; `delivered` marca `SENT` y `not-delivered` devuelve a
`PENDING`. Ambas acciones quedan auditadas.

## Grabaciones, tareas e invoices

```bash
pnpm cli recording:create <client-uuid> --title "Grabación" --scheduled-at 2026-08-10T13:00:00.000Z [--location "Estudio"] [--notes "Indicaciones"]
pnpm cli recording:reschedule <recording-uuid> --scheduled-at 2026-08-11T13:00:00.000Z
pnpm cli recording:cancel <recording-uuid>
pnpm cli task:status <task-uuid> --status DRAFT|EDITING|CLIENT_REVIEW|CHANGES_REQUESTED|APPROVED|PUBLISHED|CANCELLED
pnpm cli invoice:create <client-uuid> --period 2026-08 --amount-cents 15000 --due-date 2026-08-10
pnpm cli invoice:pay <invoice-uuid>
```

Las fechas de grabación requieren un instante ISO-8601 con zona explícita; las fechas de
factura usan `YYYY-MM-DD` y se interpretan a medianoche UTC. Los casos de uso existentes
siguen resolviendo la programación, reprogramación, cancelación y transición de estados.
Cada operación exitosa queda auditada.

## Retención (M6-08)

```bash
pnpm cli retention:purge
```

Borra `MessageAttempt` y `AuditEvent` anteriores a la ventana de retención (PRI-04:
12 meses, configurable con `RETENTION_MONTHS`). El corte es estricto: una fila con la marca
de tiempo exacta del corte se conserva. La purga es idempotente y solo escribe un evento de
auditoría `RETENTION_PURGED` si borró algo.

El worker ejecuta la misma purga automáticamente en su propio bucle lento
(`RETENTION_PURGE_INTERVAL_HOURS`, por defecto 24 h), separado del tick de envíos, así que
este comando solo hace falta para forzar una pasada manual.

## Datos ficticios

```bash
pnpm db:seed
```

El seed es idempotente, usa identificadores y un JID ficticios, deja el grupo deshabilitado
y no autoriza ningún envío.
