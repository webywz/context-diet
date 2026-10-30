import { isPresetName, type PresetName } from "./presets.js";
import { KEEP_CATEGORIES, type KeepCategory, type LlmProvider } from "./types.js";

export interface CliArgs {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  deepen: boolean;
  dryRun: boolean;
  diff: boolean;
  demo: boolean;
  file?: string;
  output?: string;
  maxTokens?: number;
  keep: KeepCategory[];
  preset?: PresetName;
  provider?: LlmProvider;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const KEEP_SET = new Set<string>(KEEP_CATEGORIES);
const PROVIDERS = new Set<LlmProvider>(["openai", "anthropic"]);

function parseKeepValue(raw: string): KeepCategory[] {
  const parts = raw
    .split(/[,|]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new UsageError(
      "Expected --keep headings|code|lists (comma or pipe separated).",
    );
  }
  const out: KeepCategory[] = [];
  for (const part of parts) {
    if (!KEEP_SET.has(part)) {
      throw new UsageError(
        `Unknown --keep value "${part}". Use headings, code, and/or lists.`,
      );
    }
    out.push(part as KeepCategory);
  }
  return out;
}

function parsePositiveInt(flag: string, raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new UsageError(`${flag} expects a positive integer, got "${raw}".`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new UsageError(`${flag} expects a positive integer, got "${raw}".`);
  }
  return n;
}

function takeValue(
  argv: string[],
  i: number,
  flag: string,
  inline?: string,
): { value: string; next: number } {
  if (inline !== undefined && inline !== "") return { value: inline, next: i };
  const value = argv[i];
  if (value === undefined || value.startsWith("-")) {
    throw new UsageError(`${flag} requires a value.`);
  }
  return { value, next: i + 1 };
}

export const HELP_TEXT = `\
context-diet — slim LLM context before you send it

Usage:
  context-diet [file] [options]
  context-diet --demo --preset logs --max-tokens 400
  cat logs.txt | context-diet --preset logs --max-tokens 2000

Options:
  -o, --output <file>       Write slimmed text to a file instead of stdout
      --max-tokens <n>      Truncate to an estimated token budget
      --keep <cats>         Prefer headings, code, lists when truncating
                            (comma or pipe: headings|code|lists)
      --preset <name>       logs | email | chat | html
                            (sets keep defaults + extra strippers)
      --demo                Diet the bundled examples/noisy.txt (no clone needed)
      --json                Print a machine-readable report (includes text)
      --dry-run             Report only; do not emit slimmed body / -o
      --diff                Show removed lines on stderr (capped)
      --deepen              Optional LLM pass (OPENAI_API_KEY / ANTHROPIC_API_KEY)
      --provider <name>     openai | anthropic (default: first available key)
  -q, --quiet               Do not print the human report to stderr
  -h, --help                Show this help
  -V, --version             Show version

Offline by default. --deepen is never required.
Respects NO_COLOR / FORCE_COLOR for the human report.
Token counts are a cl100k-ish heuristic, not a billed tokenizer.
`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    help: false,
    version: false,
    json: false,
    quiet: false,
    deepen: false,
    dryRun: false,
    diff: false,
    demo: false,
    keep: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;

    if (a === "--") {
      const rest = argv.slice(i + 1);
      if (rest.length > 1) {
        throw new UsageError(`Unexpected extra arguments: ${rest.slice(1).join(" ")}`);
      }
      if (rest[0] !== undefined) {
        if (args.file) throw new UsageError("Pass at most one input file.");
        args.file = rest[0];
      }
      break;
    }

    if (a === "-h" || a === "--help") {
      args.help = true;
      continue;
    }
    if (a === "-V" || a === "--version") {
      args.version = true;
      continue;
    }
    if (a === "--json") {
      args.json = true;
      continue;
    }
    if (a === "-q" || a === "--quiet") {
      args.quiet = true;
      continue;
    }
    if (a === "--deepen") {
      args.deepen = true;
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a === "--diff") {
      args.diff = true;
      continue;
    }
    if (a === "--demo") {
      args.demo = true;
      continue;
    }
    if (a === "-o" || a === "--output" || a.startsWith("--output=")) {
      const inline = a.startsWith("--output=") ? a.slice("--output=".length) : undefined;
      const got = takeValue(argv, i + 1, "--output", inline);
      args.output = got.value;
      i = got.next - 1;
      continue;
    }
    if (a === "--max-tokens" || a.startsWith("--max-tokens=")) {
      const inline = a.startsWith("--max-tokens=")
        ? a.slice("--max-tokens=".length)
        : undefined;
      const got = takeValue(argv, i + 1, "--max-tokens", inline);
      args.maxTokens = parsePositiveInt("--max-tokens", got.value);
      i = got.next - 1;
      continue;
    }
    if (a === "--keep" || a.startsWith("--keep=")) {
      const inline = a.startsWith("--keep=") ? a.slice("--keep=".length) : undefined;
      const got = takeValue(argv, i + 1, "--keep", inline);
      args.keep.push(...parseKeepValue(got.value));
      i = got.next - 1;
      continue;
    }
    if (a === "--preset" || a.startsWith("--preset=")) {
      const inline = a.startsWith("--preset=")
        ? a.slice("--preset=".length)
        : undefined;
      const got = takeValue(argv, i + 1, "--preset", inline);
      const name = got.value.toLowerCase();
      if (!isPresetName(name)) {
        throw new UsageError(
          `Unknown --preset "${got.value}". Use logs, email, chat, or html.`,
        );
      }
      args.preset = name;
      i = got.next - 1;
      continue;
    }
    if (a === "--provider" || a.startsWith("--provider=")) {
      const inline = a.startsWith("--provider=")
        ? a.slice("--provider=".length)
        : undefined;
      const got = takeValue(argv, i + 1, "--provider", inline);
      const name = got.value.toLowerCase();
      if (!PROVIDERS.has(name as LlmProvider)) {
        throw new UsageError(`Unknown --provider "${got.value}". Use openai or anthropic.`);
      }
      args.provider = name as LlmProvider;
      i = got.next - 1;
      continue;
    }
    if (a === "-") {
      if (args.file) {
        throw new UsageError("Pass at most one input file.");
      }
      args.file = "-";
      continue;
    }
    if (a.startsWith("-")) {
      throw new UsageError(`Unknown option: ${a}`);
    }
    if (args.file) {
      throw new UsageError(`Unexpected extra argument: ${a}`);
    }
    args.file = a;
  }

  if (args.demo && args.file) {
    throw new UsageError("Pass --demo or a file path, not both.");
  }

  // Dedupe keep while preserving order.
  const seen = new Set<KeepCategory>();
  args.keep = args.keep.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return args;
}
