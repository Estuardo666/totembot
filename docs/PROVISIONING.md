# PROVISIONING.md — Aprovisionamiento del servidor (M6-02)

Guía para dejar un VPS de Hostinger listo para recibir el primer despliegue. Cubre el
sistema operativo, el usuario de servicio, Node, PostgreSQL y los permisos de disco.

**Todo este documento es `OWNER_REQUIRED`.** Requiere credenciales de Hostinger y acceso
root. Ningún agente lo ejecuta: se sigue a mano y se marca lo hecho.

Complementa a `DEPLOYMENT.md` (que describe el despliegue en sí) y a `SECURITY.md` (que
fija por qué los permisos son los que son). Ante contradicción, gana `SECURITY.md`.

---

## 0. Antes de empezar

| Necesitas                           | De dónde sale                         |
| ----------------------------------- | ------------------------------------- |
| IP del VPS y acceso root por SSH    | Panel de Hostinger (`OWNER_REQUIRED`) |
| Clave pública SSH del propietario   | Máquina del propietario               |
| Clave GPG para cifrar los respaldos | Generada por el propietario (M6-04)   |

Anota cada contraseña generada en el gestor de secretos del propietario. **Nunca** en el
repositorio, en un issue ni en un mensaje.

---

## 1. Base del sistema

```bash
# como root
apt update && apt full-upgrade -y
timedatectl set-timezone UTC
apt install -y curl git gnupg ufw fail2ban
```

La zona horaria del sistema es **UTC**, no `America/Guayaquil`. La zona de negocio vive en
`APP_TIME_ZONE` y la resuelve la aplicación; mezclarlas es la causa clásica de recordatorios
a la hora equivocada (`docs/TIME_AND_SCHEDULING.md` § 1).

### 1.1 SSH

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
```

```bash
systemctl restart ssh
```

Antes de cerrar la sesión de root, comprueba en **otra terminal** que puedes entrar con la
clave y hacer `sudo`. Si no, quedas fuera del servidor.

### 1.2 Cortafuegos

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw enable
```

Los puertos 3000 (HTTP) y 5432 (PostgreSQL) **no se abren**: ambos escuchan solo en
`127.0.0.1`. El endpoint de salud se consulta desde el propio servidor o por un túnel SSH.

---

## 2. Usuario de servicio

```bash
adduser --system --group --home /home/totembot --shell /usr/sbin/nologin totembot
```

Sin shell de login y sin contraseña: los procesos de PM2 corren como `totembot`, pero nadie
inicia sesión con esa cuenta.

---

## 3. Node.js 24 LTS y pnpm

Se instala **para el usuario de servicio**, no globalmente como root:

```bash
sudo -u totembot -H bash -lc '
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source ~/.nvm/nvm.sh
  nvm install 24
  nvm alias default 24
  corepack enable
  corepack prepare pnpm@11.20.0 --activate
  node --version && pnpm --version
'
```

Las versiones deben coincidir con `package.json` (`engines`) y con `docs/REFERENCES.md`. Si
no coinciden, para y actualiza la referencia antes de seguir: una discrepancia de major de
Node cambia el comportamiento de `--env-file`, del que depende `ecosystem.config.cjs`.

PM2 se instala en el mismo entorno:

```bash
sudo -u totembot -H bash -lc 'source ~/.nvm/nvm.sh && npm install -g pm2 && pm2 --version'
```

---

## 4. PostgreSQL 17

```bash
apt install -y postgresql-17
```

`/etc/postgresql/17/main/postgresql.conf`:

```conf
listen_addresses = 'localhost'
timezone = 'UTC'
```

`/etc/postgresql/17/main/pg_hba.conf` — solo conexiones locales autenticadas:

```conf
local   all   totembot   scram-sha-256
host    all   totembot   127.0.0.1/32   scram-sha-256
```

```bash
systemctl restart postgresql
```

La creación del rol y de la base de producción está en `DEPLOYMENT.md` § 3 y es
`OWNER_REQUIRED`. No la ejecutes desde aquí para no duplicar la fuente de verdad.

Comprobación:

```bash
sudo -u postgres psql -c "SHOW listen_addresses;"   # -> localhost
sudo -u postgres psql -c "SHOW timezone;"           # -> UTC
```

---

## 5. Directorios y permisos

```bash
install -d -o totembot -g totembot -m 0750 /opt/totem-bot
install -d -o totembot -g totembot -m 0750 /opt/totem-bot/current
install -d -o totembot -g totembot -m 0750 /opt/totem-bot/shared
install -d -o totembot -g totembot -m 0750 /var/log/totem-bot
install -d -o totembot -g totembot -m 0700 /var/lib/totem-bot
install -d -o totembot -g totembot -m 0700 /var/lib/totem-bot/wa-auth
install -d -o root     -g root     -m 0700 /var/backups/totem-bot
```

`wa-auth/` en **0700** es un requisito duro: la aplicación verifica los permisos al arrancar
(M4-03) y se niega a continuar si el directorio es accesible por otros. Esa carpeta contiene
las credenciales de la sesión de WhatsApp; queda fuera del repositorio y fuera de los
respaldos generales (`SECURITY.md`, `DEPLOYMENT.md` § 7).

El archivo `.env` de producción lo crea el propietario (`DEPLOYMENT.md` § 4):

```bash
install -o totembot -g totembot -m 0600 /dev/null /opt/totem-bot/shared/.env
# Configuración del cron de respaldos; no contiene DATABASE_URL ni la clave privada GPG.
install -o root -g root -m 0600 /dev/null /opt/totem-bot/shared/backup.env
```

Verificación:

```bash
stat -c '%a %U:%G %n' /var/lib/totem-bot/wa-auth /opt/totem-bot/shared/.env
# 700 totembot:totembot /var/lib/totem-bot/wa-auth
# 600 totembot:totembot /opt/totem-bot/shared/.env
stat -c '%a %U:%G %n' /opt/totem-bot/shared/backup.env /var/backups/totem-bot
# 600 root:root /opt/totem-bot/shared/backup.env
# 700 root:root /var/backups/totem-bot
```

El propietario rellena `backup.env` a partir de `scripts/backup.env.example`, importa la
clave pública GPG en el keyring de `root` y sigue `DEPLOYMENT.md` § 7 para instalar el cron.
La clave privada debe conservarse fuera del VPS para que el servidor pueda cifrar, pero no
descifrar, los respaldos.

---

## 6. Arranque automático y rotación de logs

```bash
sudo -u totembot -H bash -lc '
  source ~/.nvm/nvm.sh
  cd /opt/totem-bot/current
  bash scripts/configure-pm2-logrotate.sh
'
pm2 startup systemd -u totembot --hp /home/totembot   # imprime un comando; ejecútalo como root
```

El script instala `pm2-logrotate@3.0.0` y fija `max_size=20M`, `retain=14`, `compress=true`,
`rotateInterval=0 0 * * *`, `workerInterval=30`, `dateFormat=YYYY-MM-DD_HH-mm-ss`, `TZ=UTC`
y `rotateModule=true`. El primer comando `pm2 install` queda cubierto por el script y no debe
repetirse manualmente.

`pm2 save` se ejecuta **después** del primer despliegue, no ahora: guarda la lista de
procesos, y todavía no hay ninguno.

La instalación y configuración son `OWNER_REQUIRED` porque descargan un módulo y modifican
el estado persistente de PM2 del usuario de servicio. La verificación posterior es:

```bash
sudo -u totembot -H bash -lc 'source ~/.nvm/nvm.sh && pm2 conf'
stat -c '%a %U:%G %n' /var/log/totem-bot
# 750 totembot:totembot /var/log/totem-bot
```

Retención y umbrales: `docs/OBSERVABILITY.md` § 5.

---

## 7. Lista de verificación

Marca solo lo que hayas comprobado en el servidor:

- [ ] `timedatectl` muestra UTC.
- [ ] SSH sin root y sin contraseña; acceso con clave verificado en una segunda terminal.
- [ ] `ufw status` permite solo OpenSSH.
- [ ] `id totembot` existe, sin shell de login.
- [ ] `node --version` es 24.x y `pnpm --version` coincide con `package.json`.
- [ ] PostgreSQL escucha solo en `localhost` y su `timezone` es UTC.
- [ ] Los permisos de la § 5 coinciden con la salida de `stat`.
- [ ] La clave pública GPG está importada en el keyring de `root`, `backup.env` es `0600` y
      `/var/backups/totem-bot` es `0700`.
- [ ] `/etc/cron.d/totem-bot-backup` está instalado con modo `0644` y `backup.log` con modo
      `0640`.
- [ ] `pm2-logrotate` instalado y configurado.
- [ ] Ningún secreto quedó en el historial de shell (`history -c` en la sesión que los usó).

Con la lista completa, el servidor está listo para `DEPLOYMENT.md` § 5. El primer despliegue
va con `WHATSAPP_ENABLED=false`: activar los envíos es una acción posterior, del piloto M7, y
`OWNER_REQUIRED`.
