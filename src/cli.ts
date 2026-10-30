#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dietAsync } from "./diet.js";
import { DeepenError } from "./llm.js";
import { demoFixturePath, packageInfo } from "./package-info.js";
import { HELP_TEXT, parseArgs, UsageError, type CliArgs } from "./parse-args.js";
import {
  formatHumanReport,
  formatRemovedDiff,
  shouldUseColor,
  toJsonReport,
} from "./report.js";

export interface Io {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  stdinIsTTY: boolean | undefined;
  stderrIsTTY?: boolean | undefined;
  env: NodeJS.ProcessEnv;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, contents: string) => Promise<void>;
}

const defaultIo = (): Io => ({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  stdinIsTTY: process.stdin.isTTY,
  stderrIsTTY: process.stderr.isTTY,
  env: process.env,
  readFile: (path) => readFile(path, "utf8"),
  writeFile: (path, contents) => writeFile(path, contents, "utf8"),
});

function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer | string) => {
      chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

async function readInput(args: CliArgs, io: Io): Promise<{ text: string; source: string }> {
  if (args.demo) {
    const path = demoFixturePath();
    try {
      const text = await io.readFile(path);
      return { text, source: "examples/noisy.txt (--demo)" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsageError(`Cannot read bundled demo fixture: ${msg}`);
    }
  }

  if (args.file && args.file !== "-") {
    try {
      const text = await io.readFile(args.file);
      return { text, source: args.file };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsageError(`Cannot read ${args.file}: ${msg}`);
    }
  }

  const useStdin = !args.file || args.file === "-";
  if (useStdin && io.stdinIsTTY) {
    throw new UsageError(
      "No input. Pass a file path, pipe stdin, use `--demo`, or `-` with redirected input.",
    );
  }
  const text = await readStream(io.stdin);
  return { text, source: "stdin" };
}

function writeOut(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  return new Promise((resolveWrite, reject) => {
    stream.write(chunk, "utf8", (err) => {
      if (err) reject(err);
      else resolveWrite();
    });
  });
}

export async function run(argv: string[], io: Io = defaultIo()): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      await writeOut(io.stderr, `${err.message}\n\n${HELP_TEXT}`);
      return 1;
    }
    throw err;
  }

  const { version } = packageInfo();

  if (args.help) {
    await writeOut(io.stdout, HELP_TEXT);
    return 0;
  }
  if (args.version) {
    await writeOut(io.stdout, `${version}\n`);
    return 0;
  }

  let source: string;
  let text: string;
  try {
    const input = await readInput(args, io);
    source = input.source;
    text = input.text;
  } catch (err) {
    if (err instanceof UsageError) {
      await writeOut(io.stderr, `${err.message}\n`);
      return 1;
    }
    throw err;
  }

  let result;
  try {
    result = await dietAsync(text, {
      maxTokens: args.maxTokens,
      keep: args.keep,
      preset: args.preset,
      deepen: args.deepen,
      provider: args.provider,
      env: io.env,
    });
  } catch (err) {
    if (err instanceof DeepenError) {
      await writeOut(io.stderr, `${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const json = toJsonReport(result, source);
  const color = shouldUseColor(io.env, io.stderrIsTTY);
  const style = { color };

  if (args.output && !args.dryRun) {
    await io.writeFile(args.output, result.text);
  }

  if (args.json) {
    const payload = args.dryRun
      ? { ...json, text: undefined, dryRun: true }
      : args.output
        ? { ...json, text: undefined, outputPath: args.output }
        : json;
    await writeOut(io.stdout, `${JSON.stringify(payload, null, 2)}\n`);
  } else if (!args.dryRun && !args.output) {
    await writeOut(io.stdout, result.text);
  }

  // --json is the machine report; skip the human summary (unless quiet already).
  if (!args.json && !args.quiet) {
    await writeOut(io.stderr, formatHumanReport(result, source, version, style));
  }
  if (args.diff) {
    await writeOut(io.stderr, formatRemovedDiff(text, result.text, style));
  }

  return 0;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const self = fileURLToPath(import.meta.url);
    const resolved = isAbsolute(entry) ? entry : resolve(entry);
    return self === resolved;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      process.stderr.write(`${msg}\n`);
      process.exitCode = 1;
    },
  );
}
