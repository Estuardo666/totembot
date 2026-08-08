import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/backup-postgres.sh");
const cronPath = resolve(process.cwd(), "scripts/totem-bot-backup.cron");
const scriptRelativePath = "scripts/backup-postgres.sh";

describe("M6-04 backup artifacts", () => {
  it("keeps the backup script syntactically valid Bash", () => {
    expect(() => execFileSync("bash", ["-n", scriptRelativePath], { stdio: "pipe" })).not.toThrow();
  });

  it("keeps encryption, lock, and scoped retention controls in the script", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("--format=custom");
    expect(script).toContain("--encrypt");
    expect(script).toContain('"$BACKUP_GPG_RECIPIENT"');
    expect(script).toContain("flock -n 9");
    expect(script).toContain("-name 'totem-bot-*.dump.gpg'");
    expect(script).toContain('rm -f -- "$pgpass_file" "$pg_env_file"');
  });

  it("schedules the job daily and loads protected configuration", () => {
    const cron = readFileSync(cronPath, "utf8");

    expect(cron).toContain("0 3 * * * root");
    expect(cron).toContain("CRON_TZ=UTC");
    expect(cron).toContain("NVM_DIR=/home/totembot/.nvm");
    expect(cron).toContain("/opt/totem-bot/shared/.env");
    expect(cron).toContain("/opt/totem-bot/shared/backup.env");
    expect(cron).toContain("backup-postgres.sh");
  });
});
