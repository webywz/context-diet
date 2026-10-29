import { joinBlocks, parseBlocks, type Block } from "./blocks.js";
import type { CutCounts } from "./types.js";

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-_]/g;

const SIGNATURE_RE = [
  /^\s*sent from my (iphone|ipad|android|galaxy)/i,
  /^\s*get outlook for (ios|android|mac)/i,
  /^\s*this (e-?mail|message) (and any attachments )?(is|are) confidential/i,
  /^\s*confidentiality notice\b/i,
  /^\s*(unsubscribe|manage (your )?preferences)\b/i,
  /^\s*click here to (view|unsubscribe|update)/i,
  /^\s*\[cid:[^\]]+\]\s*$/i,
  /^\s*begin forwarded message\s*$/i,
  /^\s*leaked by|do not share this prompt/i,
];

const CHROME_RE = [
  /^\s*\[?(DEBUG|TRACE|VERBOSE)\]?\s*[:\-]?\s*/i,
  /^\s*npm (info|http|timing|notice)\s/i,
  /^\s*downloading (packages|metadata)\.{2,}\s*$/i,
];

const DATA_URI_RE =
  /data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+=*/g;
const HEAVY_BLOB_RE = /[A-Za-z0-9+/]{120,}={0,2}/g;

export function stripAnsi(text: string, cuts: CutCounts): string {
  let n = 0;
  const next = text.replace(ANSI_RE, () => {
    n++;
    return "";
  });
  cuts.ansiSequences += n;
  return next;
}

export function omitHeavyBlobs(text: string, cuts: CutCounts): string {
  const replace = (blob: string): string => {
    cuts.omittedHeavyBlobs += 1;
    return `[omitted blob: ${blob.length} chars]`;
  };
  const next = text.replace(DATA_URI_RE, replace).replace(HEAVY_BLOB_RE, replace);
  return next.replace(
    /(\[omitted blob: \d+ chars\]){2,}/g,
    (run) => {
      const sizes = [...run.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      const total = sizes.reduce((a, b) => a + b, 0);
      if (sizes.length > 1) cuts.omittedHeavyBlobs -= sizes.length - 1;
      return `[omitted blob: ${total} chars]`;
    },
  );
}

function collapseProseWhitespace(raw: string, cuts: CutCounts): string {
  const next = raw
    .replace(/[ \t]+$/gm, (ws) => {
      if (ws.length) cuts.whitespaceRuns += 1;
      return "";
    })
    .replace(/[ \t]{2,}/g, () => {
      cuts.whitespaceRuns += 1;
      return " ";
    });
  return next;
}

export function collapseBlankBlocks(blocks: Block[], cuts: CutCounts): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type === "blank") {
      const runs = block.raw.split("\n").length;
      if (out.length === 0) continue;
      if (out[out.length - 1]?.type === "blank") {
        cuts.whitespaceRuns += 1;
        continue;
      }
      if (runs > 2) cuts.whitespaceRuns += runs - 2;
      out.push({ type: "blank", raw: "\n" });
      continue;
    }
    if (block.type === "code") {
      out.push(block);
      continue;
    }
    out.push({ ...block, raw: collapseProseWhitespace(block.raw, cuts) });
  }
  while (out.length && out[out.length - 1]?.type === "blank") out.pop();
  return out;
}

function lineFingerprint(line: string): string {
  return line
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}[ tT]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:z|[+-]\d{2}:?\d{2})?/g, "#ts#")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "#uuid#",
    )
    .replace(/0x[0-9a-f]+/gi, "#hex#")
    .replace(/\b\d+\b/g, "#n#")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSignature(line: string): boolean {
  return SIGNATURE_RE.some((re) => re.test(line));
}

function isDecorativeRule(line: string): boolean {
  return /^[-=*_~.|#]{3,}$/.test(line.trim());
}

function isLowValueChrome(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (isDecorativeRule(line)) return true;
  return CHROME_RE.some((re) => re.test(line));
}

/**
 * Drop repeated log/chrome lines and known signatures, keeping the first few
 * occurrences so the pattern is still visible.
 */
export function stripBoilerplate(blocks: Block[], cuts: CutCounts): Block[] {
  const fingerprints: string[] = [];
  for (const block of blocks) {
    if (block.type === "code" || block.type === "blank") continue;
    for (const line of block.raw.split("\n")) {
      const fp = lineFingerprint(line);
      if (fp) fingerprints.push(fp);
    }
  }
  const freq = new Map<string, number>();
  for (const fp of fingerprints) freq.set(fp, (freq.get(fp) ?? 0) + 1);

  const seen = new Map<string, number>();
  const KEEP_REPEATS = 2;

  const mapBlock = (block: Block): Block | null => {
    if (block.type === "code" || block.type === "blank") return block;
    if (block.type === "rule") {
      cuts.boilerplateLines += 1;
      return null;
    }

    const kept: string[] = [];
    for (const line of block.raw.split("\n")) {
      if (isSignature(line) || isDecorativeRule(line)) {
        cuts.boilerplateLines += 1;
        continue;
      }
      const fp = lineFingerprint(line);
      const count = fp ? freq.get(fp) ?? 0 : 0;
      const noisyRepeat = Boolean(fp) && count >= 3;
      const chrome = isLowValueChrome(line);
      if (noisyRepeat || (chrome && count >= 2)) {
        const keptAlready = seen.get(fp) ?? 0;
        const cap = chrome ? 1 : KEEP_REPEATS;
        if (keptAlready >= cap) {
          cuts.boilerplateLines += 1;
          continue;
        }
        seen.set(fp, keptAlready + 1);
      }
      kept.push(line);
    }
    if (kept.length === 0) return null;
    if (kept.every((l) => l.trim() === "")) return null;
    return { ...block, raw: kept.join("\n") };
  };

  return blocks.map(mapBlock).filter((b): b is Block => b !== null);
}

function normalizeParagraph(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "#url#")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const wa = a.split(" ").filter(Boolean);
  const wb = b.split(" ").filter(Boolean);
  if (wa.length === 0 && wb.length === 0) return 1;
  const sa = new Set(wa);
  const sb = new Set(wb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const DEDUPE_THRESHOLD = 0.84;

export function dedupeParagraphs(blocks: Block[], cuts: CutCounts): Block[] {
  const seenExact = new Set<string>();
  const seenFuzzy: string[] = [];
  const out: Block[] = [];

  for (const block of blocks) {
    if (block.type === "code" || block.type === "blank" || block.type === "heading") {
      out.push(block);
      continue;
    }
    const norm = normalizeParagraph(block.raw);
    if (!norm) {
      out.push(block);
      continue;
    }
    if (seenExact.has(norm)) {
      cuts.duplicateParagraphs += 1;
      continue;
    }
    const words = norm.split(" ").length;
    let dup = false;
    if (words >= 6) {
      for (const prev of seenFuzzy) {
        if (jaccard(norm, prev) >= DEDUPE_THRESHOLD) {
          dup = true;
          break;
        }
      }
    }
    if (dup) {
      cuts.duplicateParagraphs += 1;
      continue;
    }
    seenExact.add(norm);
    if (words >= 6) {
      seenFuzzy.push(norm);
      if (seenFuzzy.length > 64) seenFuzzy.shift();
    }
    out.push(block);
  }
  return out;
}

export function tidy(text: string, cuts: CutCounts): string {
  let blocks = parseBlocks(text);
  blocks = collapseBlankBlocks(blocks, cuts);
  blocks = stripBoilerplate(blocks, cuts);
  blocks = collapseBlankBlocks(blocks, cuts);
  blocks = dedupeParagraphs(blocks, cuts);
  blocks = collapseBlankBlocks(blocks, cuts);
  return joinBlocks(blocks);
}
