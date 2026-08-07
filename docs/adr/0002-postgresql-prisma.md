# ADR-0002 — PostgreSQL como fuente de verdad y Prisma como ORM

- **Estado:** Aceptado
- **Fecha:** 2026-08-06

## Contexto

El requisito duro del sistema no es el volumen (trivial), sino **no enviar nunca un mensaje
duplicado a un cliente** y **no perder recordatorios ante un reinicio**. Eso exige
unicidad garantizada, transacciones y una reserva atómica de trabajo entre procesos.

## Decisión

**PostgreSQL 17** como única fuente de verdad, con **Prisma 7** para esquema, migraciones y
acceso tipado. El claim atómico se escribe en **SQL crudo** mediante `$queryRaw`, porque
`FOR UPDATE SKIP LOCKED` no se expresa bien a través del ORM.

Las garantías se apoyan en la base, no en el código de Node:

- `UNIQUE` sobre `idempotency_key`.
- `CHECK` sobre el origen del recordatorio y la coherencia de estados.
- `FOR UPDATE SKIP LOCKED` para el claim.
- Índices parciales para la consulta caliente del worker.

## Alternativas consideradas

| Alternativa          | Descartada porque                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite               | Sin `SKIP LOCKED` con concurrencia real; migrar después sería más caro que empezar bien                                                                            |
| MongoDB              | Sin transacciones multi-documento cómodas ni restricciones `CHECK`; el modelo es claramente relacional                                                             |
| Drizzle              | Muy atractivo y más ligero, pero sus migraciones son menos maduras que las de Prisma, y las migraciones son crítica en un sistema con datos operativos de clientes |
| Kysely + `pg`        | Máximo control y SQL de primera clase, pero exige escribir a mano el versionado de migraciones                                                                     |
| Prisma sin SQL crudo | El claim atómico no sería correcto; se rechaza la comodidad a costa de la garantía                                                                                 |

## Consecuencias

**Positivas:** unicidad y atomicidad garantizadas por el motor; migraciones versionadas y
revisables; tipado extremo a extremo; respaldo y restauración con herramientas estándar.

**Negativas:** una consulta crítica queda fuera del tipado de Prisma y debe cubrirse con
pruebas de integración específicas; el cliente generado añade peso al build; hay que operar
un PostgreSQL (mitigado: ya es necesario de todos modos).

**Obligación derivada:** todo lo que garantice unicidad o atomicidad debe estar en el
esquema, no en el código de aplicación. Una comprobación en Node no es una garantía.
