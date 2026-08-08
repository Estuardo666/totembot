#!/usr/bin/env bash
set -Eeuo pipefail

# M6-05: configure PM2 log rotation for the totembot user.
# Run this on the production host only after the owner has approved deployment.

die() {
  printf 'logrotate configuration error: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage: configure-pm2-logrotate.sh

Installs and configures the pinned pm2-logrotate module for the current PM2 user.
The command must run as the same user that owns the PM2 daemon (totembot).

Optional environment:
  PM2_BIN                  PM2 executable (default: pm2)
  PM2_LOGROTATE_PACKAGE    Package spec (default: pm2-logrotate@3.0.0)
USAGE
  exit 0
fi

[[ $# -eq 0 ]] || die "unknown argument: $1"

pm2_bin="${PM2_BIN:-pm2}"
module_package="${PM2_LOGROTATE_PACKAGE:-pm2-logrotate@3.0.0}"
command -v "$pm2_bin" >/dev/null 2>&1 || die "PM2 was not found: $pm2_bin"

"$pm2_bin" install "$module_package"
"$pm2_bin" set pm2-logrotate:max_size 20M
"$pm2_bin" set pm2-logrotate:retain 14
"$pm2_bin" set pm2-logrotate:compress true
"$pm2_bin" set pm2-logrotate:rotateInterval "0 0 * * *"
"$pm2_bin" set pm2-logrotate:workerInterval 30
"$pm2_bin" set pm2-logrotate:dateFormat "YYYY-MM-DD_HH-mm-ss"
"$pm2_bin" set pm2-logrotate:TZ UTC
"$pm2_bin" set pm2-logrotate:rotateModule true

printf 'pm2-logrotate configuration:\n'
"$pm2_bin" conf
