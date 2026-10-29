import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: { name: string; version: string } | undefined;

export function packageInfo(): { name: string; version: string } {
  if (cached) return cached;
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    name: string;
    version: string;
  };
  cached = { name: pkg.name, version: pkg.version };
  return cached;
}
