import type { CutCounts, DietResult } from "./types.js";

export interface JsonBudget {
  /** Echo of --fail-over-tokens when set; null when unset. */
  failOverTokens: number | null;
  /** Output token estimate after diet. */
  outputTokens: number;
  /** true when no gate, or outputTokens <= failOverTokens. */
  ok: boolean;
}

export interface JsonReport {
  ok: true;
  source: string;
  input: { chars: number; tokens: number };
  output: { chars: number; tokens: number };
  saved: {
    chars: number;
    tokens: number;
    charPercent: number;
    tokenPercent: number;
  };
  cuts: CutCounts;
  /** Token budget gate for GitHub Actions parsing (--fail-over-tokens). */
  budget: JsonBudget;
  text: string;
}

export interface ReportStyle {
  color: boolean;
}

function pct(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

const ansi = {
  dim: (s: string, on: boolean) => (on ? `\u001b[2m${s}\u001b[0m` : s),
  green: (s: string, on: boolean) => (on ? `\u001b[32m${s}\u001b[0m` : s),
  red: (s: string, on: boolean) => (on ? `\u001b[31m${s}\u001b[0m` : s),
  bold: (s: string, on: boolean) => (on ? `\u001b[1m${s}\u001b[0m` : s),
};

/**
 * Respect NO_COLOR / FORCE_COLOR (https://no-color.org/).
 * When streamIsTTY is false and FORCE_COLOR is unset, stay plain.
 */
export function shouldUseColor(
  env: NodeJS.ProcessEnv = process.env,
  streamIsTTY?: boolean,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0";
  }
  return Boolean(streamIsTTY);
}

export function toJsonReport(
  result: DietResult,
  source: string,
  failOverTokens?: number,
): JsonReport {
  const savedChars = Math.max(0, result.input.chars - result.output.chars);
  const savedTokens = Math.max(0, result.input.tokens - result.output.tokens);
  const limit = failOverTokens ?? null;
  const budgetOk = limit == null || result.output.tokens <= limit;
  return {
    ok: true,
    source,
    input: result.input,
    output: result.output,
    saved: {
      chars: savedChars,
      tokens: savedTokens,
      charPercent: pct(result.input.chars, result.output.chars),
      tokenPercent: pct(result.input.tokens, result.output.tokens),
    },
    cuts: result.cuts,
    budget: {
      failOverTokens: limit,
      outputTokens: result.output.tokens,
      ok: budgetOk,
    },
    text: result.text,
  };
}

function cutLines(cuts: CutCounts): Array<[string, string]> {
  return [
    ["ansi sequences", String(cuts.ansiSequences)],
    ["html chrome", String(cuts.htmlChrome)],
    ["quoted replies", String(cuts.quotedReplies)],
    ["chat chrome", String(cuts.chatChrome)],
    ["code comments", String(cuts.codeComments)],
    ["json fields", String(cuts.jsonFields)],
    ["boilerplate lines", String(cuts.boilerplateLines)],
    ["duplicate paragraphs", String(cuts.duplicateParagraphs)],
    ["whitespace runs", String(cuts.whitespaceRuns)],
    ["omitted heavy blobs", String(cuts.omittedHeavyBlobs)],
    ["secrets redacted", String(cuts.secretsRedacted)],
    ["truncated blocks", String(cuts.truncatedBlocks)],
    ["truncated tokens", `~${commas(cuts.truncatedTokens)}`],
    ["llm deepen", cuts.deepened ? "yes" : "no"],
  ];
}

export function formatHumanReport(
  result: DietResult,
  source: string,
  version: string,
  style: ReportStyle = { color: false },
): string {
  const { input, output } = result;
  const charPct = pct(input.chars, output.chars);
  const tokPct = pct(input.tokens, output.tokens);
  const sign = (n: number) => (n > 0 ? `−${n}%` : n < 0 ? `+${Math.abs(n)}%` : "0%");
  const on = style.color;
  const rows = cutLines(result.cuts);
  const width = Math.max(...rows.map(([k]) => k.length));
  const cutBody = rows.map(
    ([k, v]) => `  ${ansi.dim(k.padEnd(width), on)}  ${v}`,
  );
  const lines = [
    ansi.bold(`context-diet ${version}`, on),
    `source:   ${source}`,
    `chars:    ${commas(input.chars)} → ${commas(output.chars)}  (${ansi.green(sign(charPct), on)})`,
    `tokens:   ~${commas(input.tokens)} → ~${commas(output.tokens)}  (${ansi.green(sign(tokPct), on)})`,
    `cut:`,
    ...cutBody,
  ];
  return lines.join("\n") + "\n";
}

const DIFF_CAP = 40;

/**
 * Show lines that disappeared after the diet (order-preserving multiset
 * difference). Caps output so huge logs stay readable.
 */
export function formatRemovedDiff(
  input: string,
  output: string,
  style: ReportStyle = { color: false },
): string {
  const inLines = input.split("\n");
  const outCounts = new Map<string, number>();
  for (const line of output.split("\n")) {
    outCounts.set(line, (outCounts.get(line) ?? 0) + 1);
  }

  const removed: string[] = [];
  for (const line of inLines) {
    const left = outCounts.get(line) ?? 0;
    if (left > 0) {
      outCounts.set(line, left - 1);
      continue;
    }
    // Skip pure blank noise in the diff view.
    if (line.trim() === "") continue;
    removed.push(line);
  }

  if (removed.length === 0) {
    return style.color
      ? `\u001b[2mdiff: no unique lines removed\u001b[0m\n`
      : `diff: no unique lines removed\n`;
  }

  const shown = removed.slice(0, DIFF_CAP);
  const on = style.color;
  const header = ansi.dim(
    `diff (removed lines${removed.length > DIFF_CAP ? `, showing ${DIFF_CAP}/${removed.length}` : `, ${removed.length}`}):`,
    on,
  );
  const body = shown.map((line) => ansi.red(`- ${line}`, on));
  return [header, ...body, ""].join("\n");
}

function commasPlain(n: number): string {
  return n.toLocaleString("en-US");
}

/** Concise diet Markdown for GitHub Actions step summary. */
export function formatGithubSummary(
  result: DietResult,
  source: string,
  version: string,
): string {
  const savedChars = Math.max(0, result.input.chars - result.output.chars);
  const savedTokens = Math.max(0, result.input.tokens - result.output.tokens);
  const charPct = pct(result.input.chars, result.output.chars);
  const tokPct = pct(result.input.tokens, result.output.tokens);
  const safeSource = source.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines: string[] = [];
  lines.push(`### context-diet ${version}`);
  lines.push("");
  lines.push(`Source: \`${safeSource}\``);
  lines.push("");
  lines.push("| | Before | After | Saved |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    `| Chars | ${commasPlain(result.input.chars)} | ${commasPlain(result.output.chars)} | ${commasPlain(savedChars)} (−${charPct}%) |`,
  );
  lines.push(
    `| Tokens (est.) | ~${commasPlain(result.input.tokens)} | ~${commasPlain(result.output.tokens)} | ~${commasPlain(savedTokens)} (−${tokPct}%) |`,
  );
  lines.push("");
  const notable = cutLines(result.cuts).filter(([, v]) => v !== "0" && v !== "~0" && v !== "no");
  if (notable.length) {
    lines.push("**Cuts**");
    lines.push("");
    for (const [k, v] of notable) {
      lines.push(`- ${k}: ${v}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
