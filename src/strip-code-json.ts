import type { CutCounts } from "./types.js";

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /(^|[^:])\/\/[^\n]*/gm;
const HASH_COMMENT_RE = /^\s*#(?!!).*$/gm; // skip shebangs #!
const PYTHON_DOCSTRING_RE = /("""|''')[\s\S]*?\1/g;

const SIGNATURE_RE =
  /^\s*(?:export\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var|def|fn|pub\s+fn|impl)\b/;

/**
 * Keep code; strip long comment blocks and collapse excessive blank lines.
 * When `preferSignatures` is used by truncate, non-comment / signature lines score higher.
 */
export function stripCodeNoise(text: string, cuts: CutCounts): string {
  let next = text;
  next = next.replace(BLOCK_COMMENT_RE, (m) => {
    // Keep very short inline markers like `/** x */` under ~40 chars; drop the rest.
    if (m.length <= 40) return m;
    cuts.codeComments += 1;
    return "";
  });
  next = next.replace(PYTHON_DOCSTRING_RE, (m) => {
    if (m.length <= 40) return m;
    cuts.codeComments += 1;
    return "";
  });
  next = next.replace(LINE_COMMENT_RE, (m, prefix: string) => {
    // Preserve URLs like https://
    if (/https?:\/\//i.test(m)) return m;
    const body = m.slice(prefix.length);
    if (body.trim().length <= 2) return prefix; // empty //
    cuts.codeComments += 1;
    return prefix;
  });
  next = next.replace(HASH_COMMENT_RE, (m) => {
    if (m.trim().length <= 2) return "";
    cuts.codeComments += 1;
    return "";
  });
  // Collapse 3+ blank lines → 1
  next = next.replace(/\n{3,}/g, () => {
    cuts.whitespaceRuns += 1;
    return "\n\n";
  });
  // Drop trailing spaces
  next = next.replace(/[ \t]+$/gm, () => {
    cuts.whitespaceRuns += 1;
    return "";
  });
  return next;
}

/** Prefer function/class signatures and non-comment lines when scoring for truncation. */
export function isCodeSignatureLine(line: string): boolean {
  return SIGNATURE_RE.test(line);
}

export function isCommentOnlyLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("#") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("*/") ||
    t.startsWith('"""') ||
    t.startsWith("'''")
  );
}

/** Strip line and block comments (and hash comments) for JSONC. */
export function stripJsoncComments(text: string): string {
  let out = "";
  let i = 0;
  let inStr: string | null = null;
  let escaped = false;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inStr) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === "#") {
      i += 1;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function dropEmpty(value: unknown, cuts: CutCounts): unknown {
  if (value === null) {
    cuts.jsonFields += 1;
    return undefined;
  }
  if (typeof value === "string" && value === "") {
    cuts.jsonFields += 1;
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => dropEmpty(v, cuts))
      .filter((v) => v !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    // Stable key order
    for (const key of Object.keys(value as object).sort()) {
      const next = dropEmpty((value as Record<string, unknown>)[key], cuts);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

/**
 * If input looks like JSON (or JSONC), compact it: drop null/"" fields, stable keys,
 * single-space pretty. Otherwise gentle whitespace collapse.
 */
export function stripJsonNoise(text: string, cuts: CutCounts): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const looksJsonish =
    /^[\s\n]*[\[{]/.test(trimmed) ||
    trimmed.includes(":\n") ||
    /"\s*:/.test(trimmed);

  if (!looksJsonish) {
    const next = trimmed.replace(/[ \t]{2,}/g, () => {
      cuts.whitespaceRuns += 1;
      return " ";
    }).replace(/\n{3,}/g, () => {
      cuts.whitespaceRuns += 1;
      return "\n\n";
    });
    return next.endsWith("\n") ? next : `${next}\n`;
  }

  const withoutComments = stripJsoncComments(trimmed);
  if (withoutComments !== trimmed) cuts.jsonFields += 1;

  try {
    const parsed = JSON.parse(withoutComments) as unknown;
    const cleaned = dropEmpty(parsed, cuts);
    const compact = JSON.stringify(cleaned, null, 2);
    return compact.endsWith("\n") ? compact : `${compact}\n`;
  } catch {
    // Gentle collapse when not valid JSON
    const next = withoutComments
      .replace(/[ \t]+$/gm, () => {
        cuts.whitespaceRuns += 1;
        return "";
      })
      .replace(/[ \t]{2,}/g, () => {
        cuts.whitespaceRuns += 1;
        return " ";
      })
      .replace(/\n{3,}/g, () => {
        cuts.whitespaceRuns += 1;
        return "\n\n";
      });
    return next.endsWith("\n") ? next : `${next}\n`;
  }
}
