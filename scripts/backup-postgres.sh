#!/usr/bin/env bash
set -Eeuo pipefail

# M6-04: dump PostgreSQL without putting DATABASE_URL or its password in argv.
umask 077

die() {
  printf 'backup error: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage: backup-postgres.sh

Required environment:
  DATABASE_URL             PostgreSQL connection URL
  BACKUP_GPG_RECIPIENT     GPG public-key fingerprint or recipient

Optional environment:
  BACKUP_DIR               Encrypted dump directory (default: /var/backups/totem-bot)
  BACKUP_RETENTION_DAYS    Retention in complete days (default: 30)
  PG_DUMP_BIN              pg_dump path (default: pg_dump)
  GPG_BIN                  gpg path (default: gpg)
USAGE
  exit 0
fi

[[ $# -eq 0 ]] || die "unknown argument: $1"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"

backup_dir="${BACKUP_DIR:-/var/backups/totem-bot}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
pg_dump_bin="${PG_DUMP_BIN:-pg_dump}"
gpg_bin="${GPG_BIN:-gpg}"

[[ "$backup_dir" == /* && "$backup_dir" != "/" ]] || die "BACKUP_DIR must be an absolute non-root path"
[[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_RETENTION_DAYS must be a positive integer"
[[ -d "$backup_dir" ]] || die "backup directory does not exist: $backup_dir"
[[ "$(stat -c '%a' "$backup_dir")" == "700" ]] || die "backup directory must have mode 0700"
[[ -w "$backup_dir" ]] || die "backup directory is not writable: $backup_dir"
command -v flock >/dev/null 2>&1 || die "flock is required"
command -v node >/dev/null 2>&1 || die "node is required to parse DATABASE_URL securely"
command -v "$pg_dump_bin" >/dev/null 2>&1 || die "pg_dump was not found: $pg_dump_bin"
command -v "$gpg_bin" >/dev/null 2>&1 || die "gpg was not found: $gpg_bin"
"$gpg_bin" --batch --list-keys "$BACKUP_GPG_RECIPIENT" >/dev/null 2>&1 ||
  die "GPG recipient was not found in the keyring"

lock_file="$backup_dir/.totem-bot-backup.lock"
exec 9>"$lock_file"
flock -n 9 || {
  printf 'backup already running; exiting without changes\n' >&2
  exit 0
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_file="$backup_dir/totem-bot-${timestamp}.dump.gpg"
tmp_file=""
pgpass_file="$(mktemp "$backup_dir/.totem-bot-pgpass.XXXXXX")"
pg_env_file="$(mktemp "$backup_dir/.totem-bot-pg-env.XXXXXX")"

cleanup() {
  [[ -z "$tmp_file" ]] || rm -f -- "$tmp_file"
  rm -f -- "$pgpass_file" "$pg_env_file"
}
trap cleanup EXIT

chmod 600 "$pgpass_file" "$pg_env_file"
export PGPASSFILE="$pgpass_file"
export PG_ENV_FILE="$pg_env_file"

# Parse the URL in Node and put only non-secret libpq settings in an env file.
# The password is written to a mode-0600 temporary .pgpass and never appears in argv.
node --input-type=module <<'NODE'
import { chmod, writeFile } from "node:fs/promises";

const raw = process.env.DATABASE_URL;
const passFile = process.env.PGPASSFILE;
const envFile = process.env.PG_ENV_FILE;
if (raw === undefined || passFile === undefined || envFile === undefined) {
  throw new Error("backup connection environment is incomplete");
}

const url = new URL(raw);
if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
  throw new Error("DATABASE_URL must use the PostgreSQL URL scheme");
}
const database = decodeURIComponent(url.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
if (database.length === 0) throw new Error("DATABASE_URL does not contain a database name");

const host = url.hostname;
const port = url.port || "5432";
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const escapePgpass = (value) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

await writeFile(
  passFile,
  `${escapePgpass(host)}:${escapePgpass(port)}:${escapePgpass(database)}:${escapePgpass(user)}:${escapePgpass(password)}\n`,
  { mode: 0o600 },
);
await chmod(passFile, 0o600);

const lines = [
  `export PGHOST=${shellQuote(host)}`,
  `export PGPORT=${shellQuote(port)}`,
  `export PGDATABASE=${shellQuote(database)}`,
  `export PGUSER=${shellQuote(user)}`,
];
const sslMode = url.searchParams.get("sslmode");
if (sslMode !== null) lines.push(`export PGSSLMODE=${shellQuote(sslMode)}`);
await writeFile(envFile, `${lines.join("\n")}\n`, { mode: 0o600 });
await chmod(envFile, 0o600);
NODE

# shellcheck disable=SC1090
source "$pg_env_file"
export PGPASSFILE

tmp_file="$(mktemp "$backup_dir/.totem-bot-${timestamp}.XXXXXX.dump.gpg")"
"$pg_dump_bin" --format=custom --no-owner --no-privileges |
  "$gpg_bin" --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$tmp_file" --encrypt
[[ -s "$tmp_file" ]] || die "encrypted dump is empty"
mv -- "$tmp_file" "$final_file"
tmp_file=""
chmod 600 "$final_file"

# Only files produced by this script are eligible for retention deletion.
find "$backup_dir" -maxdepth 1 -type f -name 'totem-bot-*.dump.gpg' \
  -mtime +"$retention_days" -print -delete
printf 'backup created: %s\n' "$final_file"
