import type { DietResult } from "./types.js";

export interface TapResult {
  text: string;
  exitCode: number;
}

export interface TapBudget {
  failOverTokens?: number;
  outputTokens: number;
}

/**
 * TAP version 13 aligned with agent-trace / eval-smoke 0.7.
 * One plan item: ok when under --fail-over-tokens (or no gate); not ok when exceeded.
 */
export function formatTap(
  result: DietResult,
  source: string,
  budget: TapBudget,
): TapResult {
  const lines: string[] = ["TAP version 13", "1..1"];
  const over =
    budget.failOverTokens != null && result.output.tokens > budget.failOverTokens;
  const desc = source.replace(/#/g, "\\#").replace(/\r?\n/g, " ");
  if (over) {
    lines.push(`not ok 1 - ${desc}`);
    lines.push("  ---");
    lines.push(
      `  message: output tokens ~${result.output.tokens} exceed --fail-over-tokens ${budget.failOverTokens}`,
    );
    lines.push(`  output_tokens: ${result.output.tokens}`);
    lines.push(`  fail_over_tokens: ${budget.failOverTokens}`);
    lines.push("  ...");
    lines.push(
      `# context-diet: over budget (${result.output.tokens} > ${budget.failOverTokens})`,
    );
    return { text: `${lines.join("\n")}\n`, exitCode: 1 };
  }
  lines.push(`ok 1 - ${desc}`);
  lines.push(
    `# context-diet: ~${result.output.tokens} tokens` +
      (budget.failOverTokens != null ? ` (budget ${budget.failOverTokens})` : ""),
  );
  return { text: `${lines.join("\n")}\n`, exitCode: 0 };
}
