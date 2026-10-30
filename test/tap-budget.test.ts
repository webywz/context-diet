import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { describe, it } from "node:test";
import { run, type Io } from "../src/cli.ts";
import { parseArgs, UsageError } from "../src/parse-args.ts";
import { toJsonReport } from "../src/report.ts";
import { diet } from "../src/diet.ts";
import { formatTap } from "../src/tap.ts";

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

function makeIo(opts: { stdin?: string; tty?: boolean } = {}): {
  io: Io;
  stdout: BufferStream;
  stderr: BufferStream;
} {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const io: Io = {
    stdin: Readable.from([opts.stdin ?? "hello world\n"]),
    stdout,
    stderr,
    stdinIsTTY: opts.tty ?? false,
    stderrIsTTY: false,
    env: {},
    readFile: async () => "",
    writeFile: async () => {},
  };
  return { io, stdout, stderr };
}

describe("parseArgs --tap", () => {
  it("parses --tap", () => {
    const args = parseArgs(["--tap", "--fail-over-tokens", "100", "-"]);
    assert.equal(args.tap, true);
    assert.equal(args.failOverTokens, 100);
  });

  it("rejects --tap with --json", () => {
    assert.throws(() => parseArgs(["--tap", "--json", "-"]), UsageError);
  });
});

describe("JSON budget field", () => {
  it("includes budget with failOverTokens null when unset", () => {
    const result = diet("alpha\n\n\nbeta\n");
    const json = toJsonReport(result, "stdin");
    assert.equal(json.budget.failOverTokens, null);
    assert.equal(json.budget.outputTokens, result.output.tokens);
    assert.equal(json.budget.ok, true);
  });

  it("marks budget.ok false when over fail-over-tokens", () => {
    const result = diet("alpha beta gamma delta epsilon zeta\n".repeat(20));
    const json = toJsonReport(result, "stdin", 1);
    assert.equal(json.budget.failOverTokens, 1);
    assert.equal(json.budget.ok, false);
    assert.ok(json.budget.outputTokens > 1);
  });
});

describe("formatTap / CLI --tap", () => {
  it("emits TAP ok under budget", () => {
    const result = diet("hi\n");
    const tap = formatTap(result, "stdin", { failOverTokens: 10_000, outputTokens: result.output.tokens });
    assert.match(tap.text, /^TAP version 13/m);
    assert.match(tap.text, /^ok 1 -/m);
    assert.equal(tap.exitCode, 0);
  });

  it("emits not ok when over fail-over-tokens", () => {
    const result = diet("lots of words here for tokens\n".repeat(30));
    const tap = formatTap(result, "stdin", { failOverTokens: 1, outputTokens: result.output.tokens });
    assert.match(tap.text, /^not ok 1 -/m);
    assert.equal(tap.exitCode, 1);
  });

  it("CLI --tap writes TAP and exits 1 over budget", async () => {
    const { io, stdout } = makeIo({
      stdin: "word ".repeat(200),
    });
    const code = await run(["--tap", "--fail-over-tokens", "1"], io);
    assert.equal(code, 1);
    assert.match(stdout.toString(), /^TAP version 13/m);
    assert.match(stdout.toString(), /^not ok 1 -/m);
  });

  it("mentions --tap in help", async () => {
    const { io, stdout } = makeIo({ tty: true });
    const code = await run(["--help"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /--tap/);
  });
});
