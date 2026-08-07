# ADR-0004 — Baileys aislado tras el puerto `MessagingGateway`

- **Estado:** Aceptado
- **Fecha:** 2026-08-06

## Contexto

El caso de uso exige escribir en grupos privados de WhatsApp que la agencia ya administra.
La API oficial de WhatsApp (Cloud API) está diseñada para conversaciones con clientes
mediante plantillas aprobadas y **no cubre bien el envío a grupos arbitrarios** en los que
la cuenta ya participa. La opción practicable es Baileys, una reimplementación
**no oficial** del protocolo de WhatsApp Web.

Baileys implica riesgo real: su propio README declara que no está afiliado ni autorizado
por WhatsApp y desaconseja la mensajería masiva automatizada. El número usado puede ser
restringido o baneado, y el protocolo puede cambiar sin aviso.

## Decisión

1. Usar `@whiskeysockets/baileys`, **fijado en `6.7.24`** (dist-tag `legacy`), no en
   `7.0.0-rc14` que es el `latest` pero sigue siendo release candidate con cambios
   incompatibles y una dependencia binaria nativa.
2. **Ningún tipo de Baileys cruza la frontera del dominio.** El puerto `MessagingGateway`
   expone `sendGroupText`, `connectionState` y `listAuthorizedGroups` con tipos propios.
   El mapeo de errores vive en un único archivo del adaptador.
3. Existen tres implementaciones: `BaileysMessagingGateway` (producción),
   `DryRunMessagingGateway` (decorador que corta el envío) y `FakeMessagingGateway` (tests).
4. **Doble bandera**: el adaptador real solo se construye si `WHATSAPP_ENABLED=true` **y**
   `WHATSAPP_DRY_RUN=false`. En `NODE_ENV=test` su construcción lanza un error.
5. Uso responsable como límite del diseño, no como recomendación: número secundario, solo
   grupos autorizados manualmente, volumen bajo, horario comercial, sin marketing.

## Alternativas consideradas

| Alternativa                                   | Descartada porque                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp Cloud API oficial                    | No cubre el envío a grupos existentes del mismo modo; exige aprobación de plantillas y coste por conversación. **Se mantiene como plan B documentado** si el piloto muestra inestabilidad o si Meta habilita grupos |
| `whatsapp-web.js`                             | Requiere Chromium en el servidor (más peso y superficie) y comparte el mismo riesgo de no-oficialidad                                                                                                               |
| Baileys `7.0.0-rc14`                          | 14 iteraciones de RC sin GA, cambios incompatibles y dependencia binaria nativa. Reevaluar en el GA (tarea M4-08)                                                                                                   |
| Usar Baileys directamente en los casos de uso | Acoplaría el dominio a la pieza con mayor probabilidad de ser sustituida, e impediría probar sin red                                                                                                                |
| SMS o correo electrónico                      | No es donde están los clientes; el requisito de negocio es WhatsApp                                                                                                                                                 |

## Consecuencias

**Positivas:** sustituir el proveedor toca un archivo; todo el sistema se prueba sin red; el
riesgo operativo queda acotado y explícito; el modo dry-run permite validar en producción
sin enviar.

**Negativas:** hay que mantener el mapeo de errores manualmente cuando Baileys cambie; se
pierde acceso a funciones avanzadas del cliente (deliberado); la clasificación de errores
transitorio/permanente es una heurística que habrá que afinar con la experiencia real.

**Riesgo residual aceptado:** el número puede ser restringido en cualquier momento. No hay
mitigación técnica completa; solo reducción de exposición y un plan B documentado.
