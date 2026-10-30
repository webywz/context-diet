# context-diet

**Slim LLM context before you send it.** Drop the noise, keep the signal, estimate tokens — locally, offline, in milliseconds.

Engineers paste logs, docs, and chat history into models. Most of it is filler: repeated `DEBUG` lines, email signatures, duplicated paragraphs, 4KB of base64. `context-diet` is a small CLI that strips that chrome, optionally fits a token budget, and tells you what it cut.

```bash
npm i -g @webywz/context-diet
```

```bash
context-diet logs.txt --preset logs --max-tokens 2000
```

### 30-second demo (no clone)

```bash
npx @webywz/context-diet --demo --preset logs --max-tokens 400
```

Bundled `examples/noisy.txt` goes in; slimmed body on **stdout**, human report on **stderr**. No repo checkout required.

## Install

```bash
npm i -g @webywz/context-diet
```

Node 18+ is required. No tokenizer files, no GPU, no account.

```bash
# one-off
npx @webywz/context-diet --help
```

## Quick start

```bash
# file → slimmed text on stdout, report on stderr
context-diet input.txt

# bundled demo fixture (same I/O; great for npx smoke tests)
npx @webywz/context-diet --demo --preset logs --max-tokens 400

# stdin
cat noisy.log | context-diet --preset logs --max-tokens 1500 > slim.txt

# write the body to a file
context-diet notes.md -o slim.md --keep headings,code,lists

# report only (no body / no -o write)
context-diet input.txt --dry-run --diff

# machine-readable
context-diet input.txt --json | jq '{tokens: .output.tokens, cuts}'
```

### Presets

| Preset | Keeps by default | Extra strippers |
| --- | --- | --- |
| `logs` | `code` | Prefer `ERROR`/`WARN`/`FATAL` when truncating |
| `email` | `headings`, `lists` | Quoted replies (`>` / `On … wrote:` / Original Message) |
| `chat` | `code`, `lists` | Reactions, join/leave system lines, lone timestamps |
| `html` | `headings`, `code`, `lists` | `<script>` / `<style>` / comments / tags → prose |

Explicit `--keep` always wins over the preset default.

### Before / after

Input (`examples/noisy.txt`) — repeated logs, a duplicated runbook, a signature, a fat blob:

```
[2026-03-14 09:01:02] INFO Starting request handler
[2026-03-14 09:01:02] DEBUG loading config from /etc/app/config.yaml
…
CONFIDENTIALITY NOTICE
…
Sent from my iPhone
data:image/png;base64,iVBORw0KGgo…   (huge)
```

```bash
context-diet examples/noisy.txt --keep headings|code|lists
# same fixture via --demo:
context-diet --demo --keep headings|code|lists
```

Stderr:

```
context-diet 0.3.0
source:   examples/noisy.txt
chars:    1,666 → 834  (−49.9%)
tokens:   ~667 → ~312  (−53.2%)
cut:
  ansi sequences        0
  html chrome           0
  quoted replies        0
  chat chrome           0
  boilerplate lines     9
  duplicate paragraphs  2
  whitespace runs       5
  omitted heavy blobs   1
  truncated blocks      0
  truncated tokens      ~0
  llm deepen            no
```

Stdout keeps the redis error, the unique runbook facts, the rollback list, and the `healthz` fence — not the fourth identical `DEBUG` line, not the iPhone signature, not the blob.

## What it does

All of this is **offline heuristics**. No network unless you pass `--deepen`.

| Step | Behavior |
| --- | --- |
| Strip ANSI | Terminal color / OSC sequences |
| Strip HTML | Optional / `--preset html`: scripts, styles, comments, tags |
| Omit heavy blobs | Long base64 / data-URIs → `[omitted blob: N chars]` |
| Collapse whitespace | Trailing space, squeezed blanks — **never inside code fences** |
| Drop boilerplate | Repeated log lines (timestamps/UUIDs normalized), signatures, `DEBUG` chrome, horizontal rules |
| Drop quoted replies | `--preset email`: `>` quotes, `On … wrote:`, Original Message tails |
| Drop chat chrome | `--preset chat`: reactions, join/leave, lone timestamps |
| Dedupe paragraphs | Exact and near-identical (Jaccard ≥ 0.84) prose/list blocks |
| Truncate | `--max-tokens N` drops low-value blocks first; `--keep` / presets pin types; `logs` also prefers error lines |

Token estimates are **cl100k-ish** (GPT-4 family grain: ~4 chars/word, 1 CJK char ≈ 1 token, punctuation is dense). Good enough to budget a prompt. Not a billed tokenizer — do not invoice with it.

## Usage

```
context-diet [file] [options]
```

| Flag | Meaning |
| --- | --- |
| `[file]` | Path to read. Omit or pass `-` to read stdin |
| `-o, --output <file>` | Write slimmed text here instead of stdout |
| `--max-tokens <n>` | Cap estimated output tokens |
| `--keep <cats>` | Prefer `headings`, `code`, `lists` when truncating (comma or `\|`) |
| `--preset <name>` | `logs` \| `email` \| `chat` \| `html` |
| `--demo` | Diet the bundled `examples/noisy.txt` (no file / clone needed) |
| `--json` | JSON report on stdout (includes `text`, unless `-o` / `--dry-run`) |
| `--dry-run` | Report only; do not emit slimmed body or write `-o` |
| `--diff` | Show removed lines on stderr (capped) |
| `--deepen` | Optional LLM rewrite (see below) |
| `--provider openai\|anthropic` | Force a provider for `--deepen` |
| `-q, --quiet` | No human report on stderr |
| `-h, --help` | Help |
| `-V, --version` | Version |

Default I/O: **slimmed body on stdout**, **human report on stderr**, so this stays pipe-friendly:

```bash
pbpaste | context-diet --preset chat --max-tokens 800 | pbcopy
```

The human report respects `NO_COLOR` / `FORCE_COLOR`.

## CI (GitHub Actions)

Copy-paste starter: [`examples/github-action.yml`](examples/github-action.yml).

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- name: Slim context
  run: |
    npx --yes @webywz/context-diet --demo --preset logs --max-tokens 400 > slim.txt
    # or: npx --yes @webywz/context-diet path/to/noisy.log --preset logs -o slim.txt
```

Body lands on stdout (or `-o`); the human report stays on stderr in the job log. Offline heuristics — no API key unless you add `--deepen`.

## Optional LLM pass

`--deepen` is **never required**. If you already have a key and want a second squeeze after the local diet:

```bash
export OPENAI_API_KEY=sk-...          # or ANTHROPIC_API_KEY
context-diet chapter.md --deepen --max-tokens 1200
```

Defaults: `gpt-4o-mini` / `claude-3-5-haiku-20241022` (override with `OPENAI_MODEL` or `ANTHROPIC_MODEL`). The local result wins if the model comes back *longer*. Without a key, `--deepen` exits `2` with a clear message and does not phone home.

## Library

```ts
import { diet, dietAsync, estimateTokens } from "@webywz/context-diet";

const { text, input, output, cuts } = diet(raw, {
  maxTokens: 2000,
  preset: "logs",
  keep: ["code"], // optional override
});

await dietAsync(raw, { deepen: true }); // keys from process.env
estimateTokens(text);                   // cl100k-ish heuristic
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Usage / missing input / unreadable file |
| 2 | `--deepen` failed (no key, HTTP error) |

## Development

```bash
npm test
npm run build
node dist/cli.js --help
node dist/cli.js --demo --preset logs --max-tokens 400
```

MIT © webywz
