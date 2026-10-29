import { joinBlocks, parseBlocks } from "./blocks.js";
import {
  omitHeavyBlobs,
  stripAnsi,
  tidy,
} from "./heuristics.js";
import { deepenText } from "./llm.js";
import { snapshot } from "./tokens.js";
import { truncateToBudget } from "./truncate.js";
import {
  emptyCuts,
  type DietOptions,
  type DietResult,
} from "./types.js";

function localDiet(text: string, options: DietOptions): DietResult {
  const cuts = emptyCuts();
  const input = snapshot(text);

  let next = stripAnsi(text, cuts);
  next = omitHeavyBlobs(next, cuts);
  next = tidy(next, cuts);

  if (options.maxTokens && options.maxTokens > 0) {
    const blocks = parseBlocks(next);
    const trimmed = truncateToBudget(
      blocks,
      options.maxTokens,
      options.keep ?? [],
      cuts,
    );
    next = joinBlocks(trimmed);
  }

  // Final trailing-newline hygiene.
  next = next.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (next.length > 0 && !next.endsWith("\n")) next += "\n";

  return {
    text: next,
    input,
    output: snapshot(next),
    cuts,
  };
}

/**
 * Offline diet: strip chrome, collapse whitespace, dedupe near-identical
 * paragraphs, and optionally truncate to a token budget.
 */
export function diet(text: string, options: DietOptions = {}): DietResult {
  return localDiet(text, {
    maxTokens: options.maxTokens,
    keep: options.keep,
  });
}

/**
 * Same as {@link diet}, then optionally asks OpenAI/Anthropic to compress
 * further. Keys are never required; pass `deepen: true` to opt in.
 */
export async function dietAsync(
  text: string,
  options: DietOptions = {},
): Promise<DietResult> {
  const local = localDiet(text, options);
  if (!options.deepen) return local;

  const deepened = await deepenText(local.text, {
    provider: options.provider,
    env: options.env,
    fetch: options.fetch,
  });
  // Keep whichever version is actually smaller; models sometimes ramble.
  const localTokens = local.output.tokens;
  const deepTokens = snapshot(deepened).tokens;
  if (deepTokens >= localTokens) {
    return { ...local, cuts: { ...local.cuts, deepened: true } };
  }
  const textOut = deepened.endsWith("\n") ? deepened : `${deepened}\n`;
  return {
    text: textOut,
    input: local.input,
    output: snapshot(textOut),
    cuts: { ...local.cuts, deepened: true },
  };
}
