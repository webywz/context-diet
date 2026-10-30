import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Readable, Writable } from "node:stream";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, type Io } from "../src/cli.ts";
import { diet } from "../src/diet.ts";
import { escapeHtml, formatHtmlReport } from "../src/html-report.ts";
import { parseArgs } from "../src/parse-args.ts";

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

describe("escapeHtml", () => {
  it("escapes markup", () => {
    assert.equal(escapeHtml("<x>&\"'"), "&lt;x&gt;&amp;&quot;&#39;");
  });
});

describe("formatHtmlReport", () => {
  it("emits self-contained diet stats and previews", () => {
    const original = "hello\n<script>alert(1)</script>\nkeep me\nhello\n";
    const result = diet(original, { maxTokens: 50 });
    const html = formatHtmlReport(result, "xss.txt", {
      original,
      version: "0.5.0",
    });
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /context-diet/);
    assert.match(html, /0\.5\.0/);
    assert.match(html, /chars/);
    assert.match(html, /Cuts/);
    assert.match(html, /Kept \/ after/);
    assert.doesNotMatch(html, /cdn\.|unpkg|jsdelivr/i);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert/);
  });
});

describe("parseArgs --html", () => {
  it("requires a path", () => {
    assert.throws(() => parseArgs(["--html"]), /--html requires a value/);
  });

  it("accepts --html path and --html=path", () => {
    assert.equal(parseArgs(["--html", "out.html", "--demo"]).html, "out.html");
    assert.equal(parseArgs(["--html=out.html", "--demo"]).html, "out.html");
  });
});

describe("CLI --html", () => {
  it("writes HTML while still emitting slimmed body", async () => {
    const { io, stdout, files } = makeIo({
      stdin: "AAA\n\n\nBBB\nAAA\n",
    });
    const code = await run(["-", "--html", "diet.html", "-q"], io);
    assert.equal(code, 0);
    assert.ok(stdout.toString().length > 0);
    assert.ok(files["diet.html"]);
    assert.match(files["diet.html"]!, /<!DOCTYPE html>/i);
    assert.match(files["diet.html"]!, /context-diet/);
  });

  it("help mentions --html", async () => {
    const { io, stdout } = makeIo({});
    const code = await run(["--help"], io);
    assert.equal(code, 0);
    assert.match(stdout.toString(), /--html/);
  });
});
