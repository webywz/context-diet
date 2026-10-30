import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("CLI bin", () => {
  it("exposes context-diet as dist/cli.js without a ./ prefix", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    assert.deepEqual(pkg.bin, { "context-diet": "dist/cli.js" });
  });

  it("keeps a node shebang on the CLI source", () => {
    const src = readFileSync(join(root, "src/cli.ts"), "utf8");
    assert.equal(src.startsWith("#!/usr/bin/env node\n"), true);
  });

  it("packs an executable dist/cli.js whose shebang and bin survive npm pack", () => {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });

    const cli = join(root, "dist", "cli.js");
    assert.equal(readFileSync(cli, "utf8").split("\n")[0], "#!/usr/bin/env node");
    assert.equal(statSync(cli).mode & 0o111, 0o111);

    const tarball = execFileSync("npm", ["pack", "--silent"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const tarballPath = join(root, tarball);
    try {
      const packed = JSON.parse(
        execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], {
          encoding: "utf8",
        }),
      ) as { bin?: Record<string, string> };
      assert.deepEqual(packed.bin, { "context-diet": "dist/cli.js" });

      const listing = execFileSync("tar", ["-tvf", tarballPath], { encoding: "utf8" });
      const line = listing.split("\n").find((row) => /package\/dist\/cli\.js$/.test(row));
      assert.ok(line, "package/dist/cli.js must be in the tarball");
      assert.match(line, /^-rwx/);

      const shebang = execFileSync("tar", ["-xOf", tarballPath, "package/dist/cli.js"], {
        encoding: "utf8",
      }).split("\n")[0];
      assert.equal(shebang, "#!/usr/bin/env node");

      const demoListing = listing
        .split("\n")
        .find((row) => /package\/examples\/noisy\.txt$/.test(row));
      assert.ok(demoListing, "package/examples/noisy.txt must be in the tarball for --demo");
    } finally {
      if (existsSync(tarballPath)) unlinkSync(tarballPath);
    }
  });

  it("runs when argv[1] is a symlink to dist/cli.js (npm .bin / npx)", () => {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });

    const cli = join(root, "dist", "cli.js");
    const dir = join(tmpdir(), `context-diet-bin-symlink-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const link = join(dir, "context-diet");
    try {
      symlinkSync(cli, link);
      const out = execFileSync(process.execPath, [link, "-V"], {
        encoding: "utf8",
      });
      assert.match(out.trim(), /^\d+\.\d+\.\d+/);
      assert.notEqual(out.trim(), "");

      const help = execFileSync(process.execPath, [link, "--help"], {
        encoding: "utf8",
      });
      assert.match(help, /context-diet/);
      assert.ok(help.trim().length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
