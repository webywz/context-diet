import type { CutCounts, DietResult } from "./types.js";

/** Escape text for safe insertion into HTML text/attr contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface HtmlReportOptions {
  /** Cap preview panes (chars). Default 4000. */
  previewChars?: number;
  /** Original input text for side-by-side / removed preview. */
  original?: string;
  version?: string;
}

function pct(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

function cutRows(cuts: CutCounts): Array<[string, string]> {
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
    ["truncated blocks", String(cuts.truncatedBlocks)],
    ["truncated tokens", `~${commas(cuts.truncatedTokens)}`],
    ["llm deepen", cuts.deepened ? "yes" : "no"],
  ];
}

function clipPreview(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…`, truncated: true };
}

function removedPreview(input: string, output: string, max: number): string {
  const outCounts = new Map<string, number>();
  for (const line of output.split("\n")) {
    outCounts.set(line, (outCounts.get(line) ?? 0) + 1);
  }
  const removed: string[] = [];
  for (const line of input.split("\n")) {
    const left = outCounts.get(line) ?? 0;
    if (left > 0) {
      outCounts.set(line, left - 1);
      continue;
    }
    if (line.trim() === "") continue;
    removed.push(line);
  }
  if (!removed.length) return "(no unique lines removed)";
  const joined = removed.join("\n");
  return clipPreview(joined, max).text;
}

/**
 * Self-contained dark HTML diet report (inline CSS, no CDN).
 * Slimmed body still goes to stdout / -o; this is the human artifact.
 */
export function formatHtmlReport(
  result: DietResult,
  source: string,
  options: HtmlReportOptions = {},
): string {
  const max = options.previewChars ?? 4000;
  const version = escapeHtml(options.version ?? "");
  const safeSource = escapeHtml(source);
  const savedChars = Math.max(0, result.input.chars - result.output.chars);
  const savedTokens = Math.max(0, result.input.tokens - result.output.tokens);
  const charPct = pct(result.input.chars, result.output.chars);
  const tokPct = pct(result.input.tokens, result.output.tokens);

  const cuts = cutRows(result.cuts)
    .map(
      ([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td class="num">${escapeHtml(v)}</td></tr>`,
    )
    .join("\n");

  const kept = clipPreview(result.text, max);
  const original = options.original ?? "";
  const removed = original
    ? removedPreview(original, result.text, max)
    : "(original not provided)";
  const beforePane = original
    ? clipPreview(original, max)
    : { text: "(original not provided)", truncated: false };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>context-diet · ${safeSource}</title>
<style>
:root {
  --bg: #0a0a0a;
  --panel: #111111;
  --border: #222222;
  --text: #eeeeee;
  --muted: #888888;
  --good: #7ee787;
  --cut: #ff7b72;
  --font: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--text);
  font: 13px/1.45 var(--font);
}
body { padding: 24px 20px 48px; max-width: 1100px; margin: 0 auto; }
header.top {
  border: 1px solid var(--border); background: var(--panel);
  padding: 16px 18px; margin-bottom: 16px;
}
header.top h1 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
header.top .meta { color: var(--muted); font-size: 12px; }
.stats {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px; margin: 0 0 18px;
}
.stat {
  border: 1px solid var(--border); background: var(--panel);
  padding: 10px 12px;
}
.stat .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.stat .value { margin-top: 4px; font-size: 15px; }
.stat .value .good { color: var(--good); }
h2 { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 18px 0 10px; font-weight: 600; }
table.cuts {
  width: 100%; max-width: 420px; border-collapse: collapse;
  border: 1px solid var(--border); background: var(--panel); margin-bottom: 18px;
}
table.cuts th, table.cuts td {
  text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border);
}
table.cuts th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }
table.cuts td.num { text-align: right; }
.panes {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.pane {
  border: 1px solid var(--border); background: var(--panel); min-height: 120px;
}
.pane h3 {
  margin: 0; padding: 8px 10px; font-size: 11px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border); font-weight: 500;
}
.pane.removed h3 { color: var(--cut); }
.pane.kept h3 { color: var(--good); }
.pane pre {
  margin: 0; padding: 10px; overflow: auto; max-height: 360px;
  white-space: pre-wrap; word-break: break-word; color: #d8d8d8;
}
.note { color: var(--muted); font-size: 11px; margin-top: 6px; }
footer {
  margin-top: 28px; color: var(--muted); font-size: 11px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
@media (max-width: 720px) {
  .stats, .panes { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<header class="top">
  <h1>context-diet${version ? ` ${version}` : ""}</h1>
  <div class="meta">source: ${safeSource}</div>
</header>
<section class="stats" aria-label="stats">
  <div class="stat">
    <div class="label">chars</div>
    <div class="value">${commas(result.input.chars)} → ${commas(result.output.chars)}
      <span class="good">(−${charPct}%)</span></div>
  </div>
  <div class="stat">
    <div class="label">tokens (est.)</div>
    <div class="value">~${commas(result.input.tokens)} → ~${commas(result.output.tokens)}
      <span class="good">(−${tokPct}%)</span></div>
  </div>
  <div class="stat">
    <div class="label">saved</div>
    <div class="value">${commas(savedChars)} chars · ~${commas(savedTokens)} tokens</div>
  </div>
</section>
<h2>Cuts</h2>
<table class="cuts">
<thead><tr><th>Kind</th><th>Count</th></tr></thead>
<tbody>
${cuts}
</tbody>
</table>
<h2>Preview</h2>
<div class="panes">
  <div class="pane removed">
    <h3>Removed / before${beforePane.truncated ? " (truncated)" : ""}</h3>
    <pre>${escapeHtml(original ? removed : beforePane.text)}</pre>
  </div>
  <div class="pane kept">
    <h3>Kept / after${kept.truncated ? " (truncated)" : ""}</h3>
    <pre>${escapeHtml(kept.text)}</pre>
  </div>
</div>
<p class="note">Previews capped at ${max.toLocaleString("en-US")} chars. Slimmed body still goes to stdout / -o.</p>
<footer>Generated by context-diet · self-contained · works offline (file://)</footer>
</body>
</html>
`;
}
