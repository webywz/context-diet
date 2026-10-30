import type { KeepCategory } from "./types.js";

export const PRESET_NAMES = ["logs", "email", "chat", "html"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface PresetConfig {
  /** Default keep categories applied when the user did not pass --keep. */
  keep: KeepCategory[];
  /** Strip HTML tags / scripts / styles before other heuristics. */
  stripHtml: boolean;
  /** Drop quoted email reply chains ("> …", "On … wrote:"). */
  stripQuotedReplies: boolean;
  /** Prefer ERROR/WARN/FATAL log lines when truncating to a budget. */
  preferErrors: boolean;
  /** Collapse chat reaction / system / timestamp-only chrome. */
  stripChatChrome: boolean;
}

export const PRESETS: Record<PresetName, PresetConfig> = {
  logs: {
    keep: ["code"],
    stripHtml: false,
    stripQuotedReplies: false,
    preferErrors: true,
    stripChatChrome: false,
  },
  email: {
    keep: ["headings", "lists"],
    stripHtml: false,
    stripQuotedReplies: true,
    preferErrors: false,
    stripChatChrome: false,
  },
  chat: {
    keep: ["code", "lists"],
    stripHtml: false,
    stripQuotedReplies: false,
    preferErrors: false,
    stripChatChrome: true,
  },
  html: {
    keep: ["headings", "code", "lists"],
    stripHtml: true,
    stripQuotedReplies: false,
    preferErrors: false,
    stripChatChrome: false,
  },
};

export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

/**
 * Merge a preset with explicit CLI/library options.
 * Explicit `keep` wins over the preset default when non-empty.
 */
export function resolvePreset(
  name: PresetName | undefined,
  keep: KeepCategory[] | undefined,
): {
  keep: KeepCategory[];
  stripHtml: boolean;
  stripQuotedReplies: boolean;
  preferErrors: boolean;
  stripChatChrome: boolean;
} {
  const preset = name ? PRESETS[name] : undefined;
  const explicitKeep = keep && keep.length > 0 ? keep : undefined;
  return {
    keep: explicitKeep ?? preset?.keep ?? [],
    stripHtml: preset?.stripHtml ?? false,
    stripQuotedReplies: preset?.stripQuotedReplies ?? false,
    preferErrors: preset?.preferErrors ?? false,
    stripChatChrome: preset?.stripChatChrome ?? false,
  };
}
