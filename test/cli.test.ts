import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { describe, it } from "node:test";
import { run, type Io } from "../src/cli.ts";

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
});
