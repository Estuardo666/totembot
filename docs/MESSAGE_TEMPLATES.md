# docs/MESSAGE_TEMPLATES.md — Plantillas de mensaje

## 1. Reglas

- Español neutro, tono profesional, trato de usted.
- **Sin emojis** en la v1.
- Sin enlaces acortados ni URLs de terceros.
- Sin datos sensibles (montos sí, datos personales no necesarios no).
- Identificación clara del remitente como sistema automático de Totem Mass Media.
- Longitud objetivo < 600 caracteres; límite duro 1000 (error de renderizado si se supera).
- Las plantillas **no** se escriben en los casos de uso: viven en
  `src/modules/messaging/templates/` y se resuelven por `templateId` + versión.

## 2. Contrato de plantilla

```ts
export interface MessageTemplate<V> {
  readonly id: string; // 'recording.reminder_24h'
  readonly version: number; // entero, se incrementa con cada cambio de texto
  readonly schema: ZodType<V>; // variables permitidas y validadas
  render(vars: V): string;
}
```

- Variables **cerradas**: el esquema Zod es `.strict()`. Una variable desconocida o
  faltante es un error de renderizado → recordatorio `FAILED` permanente, nunca un envío
  con `undefined` en el texto.
- Cada valor interpolado pasa por `sanitizeVariable()`: recorta espacios, colapsa saltos de
  línea, elimina caracteres de control, y trunca a la longitud máxima del campo. Esto evita
  que el nombre de un cliente o unas notas alteren la estructura del mensaje.
- **Fallback**: si la versión registrada de una plantilla ya no existe en el código, se usa
  la versión actual y se registra una advertencia con ambas versiones. Nunca se deja de
  enviar por eso.
- `templateId` y `templateVersion` se persisten en `Reminder` y en `MessageAttempt`.

## 3. Catálogo v1

### `recording.reminder_24h` (v1)

Variables: `clientName`, `title`, `dateLabel`, `timeLabel`, `location?`, `notes?`, `confirmToken`.

```text
Totem Mass Media - Recordatorio de grabación

Cliente: {clientName}
Producción: {title}
Fecha: {dateLabel}
Hora: {timeLabel}
{Lugar: {location}}
{Detalles: {notes}}

Le recordamos que la grabación está programada para dentro de 24 horas.
Para confirmar su asistencia, responda a este mensaje con: {confirmToken}

Mensaje automático. Si necesita reprogramar, comuníquelo por este medio.
```

`confirmToken` por defecto: `CONFIRMO`. Las líneas entre llaves se omiten si la variable
opcional no viene.

### `task.client_review_48h` (v1)

Variables: `clientName`, `title`, `enteredReviewLabel`, `reminderNumber`, `maxReminders`.

```text
Totem Mass Media - Material pendiente de revisión

Cliente: {clientName}
Material: {title}
Enviado a revisión: {enteredReviewLabel}

El material sigue pendiente de su revisión y aprobación. Cuando pueda, indíquenos si lo
aprueba o si requiere cambios, para continuar con la producción.

Mensaje automático ({reminderNumber} de {maxReminders}).
```

### `invoice.upcoming_due` (v1)

Variables: `clientName`, `period`, `amountLabel`, `dueDateLabel`, `daysUntilDue`.

```text
Totem Mass Media - Recordatorio de pago

Cliente: {clientName}
Periodo: {period}
Valor: {amountLabel}
Vence: {dueDateLabel} (en {daysUntilDue} días)

Le recordamos su pago mensual próximo a vencer. Si ya realizó el pago, por favor ignore
este mensaje y compártanos el comprobante.

Mensaje automático.
```

### `invoice.due_today` (v1)

Variables: `clientName`, `period`, `amountLabel`, `dueDateLabel`.

```text
Totem Mass Media - Pago con vencimiento hoy

Cliente: {clientName}
Periodo: {period}
Valor: {amountLabel}
Vence: hoy, {dueDateLabel}

Le recordamos que su pago mensual vence el día de hoy. Si ya lo realizó, por favor
compártanos el comprobante.

Mensaje automático.
```

### `invoice.overdue` (v1)

Variables: `clientName`, `period`, `amountLabel`, `dueDateLabel`, `daysOverdue`.

```text
Totem Mass Media - Pago vencido

Cliente: {clientName}
Periodo: {period}
Valor: {amountLabel}
Venció: {dueDateLabel} (hace {daysOverdue} días)

Registramos su pago mensual como pendiente. Si ya lo realizó, por favor compártanos el
comprobante para actualizar nuestro registro.

Mensaje automático.
```

## 4. Formato de valores

| Variable      | Formato                                               | Ejemplo                       |
| ------------- | ----------------------------------------------------- | ----------------------------- |
| `dateLabel`   | `EEEE d 'de' MMMM 'de' yyyy` en `es`, zona de negocio | `martes 12 de agosto de 2026` |
| `timeLabel`   | `HH:mm` 24 h, zona de negocio                         | `09:30`                       |
| `amountLabel` | `USD 1.250,00` desde `amountCents`                    |                               |
| `period`      | `MM/YYYY` legible                                     | `08/2026`                     |

El formateo vive en `src/modules/messaging/formatting.ts` y se prueba con `FixedClock` y
locale fijo, nunca con el locale del sistema.

## 5. Vista previa

```bash
pnpm cli template:preview recording.reminder_24h --sample
pnpm cli template:preview invoice.overdue --reminder-id <uuid>
```

Imprime el texto exacto en la terminal. No envía nada, no requiere sesión de WhatsApp.
Un test de snapshot cubre cada plantilla con datos de ejemplo.

## 6. Versionado

Cualquier cambio de texto incrementa `version`. Las versiones antiguas se conservan en el
código mientras existan `MessageAttempt` que las referencien (mínimo 12 meses, la ventana
de retención). Cambiar variables del esquema exige nueva versión, nunca editar la existente.
