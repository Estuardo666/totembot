# SECURITY.md

## 1. Modelo de amenazas resumido

| Activo                     | Amenaza                                       | Impacto  | Control           |
| -------------------------- | --------------------------------------------- | -------- | ----------------- |
| Sesión de Baileys (`auth`) | Robo → control total de la cuenta de WhatsApp | Muy alto | § 2               |
| Base de datos              | Fuga de datos operativos de clientes          | Medio    | § 4               |
| Número de WhatsApp         | Baneo por uso indebido                        | Alto     | § 6               |
| Reputación con clientes    | Mensaje erróneo o duplicado                   | Medio    | Motor idempotente |
| Cadena de suministro       | Paquete malicioso / typosquatting             | Alto     | § 5               |
| Logs                       | Filtración de credenciales o datos personales | Alto     | § 3               |

## 2. Sesión de WhatsApp

La credencial más sensible del sistema. Quien la posee **es** la cuenta de WhatsApp.

- Vive en `WHATSAPP_AUTH_DIRECTORY`, **fuera del repositorio** y fuera del directorio de
  despliegue (p. ej. `/var/lib/totem-bot/wa-auth`).
- Directorio `0700`, archivos `0600`, propiedad del usuario de servicio dedicado
  (`totembot`), no de `root` ni del usuario de despliegue.
- Verificación al arrancar: si los permisos son más laxos, el proceso **no arranca**.
- `.gitignore` bloquea `wa-auth/`, `*auth_info*`, `*.creds.json` como red de seguridad.
- Excluida explícitamente de los respaldos generales. Si en el futuro se respalda, será
  cifrada y con retención propia.
- Nunca se imprime, nunca se sirve por HTTP, nunca se copia a un directorio temporal.
- El QR solo aparece en una TTY interactiva local durante `pnpm cli whatsapp:link`.
- La vinculación es siempre `OWNER_REQUIRED`.

### Revocación

1. Detener el worker: `pm2 stop totem-worker`.
2. Desde el teléfono: `WhatsApp → Dispositivos vinculados → cerrar sesión`.
3. Borrar el contenido de `WHATSAPP_AUTH_DIRECTORY`.
4. Re-vincular con `pnpm cli whatsapp:link`.
5. Verificar `/status` y reanudar el worker.

## 3. Logs

Ver [docs/OBSERVABILITY.md § Redacción](docs/OBSERVABILITY.md#redacción).
Nunca: credenciales, tokens, QR, archivos de sesión, contenido de conversaciones, números
sin enmascarar. Los errores de terceros se sanitizan antes de persistirse en
`Reminder.lastError` y `MessageAttempt.errorMessage` (longitud máxima 500, sin stack traces
completos con rutas del sistema).

## 4. Secretos y configuración

- `.env` nunca en Git; `.env.example` sin valores reales.
- Producción y desarrollo con archivos y bases de datos separados. Nunca apuntar el entorno
  de desarrollo a la base de datos de producción.
- `DATABASE_URL` con un usuario de PostgreSQL de mínimo privilegio (sin `SUPERUSER`,
  sin permisos sobre otras bases).
- Permisos `0600` para el `.env` de producción.
- **Rotación**: contraseña de la base de datos cada 6 meses o ante cualquier sospecha;
  sesión de WhatsApp ante cualquier sospecha o cambio de responsable.
- Prohibido pasar secretos por argumentos de línea de comandos (quedan en el historial y en
  la tabla de procesos).

## 5. Dependencias

- Solo paquetes verificados contra su repositorio oficial. Riesgo real de typosquatting con
  `@whiskeysockets/baileys` (existen forks y nombres parecidos): ver
  [docs/WHATSAPP_INTEGRATION.md § 2](docs/WHATSAPP_INTEGRATION.md).
- `pnpm-lock.yaml` versionado y obligatorio. CI instala con `--frozen-lockfile`.
- `pnpm audit --audit-level=high` en CI; una vulnerabilidad alta o crítica rompe el build.
- Dependencias de runtime críticas con versión fija (sin `^`).
- Atención especial: `@whiskeysockets/baileys@6.7.24` resuelve `libsignal` desde una URL de
  Git, sin verificación de integridad del registro npm. Se revisa la entrada del lockfile
  en cada actualización.
- Añadir una dependencia crítica es `OWNER_REQUIRED` y exige entrada en `docs/REFERENCES.md`.

## 6. Uso responsable de la cuenta

Reglas que reducen el riesgo de restricción del número y que además son un límite ético
del proyecto:

- Un **número secundario dedicado**, nunca el número principal de la agencia.
- Solo grupos existentes de clientes con relación comercial vigente y `authorizedAt` fijado
  manualmente por el propietario.
- Sin listas de difusión, sin mensajes a números individuales desconocidos, sin scraping de
  contactos, sin descubrimiento automático de grupos.
- Volumen bajo (< 15 mensajes/día), horario comercial, pausa entre envíos.
- Contenido exclusivamente operativo y esperado por el destinatario. Sin marketing.
- Un canal claro para que un cliente pida dejar de recibir recordatorios (se atiende
  desactivando su grupo en el sistema).

## 7. Superficie de red

- Fastify escucha en `127.0.0.1` por defecto. `/status` nunca se publica en internet.
- Sin API pública en el MVP. El acceso remoto es por SSH con clave, sin contraseña.
- El puerto de PostgreSQL no se expone fuera del host.

## 8. Procedimiento ante incidente

### Secreto commiteado

1. Considerarlo comprometido de inmediato, aunque el repositorio sea privado.
2. **Rotar el secreto primero**, reescribir el historial después.
3. Purgar del historial (`git filter-repo`) y forzar el reemplazo (`OWNER_REQUIRED`).
4. Revisar quién tuvo acceso en el intervalo.
5. Registrar el incidente en `docs/DECISIONS.md` con fecha, alcance y acciones.

### Sesión de WhatsApp comprometida

1. Cerrar la sesión desde el teléfono inmediatamente.
2. Detener el worker.
3. Aplicar el procedimiento de revocación (§ 2).
4. Revisar en la app los mensajes enviados desde el dispositivo vinculado.
5. Avisar a los clientes afectados si se enviaron mensajes no autorizados.

### Mensaje erróneo o duplicado enviado

1. Pausar la automatización: `pnpm cli automation:pause --global`.
2. Identificar el recordatorio y el `MessageAttempt` por `correlationId`.
3. Corregir manualmente en el grupo (aclaración humana).
4. Escribir la prueba de regresión **antes** del arreglo.
5. Registrar la causa raíz en `docs/DECISIONS.md`.

### Número restringido por WhatsApp

1. Detener todos los envíos.
2. No re-vincular ni cambiar de número inmediatamente (agrava la señal).
3. Evaluar volumen y contenido enviados.
4. Decisión `OWNER_REQUIRED`: esperar, apelar, o migrar a la WhatsApp Cloud API oficial.

## 9. Reporte de vulnerabilidades

Proyecto interno. Reportar directamente al responsable técnico del repositorio. No abrir
issues públicos con detalles de una vulnerabilidad.
