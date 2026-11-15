import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { run, type Io } from "../src/cli.js";

function mockIo(): Io & { output: string; error: string } {
  const chunks: string[] = [];
  const errChunks: string[] = [];
  return {
    stdin: process.stdin,
    stdout: {
      write: (chunk: string, _enc?: unknown, cb?: (err?: Error | null) => void) => {
        chunks.push(String(chunk));
        if (typeof cb === "function") cb();
        return true;
      },
    } as Io["stdout"],
    stderr: {
      write: (chunk: string, _enc?: unknown, cb?: (err?: Error | null) => void) => {
        errChunks.push(String(chunk));
        if (typeof cb === "function") cb();
        return true;
      },
    } as Io["stderr"],
    stdinIsTTY: false,
    stderrIsTTY: false,
    env: {},
    readFile: async (path: string) => {
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf8");
    },
    writeFile: async (path: string, contents: string) => {
      const fs = await import("node:fs/promises");
      return fs.writeFile(path, contents, "utf8");
    },
    get output() {
      return chunks.join("");
    },
    get error() {
      return errChunks.join("");
    },
  };
}

/** Pin .git here so a parent checkout's .gitignore cannot affect the fixture. */
async function anchorGit(dir: string): Promise<void> {
  await writeFile(join(dir, ".git"), "");
}

function relSources(root: string, sources: string[]): string[] {
  return sources.map((source) => relative(root, source));
}

describe("recursive directory scan", { timeout: 20_000 }, () => {
  it("stays top-level unless --recursive or -R is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "context-diet-rec-top-"));
    try {
      await anchorGit(dir);
      await mkdir(join(dir, "a"));
      await mkdir(join(dir, "m"));
      await writeFile(join(dir, "z.txt"), "z\n");
      await writeFile(join(dir, "a.txt"), "a\n");
      await writeFile(join(dir, "a", "b.txt"), "ab\n");
      await writeFile(join(dir, "m", "b.txt"), "mb\n");
      await writeFile(join(dir, "m", "a.txt"), "ma\n");

      const top = mockIo();
      assert.equal(await run([dir, "--json"], top), 0);
      assert.deepEqual(relSources(dir, JSON.parse(top.output).sources), ["a.txt", "z.txt"]);

      for (const flag of ["--recursive", "-R"]) {
        const nested = mockIo();
        assert.equal(await run([dir, flag, "--json"], nested), 0);
        assert.deepEqual(relSources(dir, JSON.parse(nested.output).sources), [
          "a.txt",
          "a/b.txt",
          "m/a.txt",
          "m/b.txt",
          "z.txt",
        ]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps each directory's files sorted and directories in argv order", async () => {
    const parent = await mkdtemp(join(tmpdir(), "context-diet-rec-order-"));
    const dirB = join(parent, "b-dir");
    const dirA = join(parent, "a-dir");
    try {
      await mkdir(join(dirB, "sub"), { recursive: true });
      await mkdir(dirA, { recursive: true });
      await anchorGit(dirB);
      await anchorGit(dirA);
      await writeFile(join(dirB, "b.txt"), "b\n");
      await writeFile(join(dirB, "sub", "a.txt"), "ba\n");
      await writeFile(join(dirA, "z.txt"), "z\n");
      await writeFile(join(dirA, "a.txt"), "a\n");

      const io = mockIo();
      assert.equal(await run([dirB, dirA, "--recursive", "--json"], io), 0);
      assert.deepEqual(relSources(parent, JSON.parse(io.output).sources), [
        "b-dir/b.txt",
        "b-dir/sub/a.txt",
        "a-dir/a.txt",
        "a-dir/z.txt",
      ]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("does not treat an explicit file as a directory when --recursive is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "context-diet-rec-file-"));
    try {
      const file = join(dir, "note.txt");
      await writeFile(file, "hello note\n");
      const io = mockIo();
      assert.equal(await run([file, "--recursive", "--json"], io), 0);
      assert.deepEqual(JSON.parse(io.output).sources, [file]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors when a directory only has nested files, unless --recursive is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "context-diet-rec-empty-"));
    try {
      await anchorGit(dir);
      await mkdir(join(dir, "sub"));
      await writeFile(join(dir, "sub", "only.txt"), "nested\n");

      const top = mockIo();
      assert.equal(await run([dir, "--json"], top), 1);
      assert.match(top.error, /no readable files/);

      const nested = mockIo();
      assert.equal(await run([dir, "--recursive", "--json"], nested), 0);
      assert.deepEqual(relSources(dir, JSON.parse(nested.output).sources), ["sub/only.txt"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies include, exclude, gitignore, and default skips to the nested set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "context-diet-rec-filter-"));
    try {
      await anchorGit(dir);
      await writeFile(join(dir, ".gitignore"), "*.log\nvendor/\n");
      await mkdir(join(dir, "src"));
      await mkdir(join(dir, "src", ".git"), { recursive: true });
      await mkdir(join(dir, "nested", "deep"), { recursive: true });
      await mkdir(join(dir, ".hidden"), { recursive: true });
      await mkdir(join(dir, "vendor"), { recursive: true });
      await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
      await writeFile(join(dir, "keep.txt"), "keep\n");
      await writeFile(join(dir, "noise.log"), "log\n");
      await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
      await writeFile(join(dir, "src", "app.ts"), "export const app = 1;\n");
      await writeFile(join(dir, "src", "app.test.ts"), "export const t = 1;\n");
      await writeFile(join(dir, "src", "noise.log"), "log\n");
      await writeFile(join(dir, "src", ".git", "HEAD"), "ref: refs/heads/main\n");
      await writeFile(join(dir, "nested", "deep", "code.ts"), "export const code = 1;\n");
      await writeFile(join(dir, ".hidden", "nope.txt"), "hidden\n");
      await writeFile(join(dir, "vendor", "lib.js"), "export const lib = 1;\n");
      await writeFile(join(dir, "node_modules", "pkg", "index.js"), "module.exports = 1;\n");

      const ignored = mockIo();
      assert.equal(await run([dir, "--recursive", "--json"], ignored), 0);
      assert.deepEqual(relSources(dir, JSON.parse(ignored.output).sources), [
        "a.ts",
        "keep.txt",
        "nested/deep/code.ts",
        "src/app.test.ts",
        "src/app.ts",
      ]);

      const filtered = mockIo();
      assert.equal(
        await run(
          [dir, "-R", "--include", "**/*.ts", "--exclude", "*.test.ts", "--json"],
          filtered,
        ),
        0,
      );
      assert.deepEqual(relSources(dir, JSON.parse(filtered.output).sources), [
        "a.ts",
        "nested/deep/code.ts",
        "src/app.ts",
      ]);

      const star = mockIo();
      assert.equal(await run([dir, "--recursive", "--include", "*.ts", "--json"], star), 0);
      assert.deepEqual(relSources(dir, JSON.parse(star.output).sources), ["a.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("enforces --max-files after recursive selection, including across directories", async () => {
    const parent = await mkdtemp(join(tmpdir(), "context-diet-rec-max-"));
    const dirA = join(parent, "a");
    const dirB = join(parent, "b");
    try {
      await mkdir(join(dirA, "sub"), { recursive: true });
      await mkdir(join(dirB, "sub"), { recursive: true });
      await anchorGit(dirA);
      await anchorGit(dirB);
      await writeFile(join(dirA, "top.txt"), "a\n");
      await writeFile(join(dirA, "sub", "nested.txt"), "a2\n");
      await writeFile(join(dirB, "top.txt"), "b\n");
      await writeFile(join(dirB, "sub", "nested.txt"), "b2\n");

      const top = mockIo();
      assert.equal(await run([dirA, dirB, "--max-files", "2", "--json"], top), 0);
      assert.deepEqual(relSources(parent, JSON.parse(top.output).sources), ["a/top.txt", "b/top.txt"]);

      const over = mockIo();
      assert.equal(await run([dirA, dirB, "--recursive", "--max-files", "3"], over), 3);
      assert.match(over.error, /would process 4 files/);
      assert.match(over.error, /exceeding --max-files 3/);

      const exact = mockIo();
      assert.equal(
        await run([dirA, dirB, "--recursive", "--max-files", "4", "--json"], exact),
        0,
      );
      assert.equal(JSON.parse(exact.output).sources.length, 4);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("does not follow directory symlinks that loop or point outside", async () => {
    const parent = await mkdtemp(join(tmpdir(), "context-diet-rec-symlink-"));
    const dir = join(parent, "root");
    const outside = join(parent, "outside");
    try {
      await mkdir(join(dir, "real"), { recursive: true });
      await mkdir(outside, { recursive: true });
      await anchorGit(dir);
      await writeFile(join(dir, "real", "a.txt"), "real file\n");
      await writeFile(join(outside, "secret.txt"), "dir-symlink-sentinel\n");
      await symlink(join(dir, "real"), join(dir, "alias"));
      await symlink(dir, join(dir, "up"));
      await symlink("loop", join(dir, "loop"));
      await symlink(outside, join(dir, "out"));

      const io = mockIo();
      assert.equal(await run([dir, "--recursive", "--max-files", "10", "--json"], io), 0);
      const report = JSON.parse(io.output) as { sources: string[]; text: string };
      assert.deepEqual(relSources(dir, report.sources), ["real/a.txt"]);
      assert.equal(report.text.includes("dir-symlink-sentinel"), false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("still reads a file symlink and scans an explicit directory symlink", async () => {
    const parent = await mkdtemp(join(tmpdir(), "context-diet-rec-link-root-"));
    const real = join(parent, "real");
    const link = join(parent, "link");
    const outside = join(parent, "outside");
    try {
      await mkdir(join(real, "sub"), { recursive: true });
      await mkdir(outside, { recursive: true });
      await anchorGit(real);
      await writeFile(join(real, "top.txt"), "top\n");
      await writeFile(join(real, "sub", "nested.txt"), "nested\n");
      await writeFile(join(outside, "secret.txt"), "file-symlink-sentinel\n");
      await symlink(join(real, "sub"), join(real, "inner"));
      await symlink(join(outside, "secret.txt"), join(real, "linked.txt"));
      await symlink(real, link);

      const fileLink = mockIo();
      assert.equal(await run([real, "--recursive", "--json"], fileLink), 0);
      const fromReal = JSON.parse(fileLink.output) as { sources: string[]; text: string };
      assert.deepEqual(relSources(real, fromReal.sources), [
        "linked.txt",
        "sub/nested.txt",
        "top.txt",
      ]);
      assert.match(fromReal.text, /file-symlink-sentinel/);
      assert.equal(fromReal.sources.some((source) => source.includes(`${join("inner", "nested.txt")}`)), false);

      const viaLink = mockIo();
      assert.equal(await run([link, "-R", "--json"], viaLink), 0);
      assert.deepEqual(relSources(link, JSON.parse(viaLink.output).sources), [
        "linked.txt",
        "sub/nested.txt",
        "top.txt",
      ]);

      const topOnly = mockIo();
      assert.equal(await run([link, "--json"], topOnly), 0);
      assert.deepEqual(relSources(link, JSON.parse(topOnly.output).sources), [
        "linked.txt",
        "top.txt",
      ]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("documents the opt-in scan in --help", async () => {
    const io = mockIo();
    assert.equal(await run(["--help"], io), 0);
    assert.match(io.output, /-R, --recursive/);
    assert.match(io.output, /default: top-level only/);
    assert.match(io.output, /Directory symlinks are not followed/);
    assert.match(io.output, /\*\*\/\*\.ts/);
    assert.match(io.output, /--max-files counts selected files after filters/);
  });
});
