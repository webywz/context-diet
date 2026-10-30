import type { CutCounts } from "./types.js";

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const NOSCRIPT_RE = /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const BLOCK_TAG_RE =
  /<\/?(?:html|head|body|div|p|br|hr|li|ul|ol|tr|td|th|table|section|article|header|footer|nav|main|h[1-6]|blockquote|pre|form|aside)\b[^>]*>/gi;
const ANY_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => ENTITIES[name.toLowerCase()] ?? full);
}

/**
 * Strip HTML chrome (scripts, styles, comments, tags) into readable prose.
 * Counts each removed tag/script/style/comment block toward `htmlChrome`.
 */
export function stripHtmlChrome(text: string, cuts: CutCounts): string {
  if (!/<[a-zA-Z!/]/.test(text)) return text;

  let n = 0;
  const bump = (): string => {
    n += 1;
    return "";
  };

  let next = text
    .replace(SCRIPT_RE, bump)
    .replace(STYLE_RE, bump)
    .replace(NOSCRIPT_RE, bump)
    .replace(COMMENT_RE, bump);

  next = next.replace(BLOCK_TAG_RE, (tag) => {
    n += 1;
    const lower = tag.toLowerCase();
    if (lower.startsWith("<br") || lower.startsWith("<hr") || lower.startsWith("</")) {
      return "\n";
    }
    return "\n";
  });

  next = next.replace(ANY_TAG_RE, () => {
    n += 1;
    return "";
  });

  next = decodeEntities(next);
  // Collapse spaces introduced by tag removal, but keep intentional newlines.
  next = next.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  cuts.htmlChrome += n;
  return next;
}
