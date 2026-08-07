# ADR-0005 — Recordatorios idempotentes: clave determinista, claim atómico y modelado del origen

- **Estado:** Aceptado
- **Fecha:** 2026-08-06

## Contexto

Un recordatorio duplicado enviado al grupo de un cliente es el peor fallo posible del
sistema en términos reputacionales. Puede producirse por: reprogramación repetida del mismo
hecho, dos workers activos a la vez, un reintento tras un fallo parcial, o un reinicio en
mitad de un envío. Además, un recordatorio puede originarse en tres entidades distintas
(`Recording`, `Task`, `Invoice`), y esa relación debe mantener integridad referencial.

## Decisión

### 1. Clave de idempotencia determinista con `UNIQUE`

Cada recordatorio deriva su clave del hecho de negocio que lo origina:

```text
recording:{recordingId}:{scheduledAtEpochSeconds}:24h_before
task:{taskId}:client_review:r{round}:n{occurrence}
invoice:{invoiceId}:{upcoming_due|due_today|overdue}[:d{offsetDays}]
```

Restricción `UNIQUE` en `reminders.idempotency_key`. La inserción usa
`ON CONFLICT DO NOTHING`: reprogramar el mismo hecho dos veces es un no-op esperado.
**La garantía la da PostgreSQL, no una comprobación previa en Node**, que sería una
condición de carrera con dos procesos.

La clave incluye el instante programado (grabaciones) y la ronda de revisión (tareas), de
modo que un cambio real del hecho de negocio produce una clave nueva de forma natural.

### 2. Claim atómico

```sql
UPDATE reminders SET status='CLAIMED', claimed_at=$1, claimed_by=$2
WHERE id IN (SELECT id FROM reminders WHERE ... FOR UPDATE SKIP LOCKED LIMIT $3)
RETURNING *;
```

`SKIP LOCKED` permite N workers sin contención ni doble reserva. El lock expira a los
`REMINDER_LOCK_TIMEOUT_SECONDS`, de modo que un proceso muerto no bloquea nada.

### 3. Revalidación en el momento del envío

La elegibilidad se evalúa al enviar, con datos releídos dentro de la transacción, no al
programar. Programar es barato y optimista; enviar es el punto de decisión.

### 4. Modelado del origen: columnas opcionales con `CHECK`

`Reminder` tiene `recordingId`, `taskId` e `invoiceId` nulables, con una restricción que
obliga a que **exactamente una** sea no nula, más otra que exige coherencia entre el tipo
de recordatorio y el origen.

| Opción                                  | Integridad                       | Consulta del worker         | Extensibilidad | Complejidad |
| --------------------------------------- | -------------------------------- | --------------------------- | -------------- | ----------- |
| Polimórfica (`sourceType` + `sourceId`) | ninguna: sin FK, sin `ON DELETE` | buena                       | alta           | baja        |
| **Columnas opcionales + `CHECK`**       | **FKs reales**                   | **una sola tabla**          | media          | baja        |
| Tabla por tipo                          | buena                            | `UNION` en la ruta caliente | baja           | alta        |
| Event sourcing                          | buena                            | compleja                    | alta           | muy alta    |

Elegida la segunda. Con tres orígenes y previsión de uno o dos más, las claves foráneas
reales y el borrado en cascada correcto valen más que la extensibilidad teórica de la
opción polimórfica. Añadir un cuarto origen cuesta una columna y una migración; perder la
integridad referencial cuesta datos huérfanos silenciosos.

### 5. Entrega incierta

Si el proceso muere entre la llamada a WhatsApp y el `UPDATE status='SENT'`, no hay forma
de saber si el mensaje llegó. Se acota la ventana (el `MessageAttempt` se commitea **antes**
de llamar al gateway) y se hace visible la duda con el estado `NEEDS_REVIEW`, resuelto por
una persona con `pnpm cli reminder:resolve`. Detalle en `docs/REMINDER_ENGINE.md` § 7.

## Consecuencias

**Positivas:** duplicados imposibles por construcción, no por disciplina; el sistema tolera
varios workers y reinicios; cada caso raro tiene un estado explícito en lugar de un
comportamiento implícito.

**Negativas:** las claves de idempotencia son un contrato: cambiar su formato invalida las
existentes y exige una migración pensada. Añadir un tipo de origen toca esquema y
restricciones. El estado `NEEDS_REVIEW` requiere intervención humana ocasional —asumible
al volumen actual, revisable si crece.
