# context-diet

**Slim LLM context before you send it.** Drop the noise, keep the signal, estimate tokens — locally, offline, in milliseconds.

Engineers paste logs, docs, and chat history into models. Most of it is filler: repeated `DEBUG` lines, email signatures, duplicated paragraphs, 4KB of base64. `context-diet` is a small CLI that strips that chrome, optionally fits a token budget, and tells you what it cut.

```bash
npm i -g @webywz/context-diet
```

```bash
context-diet logs.txt --max-tokens 2000 --keep headings|code
```

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

# stdin
cat noisy.log | context-diet --max-tokens 1500 > slim.txt

# write the body to a file
context-diet notes.md -o slim.md --keep headings,code,lists

# machine-readable
context-diet input.txt --json | jq '{tokens: .output.tokens, cuts}'
```

### Before / after

Input (`examples/noisy.txt`) — repeated logs, a duplicated runbook, a signature, a fat blob:

```
[2026-03-14 09:01:02] INFO Starting request handler
[2026-03-14 09:01:02] DEBUG loading config from /etc/app/config.yaml
[2026-03-14 09:01:03] DEBUG loading config from /etc/app/config.yaml
[2026-03-14 09:01:03] DEBUG loading config from /etc/app/config.yaml
…
CONFIDENTIALITY NOTICE
This email is confidential and intended only for the recipient.
…

The deploy runbook covers staging and production.
The deploy runbook covers staging and production rollouts.
…

Sent from my iPhone
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAY…   (huge)
```

```bash
context-diet examples/noisy.txt --keep headings|code|lists
```

Stderr:

```
context-diet 0.1.0
source:   examples/noisy.txt
chars:    1,666 → 834  (−49.9%)
tokens:   ~667 → ~312  (−53.2%)
cut:
  ansi sequences        0
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
| Omit heavy blobs | Long base64 / data-URIs → `[omitted blob: N chars]` |
| Collapse whitespace | Trailing space, squeezed blanks — **never inside code fences** |
| Drop boilerplate | Repeated log lines (timestamps/UUIDs normalized), signatures, `DEBUG` chrome, horizontal rules |
| Dedupe paragraphs | Exact and near-identical (Jaccard ≥ 0.87) prose/list blocks |
| Truncate | `--max-tokens N` drops low-value blocks first; `--keep headings\|code\|lists` pins those types |

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
| `--json` | JSON report on stdout (includes `text`, unless `-o` was set) |
| `--deepen` | Optional LLM rewrite (see below) |
| `--provider openai\|anthropic` | Force a provider for `--deepen` |
| `-q, --quiet` | No human report on stderr |
| `-h, --help` | Help |
| `-V, --version` | Version |

Default I/O: **slimmed body on stdout**, **human report on stderr**, so this stays pipe-friendly:

```bash
pbpaste | context-diet --max-tokens 800 --keep code | pbcopy
```

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
  keep: ["headings", "code"],
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
```

MIT © webywz
