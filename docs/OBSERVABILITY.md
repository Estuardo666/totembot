# docs/OBSERVABILITY.md — Observabilidad

## 1. Logging

Pino, JSON en producción, `pino-pretty` solo en desarrollo. Un logger raíz en
`src/infrastructure/logging/` con hijos por contexto. Nadie usa `console.log`
(regla ESLint `no-console`).

Campos base en todo registro: `time`, `level`, `service` (`server`|`worker`|`cli`), `env`,
`version` (del `package.json`), `pid`, `hostname`.

Campos de contexto cuando aplican: `correlationId`, `reminderId`, `clientId`,
`messageAttemptId`, `reminderType`, `outcome`, `durationMs`, `errorCode`.

`correlationId` (UUID v7) se genera por tick del worker, por petición HTTP y por comando
CLI, y se propaga por el contexto de ejecución (`AsyncLocalStorage`), no como parámetro
manual en cada función.

### Redacción

Configuración de Pino con `redact` sobre las rutas conocidas, **más** un serializador
propio que actúa como red de seguridad:

```ts
redact: {
  paths: ['*.creds', '*.keys', '*.qr', '*.authState', '*.token', '*.password',
          'req.headers.authorization', '*.text', '*.message.conversation'],
  censor: '[REDACTED]',
}
```

Prohibido en logs, sin excepción: credenciales, tokens, QR, contenido de archivos de
sesión, texto completo de mensajes entrantes o salientes, y números de teléfono sin
enmascarar. Los números se enmascaran con `PhoneMasker` (`+593*****789`) y los JID de grupo
se registran truncados (`1203...@g.us`).

Prueba obligatoria (CA-09): un test alimenta el logger con un objeto que contiene un QR
falso, unas credenciales falsas y un número, y verifica que la salida serializada no
contiene ninguno de esos valores.

### Niveles

| Nivel   | Uso                                                                                           |
| ------- | --------------------------------------------------------------------------------------------- |
| `error` | fallo que requiere atención humana: sesión inválida, `FAILED` definitivo, BD caída            |
| `warn`  | reintento programado, `NEEDS_REVIEW`, plantilla con versión obsoleta, desconexión recuperable |
| `info`  | inicio/fin de tick, envío exitoso, cambio de estado de conexión, comando CLI                  |
| `debug` | decisiones de elegibilidad, cálculo de ventanas, SQL de claim                                 |
| `trace` | nunca en producción                                                                           |

`LOG_LEVEL` por defecto: `info` en producción, `debug` en desarrollo.

## 2. Eventos clave

Cada uno con su código estable, para poder buscarlos y contarlos:

| Código                                  | Nivel | Significado                                    |
| --------------------------------------- | ----- | ---------------------------------------------- |
| `WORKER_TICK_START` / `WORKER_TICK_END` | info  | ciclo del worker, con contadores               |
| `REMINDER_CLAIMED`                      | debug | lote reservado                                 |
| `REMINDER_SENT`                         | info  | envío exitoso                                  |
| `REMINDER_SKIPPED`                      | info  | fuera de ventana o pausa                       |
| `REMINDER_CANCELLED`                    | info  | entidad cambió de estado                       |
| `REMINDER_RETRY_SCHEDULED`              | warn  | fallo transitorio                              |
| `REMINDER_FAILED`                       | error | agotó intentos o error permanente              |
| `REMINDER_NEEDS_REVIEW`                 | error | entrega incierta                               |
| `WA_CONNECTION_CHANGED`                 | info  | cambio de estado del socket                    |
| `WA_SESSION_INVALID`                    | error | requiere re-vinculación (`OWNER_REQUIRED`)     |
| `DB_UNAVAILABLE`                        | error | fallo de conexión                              |
| `CONFIG_INVALID`                        | error | validación Zod del entorno fallida al arrancar |

## 3. Endpoints de salud

Fastify, escuchando en `HTTP_HOST` (por defecto `127.0.0.1`, **no** `0.0.0.0`).

### `GET /health` — liveness

Responde `200 {"status":"ok"}` si el proceso está vivo. Sin dependencias externas.
Es lo que consulta PM2 / el supervisor.

### `GET /ready` — readiness

`200` solo si: la configuración es válida, `SELECT 1` contra PostgreSQL responde, y no hay
migraciones pendientes. Si no, `503` con el motivo (sin detalles internos sensibles).

### `GET /status` — diagnóstico interno

Solo accesible desde localhost (o a través de un túnel SSH). Nunca expuesto públicamente.

```json
{
  "service": "totem-reminder-bot",
  "version": "0.1.0",
  "env": "production",
  "timeZone": "America/Guayaquil",
  "whatsapp": {
    "enabled": true,
    "dryRun": false,
    "connection": "open",
    "lastConnectionChangeAt": "2026-08-06T13:02:11.000Z",
    "sessionValid": true
  },
  "worker": {
    "enabled": true,
    "lastTickStartedAt": "2026-08-06T13:58:00.000Z",
    "lastTickDurationMs": 412,
    "lastTickOutcome": "ok"
  },
  "reminders": {
    "pending": 7,
    "dueNow": 1,
    "retryScheduled": 0,
    "needsReview": 0,
    "failedLast24h": 0,
    "sentLast24h": 4
  },
  "errorsLast1h": 0
}
```

`/status` **no** incluye: JIDs completos, nombres de clientes, textos de mensajes, ni nada
del estado de sesión más allá de un booleano.

## 4. Alertas mínimas del MVP

Sin Prometheus ni Grafana (fuera de alcance). Vigilancia manual con apoyo del runbook:

| Condición                                               | Acción                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| `needsReview > 0`                                       | revisar manualmente el grupo y resolver por CLI |
| `sessionValid=false` o `connection='logged_out'`        | re-vincular (`OWNER_REQUIRED`)                  |
| `lastTickStartedAt` con más de 10 minutos de antigüedad | revisar PM2 y logs                              |
| `failedLast24h > 3`                                     | investigar antes de que se acumulen             |
| `/ready` en `503`                                       | revisar PostgreSQL                              |

Post-MVP: un cron que consulte `/status` y notifique al operador (por correo o a un grupo
interno propio, nunca a un grupo de cliente).

## 5. Retención de logs

PM2 con `pm2-logrotate`: rotación diaria, 14 archivos, comprimidos. Los logs viven fuera
del repositorio, con permisos `0640`. Ver `OPERATIONS.md`.
