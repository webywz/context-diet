export type KeepCategory = "headings" | "code" | "lists";

export type LlmProvider = "openai" | "anthropic";

export type { PresetName } from "./presets.js";

export interface CutCounts {
  /** ANSI escape sequences removed. */
  ansiSequences: number;
  /** HTML tags / scripts / styles / comments stripped. */
  htmlChrome: number;
  /** Quoted email reply lines dropped. */
  quotedReplies: number;
  /** Chat reaction / system / timestamp-only lines dropped. */
  chatChrome: number;
  /** Long comment blocks / line comments stripped (code preset). */
  codeComments: number;
  /** Null/empty JSON fields dropped or JSONC comments removed (json preset). */
  jsonFields: number;
  /** Repeated / chrome lines dropped (logs, banners, signatures). */
  boilerplateLines: number;
  /** Near-identical paragraphs dropped. */
  duplicateParagraphs: number;
  /** Extra blank-line runs or trailing spaces collapsed. */
  whitespaceRuns: number;
  /** Long base64 / data-URI blobs replaced with placeholders. */
  omittedHeavyBlobs: number;
  /** Secret-shaped spans replaced with `[redacted]` (`--redact`). */
  secretsRedacted: number;
  /** Blocks dropped or trimmed to fit `--max-tokens`. */
  truncatedBlocks: number;
  /** Estimated tokens removed by truncation (not other steps). */
  truncatedTokens: number;
  /** True when an optional LLM pass rewrote the text. */
  deepened: boolean;
}

export interface DietOptions {
  /** Soft cap on estimated output tokens. */
  maxTokens?: number;
  /** Prefer these block types when truncating to a token budget. */
  keep?: KeepCategory[];
  /**
   * Named recipe: `logs`, `email`, `chat`, `html`, `code`, or `json`.
   * Sets keep defaults and enables extra strippers; explicit `keep` wins.
   */
  preset?: import("./presets.js").PresetName;
  /** Force HTML chrome stripping even without the `html` preset. */
  stripHtml?: boolean;
  /** Scrub common secret shapes before diet heuristics. */
  redact?: boolean;
  /**
   * Optional second-pass compression via OpenAI or Anthropic.
   * Requires a key in the environment; never implied.
   */
  deepen?: boolean;
  provider?: LlmProvider;
  /** Injected fetch (tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export interface SizeSnapshot {
  chars: number;
  tokens: number;
}

export interface DietResult {
  text: string;
  input: SizeSnapshot;
  output: SizeSnapshot;
  cuts: CutCounts;
}

export const KEEP_CATEGORIES: readonly KeepCategory[] = [
  "headings",
  "code",
  "lists",
];

export function emptyCuts(): CutCounts {
  return {
    ansiSequences: 0,
    htmlChrome: 0,
    quotedReplies: 0,
    chatChrome: 0,
    codeComments: 0,
    jsonFields: 0,
    boilerplateLines: 0,
    duplicateParagraphs: 0,
    whitespaceRuns: 0,
    omittedHeavyBlobs: 0,
    secretsRedacted: 0,
    truncatedBlocks: 0,
    truncatedTokens: 0,
    deepened: false,
  };
}
