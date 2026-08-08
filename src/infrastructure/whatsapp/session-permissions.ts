import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function ensureSecureAuthDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStats = await stat(directory);
  if ((directoryStats.mode & 0o077) !== 0)
    throw new Error("WhatsApp auth directory permissions must be 0700");
  for (const entry of await readdir(directory)) {
    const file = await stat(join(directory, entry));
    if ((file.mode & 0o077) !== 0) throw new Error("WhatsApp auth file permissions must be 0600");
  }
}
