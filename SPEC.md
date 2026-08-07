# SPEC.md — Especificación del sistema

Versión: 0.1.0 · Estado: borrador aprobado para M0 · Fecha: 2026-08-06

---

## 1. Alcance

Sistema interno que envía tres tipos de recordatorios a grupos privados de WhatsApp de
clientes de Totem Mass Media, con la base de datos como fuente de verdad y garantía de
no duplicación.

Volumen esperado: ~20 grupos, 3–4 personas por grupo, ~70 tareas audiovisuales/mes,
~20 facturas/mes. Estimación de envíos: **< 300 mensajes/mes** (< 15/día pico).

---

## 2. Requisitos funcionales

### RF-01 Gestión de clientes y grupos

- RF-01.1 Registrar clientes con nombre, estado (`ACTIVE`/`PAUSED`/`ARCHIVED`) y zona horaria opcional.
- RF-01.2 Asociar a cada cliente **uno o más** grupos de WhatsApp identificados por su JID.
- RF-01.3 Marcar un grupo como habilitado/deshabilitado para envíos.
- RF-01.4 Exactamente un grupo por cliente marcado como `isPrimary` para recordatorios.
- RF-01.5 El alta de clientes y grupos se hace por CLI administrativa; no hay descubrimiento automático.

### RF-02 Recordatorio de grabación

- RF-02.1 Una grabación tiene cliente, título, `scheduledAt`, ubicación opcional, notas, estado.
- RF-02.2 Al crear/reprogramar una grabación se programa un recordatorio para
  `scheduledAt - 24 h`, ajustado a la ventana horaria permitida.
- RF-02.3 El mensaje incluye: nombre del cliente, fecha, hora (`America/Guayaquil`),
  información relevante y solicitud de confirmación.
- RF-02.4 La confirmación en el MVP es una respuesta de texto con una palabra/número
  definido; el bot **no** usa botones interactivos no oficiales.
- RF-02.5 Si la grabación se cancela o reprograma, el recordatorio pendiente se cancela
  (`CANCELLED`) y, si aplica, se programa uno nuevo con nueva clave de idempotencia.
- RF-02.6 Si `scheduledAt - 24 h` ya pasó al crear la grabación, no se programa recordatorio
  retroactivo; se registra `SKIPPED` con motivo `TOO_LATE`.

### RF-03 Recordatorio de revisión de tarea

- RF-03.1 Estados de tarea: `DRAFT`, `EDITING`, `CLIENT_REVIEW`, `CHANGES_REQUESTED`,
  `APPROVED`, `PUBLISHED`, `CANCELLED`.
- RF-03.2 Al entrar en `CLIENT_REVIEW` se registra `clientReviewEnteredAt` y se programa un
  recordatorio a las 48 h.
- RF-03.3 Recordatorios posteriores configurables (`AutomationSetting`), por defecto
  **máximo 2** recordatorios por tarea, separados 48 h. MVP evita repetición.
- RF-03.4 Antes de enviar, revalidar **en el momento del envío y dentro de la transacción**:
  tarea sigue en `CLIENT_REVIEW`; cliente `ACTIVE`; grupo habilitado; ese recordatorio no
  fue enviado; no se superó el máximo; no hay pausa manual; hora dentro de la ventana.
  Si falla cualquiera → `CANCELLED` o `SKIPPED` con motivo, sin enviar.
- RF-03.5 Al salir de `CLIENT_REVIEW`, todos los recordatorios pendientes de esa tarea pasan a `CANCELLED`.

### RF-04 Recordatorio de pago

- RF-04.1 Una factura tiene cliente, periodo, valor, moneda, `dueDate`, estado, `paidAt`, contador de recordatorios.
- RF-04.2 Estados: `PENDING`, `PAID`, `OVERDUE`, `CANCELLED`.
- RF-04.3 Recordatorios: `invoice.upcoming_due` (3 días antes), `invoice.due_today` (día de
  vencimiento), `invoice.overdue` (3 y 7 días después). Offsets configurables.
- RF-04.4 **Nunca** enviar si el estado es `PAID` o `CANCELLED`. Verificación transaccional obligatoria.
- RF-04.5 Máximo por defecto: 4 recordatorios por factura.

### RF-05 Motor de recordatorios

- RF-05.1 Worker que se ejecuta cada `WORKER_POLL_INTERVAL_SECONDS` (por defecto 120 s).
- RF-05.2 Selecciona recordatorios `PENDING`/`RETRY_SCHEDULED` con `scheduledFor <= now`.
- RF-05.3 Claim atómico (`UPDATE ... WHERE status='PENDING' RETURNING`) para evitar doble envío entre procesos.
- RF-05.4 Clave de idempotencia determinista con restricción `UNIQUE` en la BD.
- RF-05.5 Reintentos limitados (`maxAttempts`, por defecto 3) con backoff exponencial + jitter.
- RF-05.6 Cada intento se registra en `MessageAttempt` con resultado y error sanitizado.
- RF-05.7 Recordatorios `CLAIMED`/`PROCESSING` con lock expirado (`REMINDER_LOCK_TIMEOUT_SECONDS`) se recuperan tras un reinicio.
- RF-05.8 Modo `dry-run`: se ejecuta todo el flujo, se renderiza el mensaje y se registra el intento, **sin** enviar.
- RF-05.9 Estados canónicos de `Reminder` (lista única para todo el proyecto):
  `PENDING`, `CLAIMED`, `PROCESSING`, `SENT`, `RETRY_SCHEDULED`, `CANCELLED`, `FAILED`,
  `SKIPPED`, `NEEDS_REVIEW`. El último se añade a los estados sugeridos originalmente para
  cubrir la entrega incierta; ver [docs/REMINDER_ENGINE.md § 7](docs/REMINDER_ENGINE.md).

### RF-06 Mensajería

- RF-06.1 Plantillas versionadas, en español, tono profesional, sin emojis en la v1.
- RF-06.2 Variables validadas con Zod por plantilla; variables desconocidas = error, no se envía.
- RF-06.3 Se registra la versión de plantilla usada en cada `MessageAttempt`.
- RF-06.4 Comando de vista previa (`pnpm cli template:preview`) sin enviar nada.
- RF-06.5 Datos interpolados se sanitizan (sin saltos de línea de control, longitud máxima).

### RF-07 Observabilidad

- RF-07.1 Logs estructurados JSON con `correlationId`, `reminderId`, `clientId`,
  `messageAttemptId`, tipo, resultado, duración y código de error interno.
- RF-07.2 `GET /health` (liveness) y `GET /ready` (readiness: BD accesible, migraciones al día).
- RF-07.3 `GET /status` interno: estado de conexión con WhatsApp, última ejecución del
  worker, recordatorios pendientes, errores recientes.

### RF-08 Administración

- RF-08.1 CLI local para: vincular WhatsApp, ver estado de sesión, cerrar sesión, listar
  grupos autorizados, pausar/reanudar automatización global o por cliente, previsualizar
  plantillas, forzar re-evaluación de programación.
- RF-08.2 Pausa manual global (`AutomationSetting.globalPaused`) que bloquea todo envío.

---

## 3. Requisitos no funcionales

- **RNF-01 Rendimiento**: irrelevante a este volumen. Objetivo: un ciclo del worker con
  100 recordatorios pendientes < 5 s excluyendo la latencia de WhatsApp.
- **RNF-02 Fiabilidad**: cero duplicados observables. Pérdida aceptable: ninguna;
  el worker recupera tras reinicio. RTO < 30 min, RPO < 24 h (respaldo diario).
- **RNF-03 Disponibilidad**: horario comercial. No es un sistema 24/7 crítico.
- **RNF-04 Mantenibilidad**: cobertura ≥ 85 % en `src/domain` y `src/application`.
- **RNF-05 Portabilidad**: la sustitución de Baileys por otro `MessagingGateway` no debe
  requerir cambios en `domain` ni `application`.
- **RNF-06 Operación**: proceso persistente con PM2, reinicio automático, logs rotados.

## 4. Seguridad

- SEC-01 Ningún secreto en Git. `.env` ignorado; `.env.example` sin valores.
- SEC-02 `WHATSAPP_AUTH_DIRECTORY` fuera del repositorio, permisos `0700`, archivos `0600`.
- SEC-03 QR nunca expuesto por HTTP ni escrito en logs; solo en TTY local durante la vinculación.
- SEC-04 Vinculación solo mediante comando administrativo ejecutado localmente por el propietario.
- SEC-05 Logs sanitizados: sin credenciales, tokens, QR, ni contenido de mensajes entrantes.
- SEC-06 Números de teléfono enmascarados en logs (`+593*****789`).
- SEC-07 Dependencias verificadas contra su repositorio oficial; sin forks.
- SEC-08 Integración real desactivada por defecto y protegida por doble bandera.
- SEC-09 Procedimiento de incidente documentado en `SECURITY.md`.

## 5. Privacidad

- PRI-01 Solo se almacenan: datos operativos de clientes, JIDs de grupos, metadatos de envío.
- PRI-02 **No** se almacena el contenido de conversaciones entrantes.
- PRI-03 Del mensaje enviado se guarda la plantilla y las variables, no un histórico de chat.
- PRI-04 Retención: `MessageAttempt` y `AuditEvent` 12 meses; luego purga.
- PRI-05 Los grupos son de clientes existentes con relación comercial vigente.

## 6. Criterios de aceptación del MVP

| #     | Criterio                                                                           | Verificación                                              |
| ----- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CA-01 | Dos workers concurrentes sobre el mismo recordatorio producen **un** envío         | Test de integración con claims concurrentes               |
| CA-02 | Insertar dos recordatorios con la misma clave de idempotencia falla                | Test de integración sobre la restricción `UNIQUE`         |
| CA-03 | Una factura `PAID` nunca genera envío                                              | Test unitario + integración                               |
| CA-04 | Una tarea que sale de `CLIENT_REVIEW` cancela sus recordatorios pendientes         | Test unitario                                             |
| CA-05 | Un recordatorio que vence a las 22:00 se mueve a las 08:00 del siguiente día hábil | Test unitario de ventana horaria                          |
| CA-06 | Ningún mensaje real se envía en CI                                                 | `WHATSAPP_ENABLED=false` forzado + `FakeMessagingGateway` |
| CA-07 | Tras matar el worker durante un envío, el recordatorio se recupera sin duplicar    | Test de integración de lock expirado                      |
| CA-08 | `pnpm check` pasa en limpio                                                        | CI GitHub Actions                                         |
| CA-09 | Ningún log contiene credenciales, QR ni números sin enmascarar                     | Test de redacción del logger                              |
| CA-10 | Un dry-run completo produce los mensajes esperados sin conexión a WhatsApp         | Test e2e con Fake gateway                                 |

## 7. Fuera de alcance (v1)

Panel web · IA generativa · campañas de marketing · envíos a números individuales
desconocidos · multi-tenant · adjuntos multimedia · encuestas/botones interactivos ·
integración con calendarios externos · facturación electrónica (SRI) · métricas
Prometheus/Grafana · Redis/BullMQ · alta disponibilidad · i18n.

## 8. Suposiciones

- S-01 La agencia ya es miembro de los ~20 grupos; no hay que unirse a ninguno.
- S-02 Se usará un **número secundario** dedicado, no el número principal de la agencia.
- S-03 Los datos (grabaciones, tareas, facturas) se cargan mediante CLI/seed en el MVP;
  no hay integración con una herramienta externa de gestión.
- S-04 Un solo proceso worker en producción; el diseño soporta varios de todos modos.
- S-05 Hostinger provee un VPS con Node y PostgreSQL administrables (no hosting compartido).
- S-06 Moneda USD (Ecuador).

## 9. Preguntas abiertas

| ID   | Pregunta                                                                                                                  | Bloquea       | Responsable                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| Q-01 | ¿De dónde vendrán los datos de grabaciones/tareas/facturas a medio plazo (CLI, panel, integración)?                       | M5 alcance    | Propietario                  |
| Q-02 | ¿Se procesarán las respuestas de confirmación del cliente (leer mensajes entrantes) o solo se pedirá confirmación humana? | M5 (RF-02.4)  | Propietario                  |
| Q-03 | ¿Menciona el bot a personas concretas (`@`) dentro del grupo?                                                             | M5 plantillas | Propietario                  |
| Q-04 | ¿Qué número secundario y qué grupo de prueba se usarán en el piloto?                                                      | M7            | Propietario `OWNER_REQUIRED` |
| Q-05 | ¿Hay clientes con horarios/ventanas distintas desde el inicio?                                                            | M3            | Propietario                  |
| Q-06 | ¿Existe un plan de contingencia si el número es restringido por WhatsApp?                                                 | M7            | Propietario                  |
| Q-07 | ¿Se migrará a WhatsApp Cloud API oficial si el piloto muestra inestabilidad?                                              | Post-MVP      | Propietario                  |

Q-02 es la más relevante: leer mensajes entrantes cambia el perfil de privacidad del
sistema (PRI-02). Por defecto el MVP **no** procesa entrantes.
