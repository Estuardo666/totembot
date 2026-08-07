# docs/REMINDER_ENGINE.md — Motor de recordatorios

## 1. Principios

1. **La base de datos es la fuente de verdad.** No hay estado en memoria entre ticks.
2. **La unicidad la garantiza PostgreSQL**, no una comprobación en Node.
3. **Programar es barato, enviar es caro.** Se programa pronto y se revalida al enviar.
4. **Preferir no duplicar antes que no perder.** Ante duda, `NEEDS_REVIEW` y humano.
5. **El reloj es una dependencia inyectada.** Nada llama a `Date.now()` directamente.

## 2. Claves de idempotencia

Deterministas, legibles, estables ante reintentos, y **distintas** cuando el hecho de
negocio cambia.

```text
recording:{recordingId}:{scheduledAtEpochSeconds}:24h_before
task:{taskId}:client_review:r{round}:n{occurrence}
invoice:{invoiceId}:upcoming_due:d{offsetDays}
invoice:{invoiceId}:due_today
invoice:{invoiceId}:overdue:d{offsetDays}
```

Decisiones:

- La clave de grabación **incluye `scheduledAt`**: al reprogramar, la clave cambia, el
  recordatorio antiguo se cancela y el nuevo se inserta sin colisionar.
- La clave de tarea incluye la **ronda** de `CLIENT_REVIEW` y el número de ocurrencia,
  para permitir un segundo recordatorio y varias rondas de revisión.
- Las claves de factura incluyen el offset en días, no la fecha absoluta: si se corrige la
  `dueDate`, hay que cancelar y reprogramar explícitamente (caso raro, decisión consciente).

Implementación: `IdempotencyKeyFactory` en `src/domain/services/`. Longitud máxima 200
caracteres, solo `[a-z0-9:_-]`. Restricción `UNIQUE` en `reminders.idempotency_key`.

La inserción usa `ON CONFLICT (idempotency_key) DO NOTHING`: reprogramar dos veces el mismo
hecho es un no-op silencioso y esperado, no un error.

## 3. Ciclo del worker

```text
cada WORKER_POLL_INTERVAL_SECONDS:
  0. si globalPaused -> registrar y salir del tick
  1. si gateway.connectionState() !== 'open' y no es dry-run -> registrar y salir del tick
  2. lote = reminderRepo.claimDue(now, lockTimeout, batchSize)   # atómico
  3. por cada recordatorio del lote (secuencial, con pausa entre envíos):
       3.1 decisión = eligibility.evaluate(recordatorio, entidad, cliente, grupo, config, now)
       3.2 CANCEL/SKIP -> persistir motivo, siguiente
           DEFER        -> status=PENDING, scheduled_for=nuevaVentana, siguiente
           SEND         -> continuar
       3.3 abrir intento: INSERT message_attempt(STARTED); UPDATE reminder PROCESSING; COMMIT
       3.4 texto = templates.render(plantilla, variables)      # falla -> FAILED permanente
       3.5 resultado = gateway.sendGroupText(jid, texto)
       3.6 persistir desenlace (SENT / RETRY_SCHEDULED / FAILED)
  4. registrar métricas del tick (procesados, enviados, fallidos, duración)
```

Los envíos son **secuenciales** con una pausa configurable (por defecto 3–8 s aleatorios)
entre mensajes. A este volumen no hay razón para paralelizar y el ritmo humano reduce el
riesgo de restricción de la cuenta.

## 4. Elegibilidad

`EligibilityService.evaluate(...)` devuelve una decisión tipada. Se ejecuta **siempre** en
el momento del envío, con datos releídos dentro de la transacción.

| Comprobación                                                               | Resultado si falla                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pausa global o pausa del cliente                                           | `SKIP(PAUSED)` — se difiere al siguiente tick, no se consume intento |
| Cliente no `ACTIVE`                                                        | `CANCEL(CLIENT_INACTIVE)`                                            |
| Sin grupo primario habilitado y `authorizedAt`                             | `CANCEL(NO_AUTHORIZED_GROUP)`                                        |
| Recordatorio ya `SENT`                                                     | `CANCEL(ALREADY_SENT)`                                               |
| Tarea ya no en `CLIENT_REVIEW`                                             | `CANCEL(SOURCE_STATE_CHANGED)`                                       |
| Ronda de revisión distinta a la de la clave                                | `CANCEL(SOURCE_STATE_CHANGED)`                                       |
| Factura `PAID` o `CANCELLED`                                               | `CANCEL(INVOICE_SETTLED)`                                            |
| Grabación `CANCELLED`, o `scheduledAt` movido                              | `CANCEL(SOURCE_STATE_CHANGED)`                                       |
| Grabación ya ocurrida                                                      | `CANCEL(TOO_LATE)`                                                   |
| Máximo de recordatorios de esa entidad alcanzado                           | `CANCEL(MAX_REMINDERS_REACHED)`                                      |
| Fuera de la ventana horaria                                                | `DEFER(siguienteVentana)`                                            |
| Demasiado tarde respecto a `scheduledFor` (> `staleAfterHours`, def. 12 h) | `CANCEL(STALE)`                                                      |

`SKIP` y `DEFER` no consumen intentos. Solo un fallo del envío consume un intento.

## 5. Reintentos y backoff

Clasificación del error devuelto por `MessagingGateway`:

| Clase           | Ejemplos                                                            | Acción                                                                  |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Transitorio     | socket cerrado, timeout, rate limit, `connection.close` recuperable | reintentar                                                              |
| Permanente      | JID inválido, no es miembro del grupo, plantilla inválida           | `FAILED` inmediato, sin gastar los 3 intentos                           |
| Incierto        | el proceso muere después de `send` sin respuesta                    | `NEEDS_REVIEW`                                                          |
| Sesión inválida | `loggedOut`, credenciales revocadas                                 | `RETRY_SCHEDULED` + alerta `OWNER_REQUIRED`; el worker deja de reclamar |

Backoff exponencial con jitter completo:

```text
base = 60 s
delay(n) = random(0, min(base * 2^(n-1), 3600 s))
next_attempt_at = now + delay(n)
```

Al agotar `maxAttempts` (por defecto 3) → `FAILED`, se registra el último error sanitizado
y se cuenta en el contador de errores recientes de `/status`.

`next_attempt_at` también se ajusta a la ventana horaria: no se reintenta a las 03:00.

## 6. Concurrencia

- Claim atómico con `FOR UPDATE SKIP LOCKED` (SQL en `docs/DATABASE_DESIGN.md` § 4).
- `claimedBy` = `hostname:pid:uuid` del worker, útil para diagnóstico.
- El lock expira a los `REMINDER_LOCK_TIMEOUT_SECONDS` (por defecto 300 s): un worker muerto
  no bloquea nada de forma permanente.
- El diseño tolera N workers. En producción se ejecuta **uno**; la tolerancia existe para
  sobrevivir a un despliegue mal hecho o a un reinicio solapado de PM2.

Prueba obligatoria (CA-01): dos transacciones concurrentes contra el mismo recordatorio
producen exactamente un claim.

## 7. Entrega incierta

El caso duro: **WhatsApp recibe el mensaje pero el proceso muere antes de marcarlo `SENT`.**

No se puede resolver de forma perfecta sin un commit distribuido con WhatsApp, que no
existe. La estrategia es acotar la ventana y hacer visible la duda:

1. El `MessageAttempt` se inserta y **commitea antes** de llamar al gateway. La ventana de
   incertidumbre queda reducida a la duración de la llamada de red.
2. Al recuperar un recordatorio en `PROCESSING` cuyo lock expiró, el worker inspecciona su
   último `MessageAttempt`:
   - `SUCCESS` → el recordatorio se marca `SENT` (se cayó justo después de registrar el éxito).
   - `FAILED` → se aplica la política de reintentos normal.
   - `STARTED` sin desenlace → **`NEEDS_REVIEW`** con `cancellation_reason='UNCERTAIN_DELIVERY'`.
     No se reintenta automáticamente.
3. `NEEDS_REVIEW` aparece en `/status` y en el runbook. El operador mira el grupo en
   WhatsApp y resuelve con la CLI:
   `pnpm cli reminder:resolve <id> --outcome=delivered|not-delivered`.
   `not-delivered` devuelve el recordatorio a `PENDING`. Ambas resoluciones se auditan.
4. Mitigación adicional: si el adaptador obtiene un `providerMessageId`, se persiste de
   inmediato; su presencia es evidencia de entrega.

Esto es una decisión de producto explícita: **un cliente prefiere no recibir un
recordatorio a recibirlo dos veces**, y el volumen (< 15/día) hace que la revisión manual
sea perfectamente asumible.

## 8. Recuperación tras reinicio

No hay estado en memoria que recuperar. Al arrancar, el worker:

1. Registra su identidad y la hora de arranque.
2. En el primer tick recupera lo que tenga el lock expirado (mismo mecanismo de siempre).
3. No hace ninguna limpieza especial: la recuperación es el flujo normal, no un caso aparte.
   Esto evita el clásico código de arranque que solo se ejercita en producción.

## 9. Dry-run

`WHATSAPP_DRY_RUN=true` (por defecto) inserta un `DryRunMessagingGateway` que:

- Ejecuta toda la validación, elegibilidad y renderizado.
- **No** llama a Baileys.
- Registra el intento con `status='SKIPPED_DRY_RUN'` y la longitud del mensaje.
- Marca el recordatorio como `SENT` solo si `DRY_RUN_MARK_SENT=true` (por defecto `false`,
  para poder repetir el ensayo).

## 10. Por qué no BullMQ ni Redis en el MVP

Ver [adr/0003-database-backed-scheduler.md](adr/0003-database-backed-scheduler.md).
Resumen: < 300 mensajes/mes, latencia tolerable en minutos, y PostgreSQL ya ofrece
`SKIP LOCKED`, transacciones y unicidad. Añadir Redis sería un segundo almacén de estado
que puede divergir de la fuente de verdad, un componente más que operar y respaldar, y
otro modo de fallo. El puerto `ReminderQueue` deja la migración abierta sin acoplar el dominio.
