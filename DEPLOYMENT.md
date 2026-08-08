# DEPLOYMENT.md — Despliegue

Destino: VPS en Hostinger (Linux), Node 24 LTS, PostgreSQL 17, PM2.
**Nada de esto se ejecuta sin el propietario.** Todos los pasos con credenciales,
base de datos de producción o despliegue son `OWNER_REQUIRED`.

El aprovisionamiento previo del servidor (sistema, usuario de servicio, Node, PostgreSQL,
permisos) está en [`docs/PROVISIONING.md`](docs/PROVISIONING.md).

## 1. Requisitos del servidor

- VPS con acceso root/sudo por SSH (no hosting compartido).
- Node.js 24 LTS (vía `nvm` o paquete oficial), `corepack enable` para pnpm 11.
- PostgreSQL 17 en el mismo host, escuchando solo en `localhost`.
- Un usuario de servicio dedicado, sin shell de login: `totembot`.
- Zona horaria del sistema en UTC (`timedatectl set-timezone UTC`).

## 2. Disposición en el sistema de archivos

```text
/opt/totem-bot/           # código desplegado (propiedad de totembot, 0750)
  current/                # release activa
  shared/.env             # 0600, propiedad de totembot
  shared/backup.env       # 0600, propiedad de root; solo configuración del respaldo
/var/lib/totem-bot/
  wa-auth/                # sesión de Baileys, 0700  (NUNCA en el repo ni en respaldos generales)
/var/log/totem-bot/       # logs de PM2, 0750
/var/backups/totem-bot/   # dumps cifrados, 0700
```

## 3. Base de datos de producción (`OWNER_REQUIRED`)

```sql
CREATE ROLE totembot LOGIN PASSWORD '<generada, no reutilizada>';
CREATE DATABASE totem_bot OWNER totembot;
REVOKE ALL ON DATABASE totem_bot FROM PUBLIC;
```

`DATABASE_URL` con `sslmode=disable` solo si la conexión es por socket local; en cualquier
otro caso, TLS obligatorio.

## 4. Variables de producción (`OWNER_REQUIRED`)

Se crean a mano en `/opt/totem-bot/shared/.env` con permisos `0600`, a partir de
`.env.example`. Diferencias respecto a desarrollo:

```env
NODE_ENV=production
LOG_LEVEL=info
WHATSAPP_ENABLED=true       # solo tras la autorización explícita del propietario
WHATSAPP_DRY_RUN=false      # solo tras un dry-run exitoso en el piloto
WHATSAPP_AUTH_DIRECTORY=/var/lib/totem-bot/wa-auth
WORKER_ENABLED=true
HTTP_HOST=127.0.0.1
```

Hasta el piloto (M7), producción se ejecuta con `WHATSAPP_ENABLED=false`.

## 5. Procedimiento de despliegue

```bash
# en el servidor, como usuario de despliegue
cd /opt/totem-bot/current
git fetch --all && git checkout <tag>
pnpm install --frozen-lockfile --prod=false
pnpm build
pnpm db:deploy          # prisma migrate deploy — nunca migrate dev
pm2 reload ecosystem.config.cjs --env production
pm2 save
```

Verificación posterior obligatoria:

```bash
curl -s localhost:3000/health
curl -s localhost:3000/ready
curl -s localhost:3000/status | jq
pm2 logs totem-worker --lines 50
```

Reglas:

- Se despliega desde un **tag**, no desde una rama.
- Migraciones antes de recargar los procesos.
- Migraciones destructivas: respaldo verificado inmediatamente antes, y aprobación
  explícita del propietario.
- Nunca `prisma migrate dev`, `prisma db push` ni `migrate reset` en producción.

## 6. PM2

El archivo real es [`ecosystem.config.cjs`](ecosystem.config.cjs) en la raíz del repositorio
(M6-01). Define dos apps, `totem-server` y `totem-worker`, y **no contiene secretos**: las
variables se cargan con `node --env-file=/opt/totem-bot/shared/.env`. Modificarlo es
`OWNER_REQUIRED` (`AGENTS.md` § 5).

Rutas que asume, ajustables por entorno con `TOTEM_APP_DIR`, `TOTEM_ENV_FILE` y
`TOTEM_LOG_DIR`:

| Ajuste                | Valor por defecto            |
| --------------------- | ---------------------------- |
| Directorio de trabajo | `/opt/totem-bot/current`     |
| Archivo de variables  | `/opt/totem-bot/shared/.env` |
| Logs                  | `/var/log/totem-bot`         |

`exec_mode: 'fork'` con una sola instancia: **nunca `cluster`** para el worker. Aunque el
claim atómico lo toleraría, no hay razón para multiplicar los envíos concurrentes a este
volumen.

Arranque en el boot: `pm2 startup systemd -u totembot --hp /home/totembot` y `pm2 save`.
Rotación de logs: [`scripts/configure-pm2-logrotate.sh`](scripts/configure-pm2-logrotate.sh),
ejecutado como `totembot` después del primer despliegue. Configura `pm2-logrotate@3.0.0`
con límite de 20 MiB, 14 archivos rotados, compresión gzip, rotación diaria a medianoche UTC
y comprobación de tamaño cada 30 segundos.

```bash
sudo -u totembot -H bash -lc '
  source ~/.nvm/nvm.sh
  cd /opt/totem-bot/current
  bash scripts/configure-pm2-logrotate.sh
'
pm2 startup systemd -u totembot --hp /home/totembot
sudo -u totembot -H bash -lc 'source ~/.nvm/nvm.sh && pm2 save'  # después de arrancar las apps
```

## 7. Respaldos

El respaldo diario usa [`scripts/backup-postgres.sh`](scripts/backup-postgres.sh). Genera un
dump `custom` de PostgreSQL, lo cifra con la clave pública GPG del propietario y elimina solo
los dumps creados por el propio script después de `BACKUP_RETENTION_DAYS` (30 por defecto).
La clave privada permanece fuera del servidor. `wa-auth/` no forma parte de este respaldo.

Instalación manual, como `root`, después de importar la clave pública en el keyring de `root`:

```bash
# archivo de configuración sin DATABASE_URL ni claves privadas
install -o root -g root -m 0600 scripts/backup.env.example /opt/totem-bot/shared/backup.env
# editar BACKUP_GPG_RECIPIENT con la huella de la clave pública importada
editor /opt/totem-bot/shared/backup.env

chmod 0750 /opt/totem-bot/current/scripts/backup-postgres.sh
install -o root -g root -m 0644 scripts/totem-bot-backup.cron /etc/cron.d/totem-bot-backup
install -o root -g root -m 0640 /dev/null /var/log/totem-bot/backup.log

# sintaxis local; no ejecuta pg_dump ni cifra datos
bash -n /opt/totem-bot/current/scripts/backup-postgres.sh
```

- El cron importa `DATABASE_URL` desde `/opt/totem-bot/shared/.env` y el destinatario GPG desde
  `backup.env`; no se pasan secretos como argumentos de proceso.
- El cron fija `CRON_TZ=UTC` y carga el Node 24 instalado con `nvm` para `totembot`; no depende
  del PATH interactivo de una sesión SSH.
- El directorio de destino debe ser `root:root` con modo `0700`; el script rechaza otros modos.
- La sesión de WhatsApp (`wa-auth/`) **queda excluida** de los respaldos generales.
- Restauración probada trimestralmente sobre una base desechable (tarea M6-07).

## 8. Rollback

1. `pm2 stop totem-worker` (detener envíos primero).
2. Volver al tag anterior y reconstruir.
3. Las migraciones **no** se revierten automáticamente: si la nueva versión añadió columnas,
   el esquema es compatible hacia atrás por diseño (expand → migrate → contract).
4. Reiniciar y verificar `/ready` y `/status`.

## 9. Primer despliegue

Orden obligatorio: desplegar con `WHATSAPP_ENABLED=false` → verificar salud y migraciones →
dry-run con datos reales → revisar los mensajes renderizados → **autorización del
propietario** → activar el piloto en un único grupo de prueba (M7) → incorporación gradual
de clientes reales, uno a uno.
