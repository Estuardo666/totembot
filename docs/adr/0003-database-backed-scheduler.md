# ADR-0003 — Scheduler respaldado por la base de datos (sin Redis ni BullMQ)

- **Estado:** Aceptado
- **Fecha:** 2026-08-06

## Contexto

Hay que ejecutar trabajo diferido: enviar cada recordatorio en su momento, con reintentos,
sin duplicados y sobreviviendo a reinicios. La solución habitual es una cola (BullMQ sobre
Redis). El volumen real es de **< 300 mensajes al mes**, con una tolerancia de latencia de
minutos y una ventana de envío de 10,5 horas al día.

## Decisión

Un **worker periódico** que cada `WORKER_POLL_INTERVAL_SECONDS` (por defecto 120 s)
consulta PostgreSQL y reclama recordatorios vencidos con `FOR UPDATE SKIP LOCKED`.
**Sin Redis y sin BullMQ en el MVP.**

Se define un puerto `ReminderQueue` en el dominio para que una migración futura a BullMQ no
toque las reglas de negocio.

## Alternativas consideradas

| Alternativa                     | Descartada porque                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BullMQ + Redis                  | Añade un segundo almacén de estado que puede divergir de la fuente de verdad; hay que operarlo, respaldarlo y monitorizarlo; introduce modos de fallo nuevos (job perdido tras un flush de Redis) para un beneficio nulo a este volumen |
| `node-cron` en memoria          | El estado se pierde al reiniciar; no soporta dos procesos; no hay reintentos persistentes                                                                                                                                               |
| `pg_cron` / `LISTEN`-`NOTIFY`   | Mete lógica de planificación dentro de la base, difícil de probar y de versionar                                                                                                                                                        |
| `setTimeout` por recordatorio   | No sobrevive a un reinicio y no escala más allá de la memoria del proceso                                                                                                                                                               |
| Un servicio gestionado de colas | Dependencia externa y coste, para un sistema que debe funcionar en un VPS                                                                                                                                                               |

## Criterios objetivos de migración a una cola real

Se reabre esta decisión si se cumple **cualquiera** de estos:

1. El volumen supera **1000 mensajes/día**.
2. Se requiere una latencia de entrega inferior a **30 segundos**.
3. Aparecen trabajos de larga duración (procesado de vídeo, adjuntos) que bloqueen el tick.
4. Se necesitan más de **3 workers** concurrentes de forma sostenida.
5. Se añade un componente que ya requiera Redis por otra razón legítima.

Ninguno se cumple hoy ni está previsto en el horizonte del MVP.

## Consecuencias

**Positivas:** un solo almacén de estado y un solo respaldo; recuperación tras reinicio sin
código especial (es el flujo normal); todo el motor se prueba con PostgreSQL, sin
infraestructura adicional; menos que operar en un VPS pequeño.

**Negativas:** precisión de entrega de ±2 minutos (aceptada y declarada en `SPEC.md`);
sondeo constante, aunque despreciable (una consulta indexada cada 2 minutos); hay que
implementar a mano el claim, el backoff y la recuperación, que BullMQ daría hechos —a
cambio, son ~200 líneas totalmente cubiertas por pruebas y sin caja negra.
