import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { run, type Io } from "../src/cli.js";

function mockIo(): Io & { output: string; error: string } {
  const chunks: string[] = [];
  const errChunks: string[] = [];
  return {
    stdin: process.stdin,
    stdout: {
      write: (chunk: string, enc: any, cb?: any) => {
        chunks.push(chunk);
        if (typeof cb === "function") cb();
        return true;
      },
    } as any,
    stderr: {
      write: (chunk: string, enc: any, cb?: any) => {
        errChunks.push(chunk);
        if (typeof cb === "function") cb();
        return true;
      },
    } as any,
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

describe("--include filter", () => {
  it("only includes files matching at least one include glob", async () => {
    const testDir = join(tmpdir(), `context-diet-include-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "file1.ts"), "typescript content");
    await writeFile(join(testDir, "file2.js"), "javascript content");
    await writeFile(join(testDir, "file3.txt"), "text content");
    await writeFile(join(testDir, "README.md"), "markdown content");

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--include", "*.ts", "--include", "*.js", "--json"], io);
      
      assert.equal(exitCode, 0);
      const output = JSON.parse(io.output);
      assert.equal(output.sources.length, 2);
      assert.ok(output.sources.some((s: string) => s.includes("file1.ts")));
      assert.ok(output.sources.some((s: string) => s.includes("file2.js")));
      assert.ok(!output.sources.some((s: string) => s.includes("file3.txt")));
      assert.ok(!output.sources.some((s: string) => s.includes("README.md")));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("include works with exclude", async () => {
    const testDir = join(tmpdir(), `context-diet-include-exclude-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "app.ts"), "app typescript");
    await writeFile(join(testDir, "test.ts"), "test typescript");
    await writeFile(join(testDir, "app.js"), "app javascript");

    try {
      const io = mockIo();
      const exitCode = await run(
        [testDir, "--include", "*.ts", "--include", "*.js", "--exclude", "test*", "--json"],
        io,
      );
      
      assert.equal(exitCode, 0);
      const output = JSON.parse(io.output);
      assert.equal(output.sources.length, 2);
      assert.ok(output.sources.some((s: string) => s.includes("app.ts")));
      assert.ok(output.sources.some((s: string) => s.includes("app.js")));
      assert.ok(!output.sources.some((s: string) => s.includes("test.ts")));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("no files match include results in error", async () => {
    const testDir = join(tmpdir(), `context-diet-include-nomatch-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "file.txt"), "text content");

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--include", "*.ts"], io);
      
      assert.equal(exitCode, 1);
      assert.ok(io.error.includes("no readable files"));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});

describe("--max-files limit", () => {
  it("exits 3 when file count exceeds max-files", async () => {
    const testDir = join(tmpdir(), `context-diet-maxfiles-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
      await writeFile(join(testDir, `file${i}.txt`), `content ${i}`);
    }

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--max-files", "3"], io);
      
      assert.equal(exitCode, 3);
      assert.ok(io.error.includes("would process 5 files"));
      assert.ok(io.error.includes("exceeding --max-files 3"));
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("succeeds when file count equals max-files", async () => {
    const testDir = join(tmpdir(), `context-diet-maxfiles-eq-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "file1.txt"), "content 1");
    await writeFile(join(testDir, "file2.txt"), "content 2");

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--max-files", "2", "--json"], io);
      
      assert.equal(exitCode, 0);
      const output = JSON.parse(io.output);
      assert.equal(output.sources.length, 2);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("max-files applies after filters", async () => {
    const testDir = join(tmpdir(), `context-diet-maxfiles-filter-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    for (let i = 1; i <= 10; i++) {
      await writeFile(join(testDir, `file${i}.txt`), `content ${i}`);
    }
    for (let i = 1; i <= 3; i++) {
      await writeFile(join(testDir, `test${i}.ts`), `test ${i}`);
    }

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--include", "*.ts", "--max-files", "5", "--json"], io);
      
      assert.equal(exitCode, 0);
      const output = JSON.parse(io.output);
      assert.equal(output.sources.length, 3);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("max-files with exclude reduces file count", async () => {
    const testDir = join(tmpdir(), `context-diet-maxfiles-exclude-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
      await writeFile(join(testDir, `file${i}.txt`), `content ${i}`);
    }
    for (let i = 1; i <= 3; i++) {
      await writeFile(join(testDir, `skip${i}.txt`), `skip ${i}`);
    }

    try {
      const io = mockIo();
      const exitCode = await run([testDir, "--exclude", "skip*", "--max-files", "10", "--json"], io);
      
      assert.equal(exitCode, 0);
      const output = JSON.parse(io.output);
      assert.equal(output.sources.length, 5);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});

describe("parse args for include and max-files", () => {
  it("parses multiple --include flags", async () => {
    const io = mockIo();
    const exitCode = await run(["--demo", "--include", "*.ts", "--include", "*.js", "--json"], io);
    assert.equal(exitCode, 0);
  });

  it("parses --max-files with valid number", async () => {
    const io = mockIo();
    const exitCode = await run(["--demo", "--max-files", "100", "--json"], io);
    assert.equal(exitCode, 0);
  });

  it("rejects --max-files with invalid number", async () => {
    const io = mockIo();
    const exitCode = await run(["--demo", "--max-files", "abc"], io);
    assert.equal(exitCode, 1);
    assert.ok(io.error.includes("expects a positive integer"));
  });

  it("rejects --max-files with zero", async () => {
    const io = mockIo();
    const exitCode = await run(["--demo", "--max-files", "0"], io);
    assert.equal(exitCode, 1);
    assert.ok(io.error.includes("expects a positive integer"));
  });
});
