# OPERATIONS.md — Runbook operativo

## Acciones `OWNER_REQUIRED`

Lista canónica. Un agente **nunca** las ejecuta ni afirma haberlas ejecutado.

1. Escanear el QR de WhatsApp.
2. Vincular o desvincular la cuenta de WhatsApp.
3. Seleccionar el número que usará el bot.
4. Proporcionar o usar credenciales de Hostinger (SSH, panel).
5. Crear la base de datos de producción.
6. Configurar las variables de entorno de producción.
7. Autorizar el primer grupo de prueba (`authorizedAt`).
8. Autorizar cualquier envío de mensaje real.
9. Ejecutar migraciones destructivas.
10. Aprobar cambios de alcance.
11. Aprobar nuevas dependencias críticas.
12. Aprobar cualquier despliegue.
13. Autorizar la incorporación de cada cliente real.
14. Activar `WHATSAPP_ENABLED=true` o `WHATSAPP_DRY_RUN=false`.
15. Resolver un recordatorio en `NEEDS_REVIEW`.

---

## 1. Comprobación diaria (2 minutos)

```bash
curl -s localhost:3000/status | jq
pm2 status
```

Señales de alarma: `needsReview > 0`, `whatsapp.connection != "open"`,
`worker.lastTickStartedAt` con más de 10 minutos, `errorsLast1h > 0`, `failedLast24h > 3`.

## 2. Escenarios

### El worker no envía nada

1. `pm2 status` — ¿el proceso está arriba?
2. `curl localhost:3000/status` — ¿`worker.enabled`? ¿`globalPaused`?
3. ¿`whatsapp.connection === "open"`?
4. ¿Hay recordatorios `dueNow`? Si `pending > 0` pero `dueNow = 0`, no hay nada vencido:
   comportamiento correcto.
5. ¿Es fuera de la ventana horaria o domingo? Comportamiento correcto.
6. `pm2 logs totem-worker --lines 100 | grep WORKER_TICK`.

### WhatsApp desconectado

1. Estado `closed` → suele reconectar solo; esperar dos ciclos.
2. Estado `logged_out` → sesión inválida: re-vinculación `OWNER_REQUIRED`
   (`SECURITY.md` § 2). Detener el worker antes.
3. No borrar `wa-auth/` como reflejo: se pierde la sesión sin necesidad.

### Recordatorio en `NEEDS_REVIEW` (entrega incierta)

```bash
pnpm cli reminder:show <id>
```

1. Abrir el grupo en WhatsApp y comprobar si el mensaje llegó.
2. Resolver:
   ```bash
   pnpm cli reminder:resolve <id> --outcome=delivered      # marca SENT
   pnpm cli reminder:resolve <id> --outcome=not-delivered  # vuelve a PENDING
   ```
3. Queda auditado. Si el caso se repite, investigar la estabilidad del proceso.

### Mensaje erróneo enviado

1. `pnpm cli automation:pause --global` — **primero cortar**.
2. Aclarar manualmente en el grupo (lo hace una persona, no el bot).
3. Diagnosticar por `correlationId` en los logs.
4. Prueba de regresión, arreglo, despliegue.
5. `pnpm cli automation:resume --global`.

### Base de datos caída

`/ready` en `503`. Revisar `systemctl status postgresql` y el espacio en disco.
El worker no pierde trabajo: todo está en la base y se recupera al volver.

### Cliente pide dejar de recibir recordatorios

```bash
pnpm cli client:pause <clientId>          # o
pnpm cli group:disable <groupId>
```

Los recordatorios pendientes se cancelan en el siguiente tick con motivo `CLIENT_INACTIVE`.

### Acumulación tras una caída larga

Los recordatorios con más de `staleAfterHours` (12 h) de retraso se cancelan solos con
motivo `STALE`, salvo los de factura vencida. Revisar el recuento antes de reanudar y, si
el volumen es alto, reanudar en dry-run primero.

## 3. Tareas periódicas

| Frecuencia | Tarea                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Diaria     | revisar `/status`; verificar que el respaldo del día existe                    |
| Semanal    | revisar `failedLast24h`, `pm2 conf` y los recordatorios `CANCELLED` por motivo |
| Mensual    | `pnpm audit`; revisar actualizaciones de Baileys; purga de retención           |
| Trimestral | **restaurar un respaldo en una base desechable** y verificarlo                 |
| Semestral  | rotar la contraseña de PostgreSQL                                              |

## 4. Piloto controlado (M7)

Precondiciones: M0–M6 terminados, dry-run en producción exitoso, número secundario
seleccionado, un grupo de prueba creado por el propietario con solo personal de la agencia.

1. Alta del cliente de prueba y su grupo; `authorizedAt` fijado manualmente.
2. `WHATSAPP_ENABLED=true`, `WHATSAPP_DRY_RUN=true`. Verificar los mensajes renderizados.
3. `WHATSAPP_DRY_RUN=false`. Un solo recordatorio de grabación.
4. Verificar: texto correcto, hora correcta, sin duplicados, logs limpios y sin datos sensibles.
5. Repetir con un recordatorio de revisión y uno de pago.
6. Una semana de observación sin incidentes.
7. Recién entonces, incorporar clientes reales **de uno en uno**, con autorización por cliente.

Criterio de aborto: cualquier duplicado, cualquier mensaje a un grupo no autorizado, o
cualquier señal de restricción de la cuenta → detener todo y revisar.

## 5. Contactos

| Rol                      | Responsable                             |
| ------------------------ | --------------------------------------- |
| Propietario del producto | Totem Mass Media (pendiente de nombrar) |
| Responsable técnico      | pendiente de nombrar                    |
| Acceso a Hostinger       | propietario, exclusivamente             |
