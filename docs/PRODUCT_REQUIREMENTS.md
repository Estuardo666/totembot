# docs/PRODUCT_REQUIREMENTS.md — Requisitos de producto

Complementa `SPEC.md` (que contiene los requisitos formales y los criterios de aceptación)
con el contexto de negocio y las razones detrás de cada decisión funcional.

## 1. Problema

Totem Mass Media coordina con ~20 clientes por grupos de WhatsApp. El seguimiento manual
produce tres fricciones recurrentes:

1. **Grabaciones**: el cliente olvida la cita o no confirma, y el equipo se desplaza en vano.
2. **Aprobaciones**: el material queda esperando revisión días, y hay que perseguir al
   cliente manualmente.
3. **Cobros**: los pagos mensuales se retrasan por olvido, y recordarlos a mano es incómodo
   y se hace de forma inconsistente.

El coste no es solo el tiempo perdido: es la inconsistencia. Unos clientes reciben
seguimiento y otros no, según quién esté disponible ese día.

## 2. Usuarios

| Usuario                    | Necesidad                                                          |
| -------------------------- | ------------------------------------------------------------------ |
| Coordinación de producción | Que las grabaciones se confirmen sin perseguir a nadie             |
| Edición                    | Que las aprobaciones no se queden estancadas sin que nadie lo note |
| Administración             | Que los cobros se recuerden de forma sistemática y educada         |
| Cliente                    | Recibir avisos útiles y previsibles, sin sentirse spameado         |
| Operador del sistema       | Saber en 30 segundos si el bot está funcionando bien               |

El cliente no es un usuario del software, pero **sí es el destinatario**: la calidad del
tono, la frecuencia y la utilidad de los mensajes son requisitos de producto, no detalles.

## 3. Principios de producto

1. **Menos es más.** Ante la duda, no enviar. Un recordatorio de menos es un inconveniente;
   uno de más erosiona la relación.
2. **Predecible.** Mismos mensajes, mismos horarios, mismo formato, siempre.
3. **Nunca fuera de lugar.** Ni de madrugada, ni en domingo, ni sobre algo ya resuelto.
4. **Siempre relevante.** Se revalida en el momento del envío: si el pago ya está hecho o
   la tarea ya está aprobada, no se envía.
5. **Humano detrás.** El bot recuerda; las conversaciones las tienen personas.
6. **Reversible.** Un cliente puede quedar fuera con un comando.

## 4. Recorridos

### Grabación

Se registra una grabación → 24 h antes, dentro del horario permitido, llega al grupo un
mensaje con fecha, hora, detalles y petición de confirmación → el cliente responde en el
grupo → una persona del equipo lee la confirmación.
Si la grabación se reprograma o cancela, el recordatorio pendiente desaparece.

### Revisión

Se envía material a revisión → si a las 48 h sigue sin respuesta, un recordatorio cordial →
como máximo un segundo recordatorio 48 h después → si el cliente aprueba o pide cambios en
cualquier momento, no llega nada más.

### Pago

Factura del mes con vencimiento → aviso 3 días antes → aviso el día del vencimiento →
avisos a los 3 y 7 días de vencido → en cuanto se registra el pago, silencio total.

## 5. Qué mide el éxito del MVP

| Indicador                                     | Objetivo                                  |
| --------------------------------------------- | ----------------------------------------- |
| Mensajes duplicados enviados a un cliente     | **cero**                                  |
| Mensajes enviados fuera del horario permitido | **cero**                                  |
| Recordatorios enviados sobre algo ya resuelto | **cero**                                  |
| Grabaciones confirmadas con antelación        | mayoría (línea base a medir en el piloto) |
| Tiempo medio de aprobación en `CLIENT_REVIEW` | menor que antes del bot                   |
| Intervención manual del operador              | < 10 minutos por semana                   |

Los tres primeros son criterios de corrección, no metas: si se incumple alguno, el piloto
se detiene.

## 6. Anti-requisitos

Cosas que el producto **no debe** hacer, aunque sean técnicamente posibles:

- Enviar a números individuales o a grupos no autorizados manualmente.
- Enviar contenido promocional o de marketing.
- Escribir fuera del horario comercial o en domingo.
- Insistir indefinidamente: hay un máximo de recordatorios por entidad.
- Guardar o analizar las conversaciones de los grupos.
- Responder automáticamente a mensajes.
- Simular ser una persona: cada mensaje se identifica como automático.

## 7. Evolución posible (no comprometida)

Panel web de consulta · procesamiento de confirmaciones entrantes · recordatorios internos
para el equipo · integración con la herramienta de gestión de proyectos · informes
mensuales · migración a la WhatsApp Cloud API oficial. Nada de esto entra en el MVP ni
condiciona su diseño más allá de las fronteras ya establecidas.
