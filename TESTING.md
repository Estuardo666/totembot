# TESTING.md — Estrategia de pruebas

Runner: **Vitest 4**. Sin envío real de WhatsApp jamás, en ningún nivel.

## 1. Pirámide

| Nivel       | Dónde                | Qué usa                                                  | Velocidad |
| ----------- | -------------------- | -------------------------------------------------------- | --------- |
| Unitarias   | `tests/unit/`        | `FixedClock`, `SequentialIdGenerator`, repos en memoria  | ms        |
| Integración | `tests/integration/` | PostgreSQL real (Docker), Prisma, `FakeMessagingGateway` | s         |
| E2E seguras | `tests/e2e/`         | Todo el sistema con `FakeMessagingGateway`               | s         |

No hay nivel que toque WhatsApp de verdad. La única verificación contra WhatsApp real es
el piloto manual del propietario en M7.

## 2. Reglas transversales

- **Deterministas**: prohibido `new Date()`, `Math.random()` y `setTimeout` reales en las
  pruebas. Reloj fijo, generador de IDs secuencial, aleatoriedad inyectada.
- La suite se ejecuta en CI con `TZ=UTC`, `TZ=America/Guayaquil` y `TZ=Asia/Tokyo`: si un
  test depende de la zona del sistema, se detecta.
- Sin `test.skip` ni `test.only` en `main`; una regla de ESLint lo impide.
- Prohibido un mock que oculte un fallo. Un doble de prueba implementa el **puerto
  completo** y falla ruidosamente ante un método no previsto.
- Cada corrección de bug empieza por una prueba que falla.
- Datos de prueba con `faker` semillado o factorías explícitas; **nunca** datos reales de
  clientes, ni JIDs ni números reales.

## 3. Unitarias — cobertura obligatoria

| Área                             | Casos mínimos                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cálculo de fechas                | offsets de 24 h / 48 h / ±N días; cruce de medianoche, mes y año                                                     |
| Ventanas horarias                | cada frontera de `docs/TIME_AND_SCHEDULING.md` § 3; domingo; adelanto vs. retraso en grabaciones                     |
| Elegibilidad                     | cada fila de la tabla de `docs/REMINDER_ENGINE.md` § 4, incluidos casos límite                                       |
| Claves de idempotencia           | determinismo; cambio al reprogramar; cambio por ronda de revisión; caracteres inválidos                              |
| Cancelación por cambio de estado | tarea sale de `CLIENT_REVIEW`; factura pasa a `PAID`; grabación `CANCELLED`                                          |
| Límites de recordatorios         | máximo por tarea y por factura; configuración por cliente sobre la global                                            |
| Reintentos                       | clasificación de errores; backoff con aleatoriedad inyectada; corte en `maxAttempts`                                 |
| Plantillas                       | snapshot por plantilla; variable faltante = error; sanitización de saltos de línea y caracteres de control; truncado |
| Redacción de logs                | ningún secreto de prueba aparece en la salida serializada                                                            |

Cobertura objetivo: ≥ 85 % en `src/domain` y `src/application`; se mide, no se persigue el
número en el resto.

## 4. Integración — PostgreSQL real

Base de datos dedicada, levantada por Docker Compose (`postgres-test`, puerto distinto al
de desarrollo). `DATABASE_URL` de test es obligatoriamente distinta de la de desarrollo, y
el runner aborta si el nombre de la base no termina en `_test`.

Cada archivo de test corre dentro de una transacción con rollback, salvo los que prueban
concurrencia (que necesitan commits reales y usan un esquema aislado).

Casos obligatorios:

- **Restricción única de idempotencia** (CA-02): dos inserts con la misma clave → el segundo
  falla, o es absorbido por `ON CONFLICT DO NOTHING`.
- **Claims concurrentes** (CA-01): N conexiones ejecutan el claim a la vez sobre el mismo
  lote; la suma de filas reservadas es exactamente el tamaño del lote y no hay solapamiento.
- **Restricciones `CHECK`**: origen múltiple o nulo rechazado; tipo incoherente con el
  origen rechazado; JID que no termina en `@g.us` rechazado; `PAID` sin `paidAt` rechazado.
- **Transacciones**: un fallo a mitad del caso de uso no deja el recordatorio en
  `PROCESSING` ni la tarea a medio actualizar.
- **Migraciones**: `prisma migrate deploy` sobre una base vacía funciona y es idempotente;
  el esquema resultante coincide con `schema.prisma` (`prisma migrate diff --exit-code`).
- **Recuperación tras fallo** (CA-07): recordatorio en `PROCESSING` con lock expirado y un
  `MessageAttempt` en `STARTED` → pasa a `NEEDS_REVIEW`, no se reenvía.
- **Índice parcial**: la consulta del worker usa `reminders_due_idx` (verificado con `EXPLAIN`).

## 5. E2E seguras

Sistema completo montado en memoria (composition root real) con `FakeMessagingGateway`.

- **Flujo de grabación**: crear grabación → avanzar el reloj → tick → un mensaje en el fake
  con el texto esperado → segundo tick no produce nada.
- **Flujo de revisión**: tarea a `CLIENT_REVIEW` → +48 h → mensaje → aprobar la tarea →
  el segundo recordatorio se cancela.
- **Flujo de factura**: recordatorios en cada offset → marcar `PAID` → sin más mensajes.
- **Dry-run** (CA-10): mismo flujo con `DryRunMessagingGateway`; cero llamadas al gateway
  subyacente y los intentos quedan como `SKIPPED_DRY_RUN`.

Protecciones que garantizan que no se envía nada real:

1. CI fija `WHATSAPP_ENABLED=false` y `WHATSAPP_DRY_RUN=true`.
2. La factoría del gateway **lanza un error** si se pide el adaptador real con
   `NODE_ENV=test`.
3. Un test verifica esa protección explícitamente.
4. `@whiskeysockets/baileys` no se importa en ningún archivo bajo `tests/`
   (comprobado con una prueba que analiza los imports).

## 6. CI (GitHub Actions)

```text
push / pull_request:
  - setup Node 24 + pnpm 11
  - pnpm install --frozen-lockfile
  - pnpm format:check
  - pnpm lint
  - pnpm typecheck
  - pnpm test:unit
  - servicio postgres:17 -> pnpm db:deploy -> pnpm test:integration
  - pnpm build
  - pnpm audit --audit-level=high
env global: WHATSAPP_ENABLED=false, WHATSAPP_DRY_RUN=true
```

CI nunca recibe secretos de WhatsApp ni credenciales de producción.

## 7. Verificación manual del piloto (M7, `OWNER_REQUIRED`)

Fuera de CI, con número secundario y **un** grupo de prueba creado por el propietario:
un recordatorio de cada tipo, verificando texto, hora, ausencia de duplicados y contenido
de los logs. Documentado en `OPERATIONS.md § Piloto`.
