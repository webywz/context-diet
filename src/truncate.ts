import { joinBlocks, type Block } from "./blocks.js";
import { estimateTokens } from "./tokens.js";
import type { CutCounts, KeepCategory } from "./types.js";

const ERROR_LINE_RE = /\b(ERROR|FATAL|CRITICAL|WARN(?:ING)?|SEVERE|PANIC|EXCEPTION)\b/i;

function looksLikeError(block: Block): boolean {
  if (block.type === "code" || block.type === "blank" || block.type === "rule") {
    return false;
  }
  return ERROR_LINE_RE.test(block.raw);
}

const LOG_LINE_RE =
  /^\s*(?:\[[^\]]+\]|\d{4}-\d{2}-\d{2})\s+(?:DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|TRACE|CRITICAL)\b/i;

/**
 * When preferring errors, explode multi-line log paragraphs into one block
 * per line so ERROR/WARN can outrank neighboring INFO/DEBUG under a budget.
 */
function explodeLogParagraphs(blocks: Block[], preferErrors: boolean): Block[] {
  if (!preferErrors) return blocks;
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type !== "paragraph") {
      out.push(block);
      continue;
    }
    const lines = block.raw.split("\n");
    if (lines.length < 2) {
      out.push(block);
      continue;
    }
    const loggish = lines.filter((l) => l.trim() !== "").every((l) => LOG_LINE_RE.test(l) || ERROR_LINE_RE.test(l));
    if (!loggish) {
      out.push(block);
      continue;
    }
    for (const line of lines) {
      if (line.trim() === "") continue;
      out.push({ type: "paragraph", raw: line });
    }
  }
  return out;
}

function scoreBlock(
  block: Block,
  keep: Set<KeepCategory>,
  preferErrors: boolean,
): number {
  let score = 1;
  switch (block.type) {
    case "heading":
      score = 4;
      if (keep.has("headings")) score += 24;
      break;
    case "code":
      score = 4;
      if (keep.has("code")) score += 24;
      break;
    case "list":
      score = 3;
      if (keep.has("lists")) score += 24;
      break;
    case "paragraph":
      score = 2;
      break;
    case "rule":
      score = 0;
      break;
    case "blank":
      score = 0;
      break;
    default:
      score = 1;
  }
  if (preferErrors && looksLikeError(block)) score += 18;
  return score;
}

function trimBlockToTokens(raw: string, maxTokens: number): string {
  if (estimateTokens(raw) <= maxTokens) return raw;
  const lines = raw.split("\n");
  if (lines.length > 1) {
    const kept: string[] = [];
    for (const line of lines) {
      const trial = [...kept, line].join("\n");
      if (estimateTokens(trial + "\n…") > maxTokens) break;
      kept.push(line);
    }
    if (kept.length > 0) return `${kept.join("\n")}\n…`;
  }
  // Character walk as a last resort.
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = `${raw.slice(0, mid).trimEnd()}\n…`;
    if (estimateTokens(slice) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const cut = raw.slice(0, lo).trimEnd();
  return cut.length === 0 ? "…" : `${cut}\n…`;
}

export function truncateToBudget(
  blocks: Block[],
  maxTokens: number,
  keep: KeepCategory[],
  cuts: CutCounts,
  preferErrors = false,
): Block[] {
  if (!(maxTokens > 0)) return blocks;
  blocks = explodeLogParagraphs(blocks, preferErrors);
  const keepSet = new Set(keep);
  const tokens = blocks.map((b) => estimateTokens(b.raw));
  let total = tokens.reduce((a, b) => a + b, 0);
  if (total <= maxTokens) return blocks;

  const scores = blocks.map((b) => scoreBlock(b, keepSet, preferErrors));
  const order = blocks
    .map((_, i) => i)
    .sort((a, b) => {
      const ds = scores[a]! - scores[b]!;
      if (ds !== 0) return ds;
      return b - a; // drop later ties first
    });

  const dropped = new Set<number>();
  for (const i of order) {
    if (total <= maxTokens) break;
    const block = blocks[i]!;
    if (block.type === "blank") continue;
    // Never drop the last remaining non-blank block; trim it instead.
    const remainingNonBlank =
      blocks.filter((b, idx) => !dropped.has(idx) && b.type !== "blank").length;
    if (remainingNonBlank <= 1) continue;
    dropped.add(i);
    total -= tokens[i]!;
    cuts.truncatedBlocks += 1;
    cuts.truncatedTokens += tokens[i]!;
  }

  let next: Block[] = blocks.filter((_, i) => !dropped.has(i));
  next = next.filter((b, i, arr) => {
    if (b.type !== "blank") return true;
    if (i === 0 || i === arr.length - 1) return false;
    return arr[i - 1]?.type !== "blank";
  });

  total = next.reduce((a, b) => a + estimateTokens(b.raw), 0);
  if (total <= maxTokens) return next;

  // Still over: trim the lowest-score, largest remaining block from the end.
  const trimOrder = next
    .map((b, i) => ({
      i,
      b,
      s: scoreBlock(b, keepSet, preferErrors),
      t: estimateTokens(b.raw),
    }))
    .filter((x) => x.b.type !== "blank")
    .sort((a, b) => a.s - b.s || b.t - a.t || b.i - a.i);

  for (const item of trimOrder) {
    total = next.reduce((a, b) => a + estimateTokens(b.raw), 0);
    if (total <= maxTokens) break;
    const others = total - item.t;
    const budget = Math.max(8, maxTokens - others);
    const trimmed = trimBlockToTokens(item.b.raw, budget);
    if (trimmed !== item.b.raw) {
      cuts.truncatedBlocks += 1;
      cuts.truncatedTokens += Math.max(
        0,
        item.t - estimateTokens(trimmed),
      );
      next = next.map((b, i) =>
        i === item.i ? { ...b, raw: trimmed } : b,
      );
    }
  }

  const joined = joinBlocks(next);
  if (estimateTokens(joined) <= maxTokens) return next;

  // Absolute fallback: hard-cut the joined document.
  const hard = trimBlockToTokens(joined, maxTokens);
  cuts.truncatedBlocks += 1;
  cuts.truncatedTokens += Math.max(
    0,
    estimateTokens(joined) - estimateTokens(hard),
  );
  return [{ type: "paragraph", raw: hard }];
}
