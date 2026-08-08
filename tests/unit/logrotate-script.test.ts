import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/configure-pm2-logrotate.sh");

describe("M6-05 log rotation artifact", () => {
  it("keeps the configuration script syntactically valid Bash", () => {
    expect(() =>
      execFileSync("bash", ["-n", "scripts/configure-pm2-logrotate.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("pins the module and configures safe daily rotation", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("pm2-logrotate@3.0.0");
    expect(script).toContain("pm2-logrotate:max_size 20M");
    expect(script).toContain("pm2-logrotate:retain 14");
    expect(script).toContain("pm2-logrotate:compress true");
    expect(script).toContain('pm2-logrotate:rotateInterval "0 0 * * *"');
    expect(script).toContain("pm2-logrotate:TZ UTC");
    expect(script).toContain("pm2-logrotate:rotateModule true");
  });
});
