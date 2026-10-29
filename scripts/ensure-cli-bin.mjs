import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const shebang = "#!/usr/bin/env node\n";
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

let source = readFileSync(cli, "utf8");
if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
if (!source.startsWith(shebang)) {
  source = shebang + source.replace(/^#!.*\r?\n/, "");
  writeFileSync(cli, source);
}
chmodSync(cli, 0o755);
