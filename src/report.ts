import type { CutCounts, DietResult } from "./types.js";

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
  text: string;
}

function pct(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

export function toJsonReport(result: DietResult, source: string): JsonReport {
  const savedChars = Math.max(0, result.input.chars - result.output.chars);
  const savedTokens = Math.max(0, result.input.tokens - result.output.tokens);
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
    text: result.text,
  };
}

function cutLines(cuts: CutCounts): string[] {
  const rows: Array<[string, string]> = [
    ["ansi sequences", String(cuts.ansiSequences)],
    ["boilerplate lines", String(cuts.boilerplateLines)],
    ["duplicate paragraphs", String(cuts.duplicateParagraphs)],
    ["whitespace runs", String(cuts.whitespaceRuns)],
    ["omitted heavy blobs", String(cuts.omittedHeavyBlobs)],
    ["truncated blocks", String(cuts.truncatedBlocks)],
    ["truncated tokens", `~${commas(cuts.truncatedTokens)}`],
    ["llm deepen", cuts.deepened ? "yes" : "no"],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(
    ([k, v]) => `  ${k.padEnd(width)}  ${v}`,
  );
}

export function formatHumanReport(
  result: DietResult,
  source: string,
  version: string,
): string {
  const { input, output } = result;
  const charPct = pct(input.chars, output.chars);
  const tokPct = pct(input.tokens, output.tokens);
  const sign = (n: number) => (n > 0 ? `−${n}%` : n < 0 ? `+${Math.abs(n)}%` : "0%");
  const lines = [
    `context-diet ${version}`,
    `source:   ${source}`,
    `chars:    ${commas(input.chars)} → ${commas(output.chars)}  (${sign(charPct)})`,
    `tokens:   ~${commas(input.tokens)} → ~${commas(output.tokens)}  (${sign(tokPct)})`,
    `cut:`,
    ...cutLines(result.cuts),
  ];
  return lines.join("\n") + "\n";
}
