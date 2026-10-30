#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dietAsync } from "./diet.js";
import { DeepenError } from "./llm.js";
import { demoFixturePath, packageInfo } from "./package-info.js";
import { HELP_TEXT, parseArgs, UsageError, type CliArgs } from "./parse-args.js";
import {
  appendGithubSummary,
  resolveGithubSummaryPath,
} from "./github-summary.js";
import { formatHtmlReport } from "./html-report.js";
import {
  formatGithubSummary,
  formatHumanReport,
  formatRemovedDiff,
  shouldUseColor,
  toJsonReport,
} from "./report.js";
import { formatTap } from "./tap.js";
import { formatSarif } from "./sarif.js";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

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

async function expandInputs(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    // Virtual test FS / missing paths: treat as files; io.readFile surfaces errors.
    // Only expand when a real directory exists on disk.
    let isDir = false;
    try {
      isDir = (await stat(path)).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) {
      let entries;
      try {
        entries = await readdir(path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new UsageError(`Cannot read directory ${path}: ${msg}`);
      }
      const candidates = entries
        .filter((name) => !name.startsWith("."))
        .map((name) => join(path, name))
        .sort();
      let added = 0;
      for (const file of candidates) {
        try {
          const st = await stat(file);
          if (st.isFile()) {
            out.push(file);
            added += 1;
          }
        } catch {
          // skip unreadable entries
        }
      }
      if (added === 0) {
        throw new UsageError(`Directory ${path} has no readable files`);
      }
    } else {
      out.push(path);
    }
  }
  if (out.length === 0) {
    throw new UsageError("No input files found");
  }
  return out;
}

async function readInput(
  args: CliArgs,
  io: Io,
): Promise<{ text: string; source: string; sources: string[] }> {
  if (args.demo) {
    const path = demoFixturePath();
    try {
      const text = await io.readFile(path);
      return {
        text,
        source: "examples/noisy.txt (--demo)",
        sources: ["examples/noisy.txt (--demo)"],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsageError(`Cannot read bundled demo fixture: ${msg}`);
    }
  }

  const useStdin = args.files.length === 0 || (args.files.length === 1 && args.files[0] === "-");
  if (useStdin) {
    if (io.stdinIsTTY) {
      throw new UsageError(
        "No input. Pass file/dir paths, pipe stdin, use `--demo`, or `-` with redirected input.",
      );
    }
    const text = await readStream(io.stdin);
    return { text, source: "stdin", sources: ["stdin"] };
  }

  const files = await expandInputs(args.files);
  const chunks: string[] = [];
  for (const file of files) {
    try {
      const body = await io.readFile(file);
      if (files.length === 1) {
        chunks.push(body);
      } else {
        chunks.push(`--- file: ${file} ---\n${body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UsageError(`Cannot read ${file}: ${msg}`);
    }
  }
  const text = chunks.join("\n\n");
  const source = files.length === 1 ? files[0]! : `${files.length} files`;
  return { text, source, sources: files };
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
  let sources: string[];
  try {
    const input = await readInput(args, io);
    source = input.source;
    text = input.text;
    sources = input.sources;
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
      redact: args.redact,
      env: io.env,
    });
  } catch (err) {
    if (err instanceof DeepenError) {
      await writeOut(io.stderr, `${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const json = toJsonReport(result, source, args.failOverTokens, {
    maxTokens: args.maxTokens,
    sources,
  });
  const color = shouldUseColor(io.env, io.stderrIsTTY);
  const style = { color };

  if (args.output && !args.dryRun) {
    await io.writeFile(args.output, result.text);
  }

  if (args.html) {
    const html = formatHtmlReport(result, source, {
      original: text,
      version,
    });
    await io.writeFile(args.html, html);
  }

  if (args.sarif) {
    try {
      await io.writeFile(
        args.sarif,
        formatSarif(result, source, version, {
          failOverTokens: args.failOverTokens,
          maxTokens: args.maxTokens,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeOut(io.stderr, `context-diet: could not write sarif: ${msg}\n`);
      return 1;
    }
  }

  let tapExit: number | undefined;
  if (args.tap) {
    const tap = formatTap(result, source, {
      failOverTokens: args.failOverTokens,
      outputTokens: result.output.tokens,
    });
    await writeOut(io.stdout, tap.text);
    tapExit = tap.exitCode;
  } else if (args.json) {
    const payload = args.dryRun
      ? { ...json, text: undefined, dryRun: true }
      : args.output
        ? { ...json, text: undefined, outputPath: args.output }
        : json;
    await writeOut(io.stdout, `${JSON.stringify(payload, null, 2)}\n`);
  } else if (!args.dryRun && !args.output) {
    await writeOut(io.stdout, result.text);
  }

  // --json / --tap are machine reports; skip the human summary (unless quiet already).
  if (!args.json && !args.tap && !args.quiet) {
    await writeOut(io.stderr, formatHumanReport(result, source, version, style));
  }
  if (args.diff) {
    await writeOut(io.stderr, formatRemovedDiff(text, result.text, style));
  }

  const outSummary =
    args.githubSummary === undefined
      ? resolveGithubSummaryPath(undefined, io.env)
      : resolveGithubSummaryPath(args.githubSummary, io.env);
  if (outSummary) {
    try {
      appendGithubSummary(outSummary, formatGithubSummary(result, source, version));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeOut(io.stderr, `could not write github summary: ${msg}\n`);
    }
  }

  if (
    args.failOverTokens !== undefined &&
    result.output.tokens > args.failOverTokens
  ) {
    if (!args.tap) {
      await writeOut(
        io.stderr,
        `context-diet: output tokens ~${result.output.tokens} exceed --fail-over-tokens ${args.failOverTokens} (hard fail; use --max-tokens to truncate instead)\n`,
      );
    }
    return 1;
  }

  if (tapExit != null && tapExit !== 0) return tapExit;

  return 0;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    // npm/.bin and npx invoke via symlink; compare real paths (align agent-trace).
    return (
      realpathSync(entry) === self ||
      realpathSync(entry) === realpathSync(self)
    );
  } catch {
    return /(cli\.(js|ts)|context-diet)$/.test(entry);
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
