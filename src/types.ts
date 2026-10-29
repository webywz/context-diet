export type KeepCategory = "headings" | "code" | "lists";

export type LlmProvider = "openai" | "anthropic";

export interface CutCounts {
  /** ANSI escape sequences removed. */
  ansiSequences: number;
  /** Repeated / chrome lines dropped (logs, banners, signatures). */
  boilerplateLines: number;
  /** Near-identical paragraphs dropped. */
  duplicateParagraphs: number;
  /** Extra blank-line runs or trailing spaces collapsed. */
  whitespaceRuns: number;
  /** Long base64 / data-URI blobs replaced with placeholders. */
  omittedHeavyBlobs: number;
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
    boilerplateLines: 0,
    duplicateParagraphs: 0,
    whitespaceRuns: 0,
    omittedHeavyBlobs: 0,
    truncatedBlocks: 0,
    truncatedTokens: 0,
    deepened: false,
  };
}
