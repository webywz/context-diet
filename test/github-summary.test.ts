import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Readable, Writable } from "node:stream";
import { run, type Io } from "../src/cli.ts";
import { parseArgs } from "../src/parse-args.ts";
import { resolveGithubSummaryPath } from "../src/github-summary.ts";
import { formatGithubSummary, toJsonReport } from "../src/report.ts";
import { diet } from "../src/diet.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class BufferStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk));
    cb();
  }
  toString(): string {
    return this.chunks.join("");
  }
}

function makeIo(opts: {
  stdin?: string;
  tty?: boolean;
  files?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}): { io: Io; stdout: BufferStream; stderr: BufferStream; files: Record<string, string> } {
  const files = { ...(opts.files ?? {}) };
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const stdin = Readable.from([opts.stdin ?? ""]);
  const io: Io = {
    stdin,
    stdout,
    stderr,
    stdinIsTTY: opts.tty ?? false,
    stderrIsTTY: false,
    env: opts.env ?? {},
    readFile: async (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path]!;
    },
    writeFile: async (path, contents) => {
      files[path] = contents;
    },
  };
  return { io, stdout, stderr, files };
}

describe("parseArgs --github-summary", () => {
  it("accepts bare flag", () => {
    const args = parseArgs(["--github-summary", "--demo"]);
    assert.equal(args.githubSummary, true);
    assert.equal(args.demo, true);
  });

  it("accepts =path", () => {
    const args = parseArgs(["--github-summary=out.md", "--demo"]);
    assert.equal(args.githubSummary, "out.md");
  });
});

describe("resolveGithubSummaryPath", () => {
  it("defaults to local file when flag true", () => {
    assert.equal(resolveGithubSummaryPath(true, {}, "/cwd"), join("/cwd", "github-step-summary.md"));
  });
});

describe("formatGithubSummary", () => {
  it("includes char/token savings", () => {
    const result = diet("hello\n\n\n\nhello\nDEBUG noise\n");
    const md = formatGithubSummary(result, "stdin", "0.4.0");
    assert.match(md, /### context-diet/);
    assert.match(md, /Chars/);
    assert.match(md, /Tokens/);
  });
});

describe("CLI --github-summary", () => {
  it("appends markdown via explicit path", async () => {
    const { io, files } = makeIo({
      stdin: "alpha\n\n\n\nbeta\n",
    });
    // appendGithubSummary uses real fs — write to a temp path via flag absolute
    const { mkdtempSync, readFileSync: rf, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "context-diet-gs-"));
    try {
      const out = join(dir, "summary.md");
      const code = await run(["--github-summary", out, "--quiet"], io);
      assert.equal(code, 0);
      const body = rf(out, "utf8");
      assert.match(body, /context-diet/);
      assert.match(body, /Chars/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GITHUB_STEP_SUMMARY env alone appends", async () => {
    const { mkdtempSync, readFileSync: rf, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "context-diet-env-"));
    try {
      const out = join(dir, "from-env.md");
      const { io } = makeIo({
        stdin: "one\n\n\n\ntwo\n",
        env: { GITHUB_STEP_SUMMARY: out },
      });
      const code = await run(["--quiet"], io);
      assert.equal(code, 0);
      assert.match(rf(out, "utf8"), /context-diet/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("examples/github-action.yml mentions --github-summary", () => {
    const yml = readFileSync(join(root, "examples/github-action.yml"), "utf8");
    assert.match(yml, /--github-summary/);
  });
});
