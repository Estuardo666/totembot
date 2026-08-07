# docs/WHATSAPP_INTEGRATION.md — Integración con WhatsApp

## 1. Advertencia previa

**Baileys no es una API oficial de Meta ni de WhatsApp.** Es una reimplementación de
terceros del protocolo de WhatsApp Web, mantenida por la comunidad
(`WhiskeySockets/Baileys`). Su propio README declara que el proyecto no está afiliado ni
autorizado por WhatsApp, y desaconseja el uso para spam o mensajería masiva automatizada.

Consecuencias asumidas por el proyecto:

- Riesgo de **restricción o baneo permanente del número** utilizado.
- Cambios de protocolo sin aviso que rompan la integración.
- Desconexiones que exigen re-vinculación manual (`OWNER_REQUIRED`).
- Sin SLA, sin soporte, sin garantía de continuidad.

Mitigaciones adoptadas: número secundario dedicado (nunca el principal de la agencia),
volumen bajo (< 15 mensajes/día), solo grupos propios con relación comercial vigente,
horario comercial, ritmo humano entre envíos, sin difusión ni contactos desconocidos.

Plan B documentado: **WhatsApp Cloud API oficial** (mensajes de plantilla aprobados, coste
por conversación, no soporta escribir en grupos arbitrarios del mismo modo). La frontera
`MessagingGateway` existe para que ese cambio no toque el dominio.

## 2. Paquete y versión

| Aspecto                          | Valor                                     |
| -------------------------------- | ----------------------------------------- |
| Paquete oficial                  | `@whiskeysockets/baileys`                 |
| Repositorio                      | https://github.com/WhiskeySockets/Baileys |
| Documentación                    | https://baileys.wiki                      |
| Dist-tag `latest` (2026-08-06)   | `7.0.0-rc14` — **release candidate**      |
| Dist-tag `legacy`                | `6.7.24`                                  |
| **Versión seleccionada para M4** | `6.7.24` (fijada, sin `^`)                |
| Node requerido                   | `>=20.0.0`                                |

Motivo: 7.0.0 sigue en RC tras 14 iteraciones e introduce cambios incompatibles y una
dependencia binaria nativa (`whatsapp-rust-bridge`). Para un MVP se prefiere la línea
estable. **Riesgo conocido de 6.7.24**: declara `libsignal` como dependencia
`git+https://...`, es decir, se instala desde GitHub sin la verificación de integridad del
registro npm. Se mitiga con `pnpm` + lockfile fijado, `pnpm audit` en CI, y revisión de la
resolución en `pnpm-lock.yaml`. Reevaluar el salto a 7.x cuando exista GA (tarea M4-08).

Cuidado con el **typosquatting**: existen paquetes con nombres similares (`baileys`,
`@adiwajshing/baileys`, forks varios). Solo se usa `@whiskeysockets/baileys` verificado
contra el repositorio oficial.

## 3. Frontera: `MessagingGateway`

```ts
// src/domain/ports/messaging-gateway.ts  — sin ningún tipo de Baileys
export type GroupJid = string & { readonly __brand: "GroupJid" };

export type SendResult =
  | { kind: "sent"; providerMessageId: string | null }
  | { kind: "failed"; classification: "TRANSIENT" | "PERMANENT" | "SESSION_INVALID"; code: string }
  | { kind: "skipped"; reason: "DRY_RUN" };

export type ConnectionState = "open" | "connecting" | "closed" | "logged_out";

export interface MessagingGateway {
  sendGroupText(jid: GroupJid, text: string): Promise<SendResult>;
  connectionState(): ConnectionState;
  listAuthorizedGroups(): Promise<ReadonlyArray<{ jid: GroupJid; subject: string }>>;
}
```

Ningún tipo de Baileys cruza esta frontera. El adaptador traduce errores de Baileys
(`Boom`, `DisconnectReason`) a la clasificación del dominio en un único lugar:
`src/infrastructure/whatsapp/error-mapper.ts`.

Implementaciones:

| Implementación            | Uso                                                                 |
| ------------------------- | ------------------------------------------------------------------- |
| `BaileysMessagingGateway` | producción, solo si `WHATSAPP_ENABLED=true`                         |
| `DryRunMessagingGateway`  | decorador; corta el envío, registra el intento                      |
| `FakeMessagingGateway`    | tests y desarrollo; guarda los mensajes en memoria e inyecta fallos |

**Doble bandera**: el adaptador real solo se construye si
`WHATSAPP_ENABLED === true && WHATSAPP_DRY_RUN === false`. En `NODE_ENV=test` la
construcción del adaptador real lanza un error, sin excepción posible.

## 4. Gestión de la sesión

- Almacenamiento en `WHATSAPP_AUTH_DIRECTORY`, **fuera del árbol del repositorio**
  (p. ej. `/var/lib/totem-bot/wa-auth`).
- MVP: `useMultiFileAuthState` del paquete oficial, con permisos `0700` en el directorio y
  `0600` en los archivos, verificados al arrancar (el proceso se niega a arrancar si son
  más laxos).
- La documentación oficial advierte que **las claves deben persistirse siempre**; no
  hacerlo provoca que los mensajes no lleguen y otros efectos inesperados. El proceso nunca
  debe borrar el directorio de auth como "solución" a un error.
- Evaluado para post-MVP: store en PostgreSQL cifrado con una clave en el entorno. Ventaja:
  entra en el respaldo normal y sobrevive a una reinstalación. Inconveniente: el respaldo
  pasa a contener una credencial de acceso total. Decisión aplazada a M4 (ADR pendiente).

### Vinculación (`OWNER_REQUIRED`)

```bash
pnpm cli whatsapp:link
```

- Solo se ejecuta **localmente**, en una TTY interactiva, por el propietario.
- Imprime el QR **únicamente** en la terminal. Nunca en logs, archivos ni HTTP.
- Rechaza ejecutarse si `NODE_ENV=test` o si no hay TTY.
- Registra un `AuditEvent` (sin datos sensibles) al completar.

Otros comandos: `whatsapp:status` (estado y JID propio enmascarado),
`whatsapp:logout` (cierra sesión y borra la sesión local previa confirmación explícita),
`whatsapp:groups` (lista grupos para copiar los JID al alta de clientes; solo lectura).

### Revocación y re-vinculación

1. `pnpm cli whatsapp:logout` o cierre de sesión desde el teléfono (`WhatsApp → Dispositivos vinculados`).
2. Borrar el contenido de `WHATSAPP_AUTH_DIRECTORY`.
3. `pnpm cli whatsapp:link` de nuevo.
4. Verificar con `whatsapp:status` y con `/status`.

Durante todo el proceso el worker debe estar detenido (`pm2 stop totem-worker`).

## 5. Manejo de la conexión

- `connection.update` se traduce a `ConnectionState`; el worker no reclama recordatorios si
  el estado no es `open`.
- Reconexión automática con backoff ante cierres recuperables. Ante `DisconnectReason.loggedOut`
  **no** se reintenta: se marca la sesión como inválida y se alerta al operador.
- `creds.update` persiste siempre (obligatorio).
- El adaptador **no** se suscribe a mensajes entrantes en el MVP (PRI-02). Si en el futuro
  se implementa la confirmación por respuesta (SPEC Q-02), se procesará únicamente en los
  grupos autorizados y solo se guardará un booleano de confirmación, nunca el texto.
- No se marca "en línea" permanentemente ni se leen recibos de forma automática.

## 6. Envío

- Solo `sendMessage(jid, { text })` a JIDs terminados en `@g.us` que existan en
  `whatsapp_groups` con `enabled=true` y `authorizedAt` no nulo. Un JID que no cumpla esto
  provoca un error permanente antes de llegar a Baileys.
- Sin adjuntos, sin botones, sin listas, sin menciones en la v1.
- Pausa aleatoria entre envíos (3–8 s).
- Sin reintento inmediato: el reintento lo gobierna el motor de recordatorios.

## 7. Pruebas

- CI **nunca** instancia el adaptador real. `WHATSAPP_ENABLED=false` forzado en el workflow.
- El adaptador de Baileys se prueba solo con el mapeo de errores (funciones puras) y con un
  smoke test manual del propietario en el piloto (M7).
- Todo lo demás usa `FakeMessagingGateway`.
