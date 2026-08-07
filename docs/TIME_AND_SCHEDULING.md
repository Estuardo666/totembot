# docs/TIME_AND_SCHEDULING.md — Tiempo y ventanas horarias

## 1. Reglas base

- **Zona horaria de negocio: `America/Guayaquil` (UTC−5, sin horario de verano).**
  Ecuador no aplica DST, lo que simplifica el cálculo, pero el código **no** asume un offset
  fijo: se usa la zona IANA para no romper si se añaden clientes en otra zona.
- Todo instante se **almacena en UTC** (`timestamptz`) y se **calcula y presenta** en la
  zona de negocio.
- `APP_TIME_ZONE` define la zona; la zona local del servidor **nunca** se usa como fuente.
  En producción el proceso arranca con `TZ=UTC` para que un error de configuración sea
  evidente en lugar de silencioso.
- Librería: **Luxon** (`DateTime.fromISO(..., { zone })`). Se elige sobre `date-fns-tz`
  por su manejo de zonas de primera clase y sobre `Temporal` porque su disponibilidad
  estable en Node aún no está garantizada para la versión objetivo.
- `Clock` es un puerto. En tests siempre `FixedClock`. Ninguna prueba depende de la hora real.

## 2. Ventana de envío

Por defecto (configurable en `AutomationSetting`, con posibilidad futura de excepción por cliente):

| Regla       | Valor                                             |
| ----------- | ------------------------------------------------- |
| Hora mínima | `08:00` (`BUSINESS_HOURS_START`)                  |
| Hora máxima | `18:30` (`BUSINESS_HOURS_END`)                    |
| Domingos    | no se envía (`sendOnSundays=false`)               |
| Sábados     | sí se envía en el MVP                             |
| Feriados    | no contemplados en la v1 (registrado como mejora) |

## 3. Algoritmo de ajuste

`BusinessWindowService.nextValidSlot(instant, policy): Instant`

```text
t = instant en la zona de negocio
bucle (máx. 14 iteraciones, si no -> error de configuración):
  si t es domingo y no sendOnSundays -> t = lunes 08:00; continuar
  si hora(t) <  start               -> t = mismo día a start; continuar
  si hora(t) >  end                 -> t = día siguiente a start; continuar
  devolver t en UTC
```

Casos:

| Vencimiento calculado | Resultado                      |
| --------------------- | ------------------------------ |
| Martes 14:00          | Martes 14:00 (sin cambios)     |
| Martes 22:00          | Miércoles 08:00                |
| Martes 06:00          | Martes 08:00                   |
| Sábado 20:00          | Lunes 08:00 (domingo excluido) |
| Domingo 10:00         | Lunes 08:00                    |

Al programar y al reintentar se aplica el mismo ajuste. Un recordatorio vencido fuera de
ventana no se pierde: se **difiere** (`DEFER`), no se cancela.

## 4. Tensión entre precisión y ventana

Un recordatorio de grabación de las 07:00 del miércoles debería salir el martes a las 07:00,
que está fuera de ventana. La política elegida es **adelantar al último slot válido
anterior** en el caso de grabaciones (`preferEarlier=true`), porque un recordatorio de
grabación **después** de la grabación es inútil:

- Grabación miércoles 07:00 → objetivo martes 07:00 → fuera de ventana → **martes 08:00**
  no sirve (sería después del objetivo pero aún 23 h antes: sí sirve). Regla real: si
  adelantar al slot anterior (lunes 18:30) o retrasar al siguiente (martes 08:00) siguen
  siendo **anteriores** a la grabación, se elige el **siguiente** (martes 08:00), por ser
  más cercano al evento.
- Si el siguiente slot válido es **posterior** al evento, se usa el último slot válido
  anterior al evento.
- Si no existe ningún slot válido antes del evento, se marca `SKIPPED(TOO_LATE)`.

Para recordatorios de tarea y factura la regla es simplemente "siguiente slot válido":
llegar tarde no los invalida.

## 5. Puntualidad del worker

El worker sondea cada `WORKER_POLL_INTERVAL_SECONDS` (por defecto 120 s). Por tanto la
precisión de entrega es de **±2 minutos + la pausa entre envíos**. Es aceptable y está
declarado en `SPEC.md`. `scheduledFor` (cuándo debía salir) y `sentAt` (cuándo salió) se
almacenan por separado, precisamente para poder medir esa deriva.

## 6. Antigüedad máxima

Si un recordatorio lleva más de `staleAfterHours` (por defecto 12 h) vencido —por ejemplo,
tras una caída larga—, se cancela con motivo `STALE` en lugar de enviarse. Recibir el
lunes el recordatorio de una grabación del domingo es peor que no recibir nada.
Excepción: los recordatorios de factura `OVERDUE` no caducan (`staleAfterHours=null`).

## 7. Pruebas obligatorias

- Cada frontera de la tabla de la sección 3, con `FixedClock`.
- Cruce de medianoche y cambio de día en la zona de negocio.
- Cruce de fin de mes y de año.
- Un cliente con zona horaria distinta de la de negocio.
- Que ninguna prueba pase o falle según la hora real de ejecución (verificado ejecutando la
  suite con `TZ=UTC`, `TZ=America/Guayaquil` y `TZ=Asia/Tokyo` en CI).
