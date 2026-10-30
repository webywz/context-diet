import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { run, type Io } from "../src/cli.ts";
import { demoFixturePath } from "../src/package-info.ts";

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
      if (!(path in files)) {
        const err = new Error(`ENOENT: ${path}`);
        throw err;
      }
      return files[path]!;
    },
    writeFile: async (path, contents) => {
      files[path] = contents;
    },
  };
  return { io, stdout, stderr, files };
}

describe("CLI", () => {
  it("prints help", async () => {
    const { io, stdout } = makeIo({ tty: true });
    const code = await run(["--help"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /Usage:/);
  });

  it("prints version", async () => {
    const { io, stdout } = makeIo({ tty: true });
    const code = await run(["--version"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /^\d+\.\d+\.\d+\n$/);
  });

  it("errors when stdin is a TTY and no file is given", async () => {
    const { io, stderr } = makeIo({ tty: true });
    const code = await run([], io);
    assert.equal(code, 1);
    assert.match(stderr.toString(), /No input/);
  });

  it("reads stdin and writes slimmed text to stdout with a report on stderr", async () => {
    const { io, stdout, stderr } = makeIo({
      stdin: "hello\n\n\n\nhello\n",
    });
    const code = await run(["--keep", "headings"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /hello/);
    assert.match(stderr.toString(), /context-diet/);
    assert.match(stderr.toString(), /tokens:/);
  });

  it("emits JSON including text when --json is set", async () => {
    const { io, stdout, stderr } = makeIo({
      stdin: "alpha\n\n\nbeta\n",
    });
    const code = await run(["--json"], io);
    assert.equal(code, 0);
    assert.equal(stderr.toString(), "");
    const payload = JSON.parse(stdout.toString()) as {
      text: string;
      output: { tokens: number };
      ok: boolean;
    };
    assert.equal(payload.ok, true);
    assert.match(payload.text, /alpha/);
    assert.ok(payload.output.tokens > 0);
  });

  it("writes slimmed text to -o and keeps stdout empty unless --json", async () => {
    const { io, stdout, files } = makeIo({
      stdin: "one\n\n\n\ntwo\n",
    });
    const code = await run(["-o", "slim.txt", "--quiet"], io);
    assert.equal(code, 0);
    assert.equal(stdout.toString(), "");
    assert.match(files["slim.txt"] ?? "", /one/);
  });

  it("reads a named file", async () => {
    const { io, stdout } = makeIo({
      files: { "in.txt": "keep me\n\n\nkeep me\n" },
      tty: true,
    });
    const code = await run(["in.txt", "--quiet"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /keep me/);
  });

  it("fails deepen without keys", async () => {
    const { io, stderr } = makeIo({ stdin: "hello world\n", env: {} });
    const code = await run(["--deepen"], io);
    assert.equal(code, 2);
    assert.match(stderr.toString(), /OPENAI_API_KEY|ANTHROPIC_API_KEY|API key/);
  });

  it("rejects unknown flags with help", async () => {
    const { io, stderr } = makeIo({ tty: true });
    const code = await run(["--nope"], io);
    assert.equal(code, 1);
    assert.match(stderr.toString(), /Unknown option/);
    assert.match(stderr.toString(), /Usage:/);
  });

  it("supports --dry-run (report only, empty stdout)", async () => {
    const { io, stdout, stderr } = makeIo({
      stdin: "alpha\n\n\nbeta\n",
    });
    const code = await run(["--dry-run"], io);
    assert.equal(code, 0);
    assert.equal(stdout.toString(), "");
    assert.match(stderr.toString(), /context-diet/);
    assert.match(stderr.toString(), /tokens:/);
  });

  it("supports --preset logs and --diff on stderr", async () => {
    const { io, stdout, stderr } = makeIo({
      stdin: [
        "[2026-01-01 00:00:00] DEBUG loading config",
        "[2026-01-01 00:00:01] DEBUG loading config",
        "[2026-01-01 00:00:02] DEBUG loading config",
        "[2026-01-01 00:00:03] ERROR boom",
        "",
      ].join("\n"),
      env: { NO_COLOR: "1" },
    });
    const code = await run(["--preset", "logs", "--diff", "--quiet"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /ERROR boom/);
    assert.match(stderr.toString(), /^diff /m);
  });

  it("does not write -o when --dry-run is set", async () => {
    const { io, files } = makeIo({
      stdin: "one\n\n\n\ntwo\n",
    });
    const code = await run(["-o", "slim.txt", "--dry-run", "--quiet"], io);
    assert.equal(code, 0);
    assert.equal(files["slim.txt"], undefined);
  });

  it("supports --demo: exit 0 and output smaller than fixture", async () => {
    const fixturePath = demoFixturePath();
    const fixture = readFileSync(fixturePath, "utf8");
    const { io, stdout, stderr } = makeIo({
      files: { [fixturePath]: fixture },
      tty: true,
      env: { NO_COLOR: "1" },
    });
    const code = await run(
      ["--demo", "--preset", "logs", "--max-tokens", "400"],
      io,
    );
    assert.equal(code, 0);
    const body = stdout.toString();
    assert.ok(body.length > 0, "expected slimmed body on stdout");
    assert.ok(
      body.length < fixture.length,
      `output (${body.length}) should be smaller than fixture (${fixture.length})`,
    );
    assert.match(stderr.toString(), /context-diet/);
    assert.match(stderr.toString(), /--demo|examples\/noisy\.txt/);
  });

  it("rejects --demo together with a file path", async () => {
    const { io, stderr } = makeIo({ tty: true });
    const code = await run(["--demo", "in.txt"], io);
    assert.equal(code, 1);
    assert.match(stderr.toString(), /--demo or a file path/);
  });

});

describe("CLI --redact / --fail-over-tokens", () => {
  it("redacts secrets with --redact", async () => {
    const { io, stdout, stderr } = makeIo({
      stdin: "hello sk-abcdefghijklmnopqrstuvwxyz12 world\n",
    });
    const code = await run(["--redact", "--json"], io);
    assert.equal(code, 0);
    const payload = JSON.parse(stdout.toString()) as {
      text: string;
      cuts: { secretsRedacted: number };
    };
    assert.ok(payload.cuts.secretsRedacted >= 1);
    assert.doesNotMatch(payload.text, /sk-abcdefgh/);
    assert.match(payload.text, /\[redacted\]/);
    assert.equal(stderr.toString(), "");
  });

  it("fails when output tokens exceed --fail-over-tokens", async () => {
    const { io, stderr } = makeIo({
      stdin: "alpha beta gamma delta epsilon zeta eta theta\n".repeat(20),
    });
    const code = await run(["--fail-over-tokens", "5", "--quiet"], io);
    assert.equal(code, 1);
    assert.match(stderr.toString(), /fail-over-tokens/);
    assert.match(stderr.toString(), /exceed/);
  });

  it("passes when output tokens equal --fail-over-tokens (strict >)", async () => {
    // Use a tiny input; estimate tokens then set gate to that exact number.
    const { io: probeIo, stdout: probeOut } = makeIo({
      stdin: "Just the facts.\n",
    });
    await run(["--json", "--quiet"], probeIo);
    const tokens = (JSON.parse(probeOut.toString()) as { output: { tokens: number } })
      .output.tokens;
    const { io, stderr } = makeIo({
      stdin: "Just the facts.\n",
    });
    const code = await run(
      ["--fail-over-tokens", String(tokens), "--quiet"],
      io,
    );
    assert.equal(code, 0);
    assert.equal(stderr.toString(), "");
  });

  it("mentions --redact and --fail-over-tokens in --help", async () => {
    const { io, stdout } = makeIo({ tty: true });
    const code = await run(["--help"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /--redact/);
    assert.match(stdout.toString(), /--fail-over-tokens/);
  });
});
