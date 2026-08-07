# DEPLOYMENT.md — Despliegue

Destino: VPS en Hostinger (Linux), Node 24 LTS, PostgreSQL 17, PM2.
**Nada de esto se ejecuta sin el propietario.** Todos los pasos con credenciales,
base de datos de producción o despliegue son `OWNER_REQUIRED`.

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

`ecosystem.config.cjs` (borrador para M6):

```js
module.exports = {
  apps: [
    {
      name: "totem-server",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env_production: { NODE_ENV: "production", TZ: "UTC" },
      max_memory_restart: "300M",
      out_file: "/var/log/totem-bot/server.out.log",
      error_file: "/var/log/totem-bot/server.err.log",
      time: true,
    },
    {
      name: "totem-worker",
      script: "dist/worker.js",
      instances: 1, // exactamente uno; el diseño tolera más, pero no hace falta
      exec_mode: "fork",
      env_production: { NODE_ENV: "production", TZ: "UTC" },
      max_memory_restart: "400M",
      restart_delay: 5000,
      out_file: "/var/log/totem-bot/worker.out.log",
      error_file: "/var/log/totem-bot/worker.err.log",
      time: true,
    },
  ],
};
```

`exec_mode: 'fork'` con una sola instancia: **nunca `cluster`** para el worker. Aunque el
claim atómico lo toleraría, no hay razón para multiplicar los envíos concurrentes a este
volumen.

Arranque en el boot: `pm2 startup systemd -u totembot --hp /home/totembot` y `pm2 save`.
Rotación de logs: `pm2 install pm2-logrotate`, 14 días, comprimido.

## 7. Respaldos

```bash
# cron diario 03:00 UTC
pg_dump -Fc totem_bot | gpg --encrypt --recipient <clave> > /var/backups/totem-bot/$(date +%F).dump.gpg
find /var/backups/totem-bot -mtime +30 -delete
```

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
