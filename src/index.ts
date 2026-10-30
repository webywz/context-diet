export { parseBlocks, joinBlocks, type Block, type BlockType } from "./blocks.js";
export { diet, dietAsync } from "./diet.js";
export { deepenText, DeepenError, hasAnyKey, resolveProvider } from "./llm.js";
export { stripHtmlChrome } from "./html.js";
export {
  PRESETS,
  PRESET_NAMES,
  isPresetName,
  resolvePreset,
  type PresetConfig,
  type PresetName,
} from "./presets.js";
export { estimateTokens, snapshot } from "./tokens.js";
export {
  formatHumanReport,
  formatRemovedDiff,
  shouldUseColor,
  toJsonReport,
  type JsonReport,
  type ReportStyle,
} from "./report.js";
export {
  KEEP_CATEGORIES,
  emptyCuts,
  type CutCounts,
  type DietOptions,
  type DietResult,
  type KeepCategory,
  type LlmProvider,
  type SizeSnapshot,
} from "./types.js";
