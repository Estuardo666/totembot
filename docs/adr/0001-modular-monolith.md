# ADR-0001 — Monolito modular con puertos y adaptadores

- **Estado:** Aceptado
- **Fecha:** 2026-08-06
- **Decide:** responsable técnico

## Contexto

Un solo despliegue, un solo tenant, un equipo muy pequeño, ~300 mensajes al mes. El sistema
tiene tres puntos de entrada (HTTP de salud, worker, CLI) sobre el mismo núcleo. La pieza
de mayor riesgo —Baileys— es de terceros, no oficial, y con probabilidad real de tener que
sustituirse.

## Decisión

Un **monolito modular** con arquitectura de puertos y adaptadores:

- `domain/` puro: entidades, objetos de valor, reglas y **puertos** (interfaces).
- `application/`: casos de uso que orquestan puertos. Sin detalles técnicos.
- `infrastructure/`: adaptadores (Prisma, Baileys, Fastify, Pino).
- `modules/`: composición y API pública por área funcional.
- Inyección de dependencias explícita por constructor, sin framework de DI.
- Las reglas de dependencia se hacen cumplir con ESLint `no-restricted-imports`.

## Alternativas consideradas

| Alternativa                           | Descartada porque                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Microservicios                        | Complejidad operativa injustificable a este volumen; introduce consistencia distribuida donde una transacción de PostgreSQL basta |
| Capas clásicas sin puertos            | Acoplaría el dominio a Baileys, que es exactamente la pieza que más probablemente hay que cambiar                                 |
| Scripts sueltos sin arquitectura      | Imposible de probar de forma determinista; la idempotencia se volvería frágil                                                     |
| Framework de DI (tsyringe, Inversify) | Decoradores y metadatos para inyectar ~10 dependencias; el composition root explícito es más simple y más fácil de seguir         |

## Consecuencias

**Positivas:** el dominio se prueba sin base de datos ni red; sustituir Baileys toca un solo
archivo; los límites son verificables automáticamente; el despliegue es un `pm2 reload`.

**Negativas:** más archivos e indirección de la estrictamente necesaria hoy; hay que
escribir y mantener dobles de prueba para cada puerto; la disciplina de capas exige
vigilancia (mitigado con lint).

**Coste de revertir:** bajo si se hace pronto; la estructura de carpetas es lo primero que
se crea (M1-01).
