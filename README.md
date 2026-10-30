# context-diet

[![npm](https://img.shields.io/npm/v/@webywz/context-diet?style=flat-square&color=111111&labelColor=eeeeee)](https://www.npmjs.com/package/@webywz/context-diet)
[![node](https://img.shields.io/node/v/@webywz/context-diet?style=flat-square&color=111111&labelColor=eeeeee)](https://www.npmjs.com/package/@webywz/context-diet)
[![license](https://img.shields.io/npm/l/@webywz/context-diet?style=flat-square&color=111111&labelColor=eeeeee)](./LICENSE)

> **Slim LLM context before you send it.**
>
> **把要喂给模型的上下文先瘦身。**

Drop noise, keep signal, estimate tokens — locally, offline, in milliseconds.

丢掉噪声，留下信号，估算 token —— 本地、离线、毫秒级。

---

## English

### Demo

```bash
npx @webywz/context-diet --demo --preset logs --max-tokens 400
```

Bundled `examples/noisy.txt` goes in; slimmed body on **stdout**, human report on **stderr**. No clone required — `examples/` ships in the npm package.

```text
context-diet 0.4.0
source:   examples/noisy.txt
chars:    1,666 → 834  (−49.9%)
tokens:   ~667 → ~312  (−53.2%)
cut:
  boilerplate lines     9
  duplicate paragraphs  2
  omitted heavy blobs   1
  …
```

### Features

| | |
| --- | --- |
| **Offline heuristics** | Strip ANSI/HTML chrome, drop boilerplate, dedupe, omit base64 blobs |
| **Presets** | `logs`, `email`, `chat`, `html` — sensible keep/strip defaults |
| **Budget** | `--max-tokens` drops low-value blocks first; `--keep` pins headings/code/lists |
| **Pipe-friendly** | Slimmed body → stdout; report → stderr |
| **Bundled examples** | `--demo` / `examples/noisy.txt` in the published tarball |
| **Optional deepen** | `--deepen` LLM second pass only when you opt in with a key |
| **Step summary** | `--github-summary` appends a short diet report to `$GITHUB_STEP_SUMMARY` |

### Install

```bash
npm i -g @webywz/context-diet
```

Node 18+. No tokenizer files, no GPU, no account.

```bash
npx @webywz/context-diet --help
```

### Quick start

```bash
context-diet input.txt
npx @webywz/context-diet --demo --preset logs --max-tokens 400
cat noisy.log | context-diet --preset logs --max-tokens 1500 > slim.txt
context-diet notes.md -o slim.md --keep headings,code,lists
context-diet input.txt --dry-run --diff
context-diet input.txt --json | jq '{tokens: .output.tokens, cuts}'
context-diet examples/noisy.txt --keep headings|code|lists
```

### Presets

| Preset | Keeps by default | Extra strippers |
| --- | --- | --- |
| `logs` | `code` | Prefer `ERROR` / `WARN` / `FATAL` when truncating |
| `email` | `headings`, `lists` | Quoted replies (`>` / `On … wrote:` / Original Message) |
| `chat` | `code`, `lists` | Reactions, join/leave, lone timestamps |
| `html` | `headings`, `code`, `lists` | `<script>` / `<style>` / comments / tags → prose |

Explicit `--keep` always wins over the preset default.

### What it does

All offline unless you pass `--deepen`.

| Step | Behavior |
| --- | --- |
| Strip ANSI | Terminal color / OSC sequences |
| Strip HTML | Optional / `--preset html` |
| Omit heavy blobs | Long base64 / data-URIs → `[omitted blob: N chars]` |
| Collapse whitespace | Never inside code fences |
| Drop boilerplate | Repeated log lines, signatures, `DEBUG` chrome |
| Drop quoted / chat chrome | Email quotes; reactions / join-leave |
| Dedupe paragraphs | Exact and near-identical (Jaccard ≥ 0.84) |
| Truncate | `--max-tokens` + `--keep` / presets |

Token estimates are **cl100k-ish** (~4 chars/word, 1 CJK ≈ 1 token). Good enough to budget a prompt — not a billed tokenizer.

### CLI

```
context-diet [file] [options]
```

| Flag | Meaning |
| --- | --- |
| `[file]` | Path to read; omit or `-` for stdin |
| `-o, --output <file>` | Write slimmed text here instead of stdout |
| `--max-tokens <n>` | Cap estimated output tokens |
| `--keep <cats>` | Prefer `headings`, `code`, `lists` when truncating (comma or `\|`) |
| `--preset <name>` | `logs` \| `email` \| `chat` \| `html` |
| `--demo` | Diet bundled `examples/noisy.txt` |
| `--json` | JSON report on stdout |
| `--dry-run` | Report only; no body / no `-o` write |
| `--diff` | Show removed lines on stderr (capped) |
| `--deepen` | Optional LLM rewrite |
| `--provider openai\|anthropic` | Force provider for `--deepen` |
| `--github-summary [path]` | Append diet Markdown to `$GITHUB_STEP_SUMMARY` or path |
| `-q, --quiet` | No human report on stderr |
| `-h, --help` / `-V, --version` | Help / version |

Default I/O stays pipe-friendly:

```bash
pbpaste | context-diet --preset chat --max-tokens 800 | pbcopy
```

### Optional LLM pass

`--deepen` is never required. With a key:

```bash
export OPENAI_API_KEY=sk-...          # or ANTHROPIC_API_KEY
context-diet chapter.md --deepen --max-tokens 1200
```

Defaults: `gpt-4o-mini` / `claude-3-5-haiku-20241022` (`OPENAI_MODEL` / `ANTHROPIC_MODEL`). Local result wins if the model returns longer text. Without a key, `--deepen` exits `2` and does not phone home.

### CI (GitHub Actions)

Starter: [`examples/github-action.yml`](examples/github-action.yml) (includes `--github-summary`).

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- name: Slim context
  run: |
    npx --yes @webywz/context-diet --demo --preset logs --max-tokens 400 > slim.txt
```

### Library

```ts
import { diet, dietAsync, estimateTokens } from "@webywz/context-diet";

const { text, input, output, cuts } = diet(raw, {
  maxTokens: 2000,
  preset: "logs",
  keep: ["code"],
});

await dietAsync(raw, { deepen: true });
estimateTokens(text);
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Usage / missing input / unreadable file |
| `2` | `--deepen` failed (no key, HTTP error) |

### Develop

```bash
npm test && npm run build
node dist/cli.js --demo --preset logs --max-tokens 400
```

### Links

| | |
| --- | --- |
| npm | [npmjs.com/package/@webywz/context-diet](https://www.npmjs.com/package/@webywz/context-diet) |
| Issues | [github.com/webywz/context-diet/issues](https://github.com/webywz/context-diet/issues) |
| License | [MIT](./LICENSE) © webywz |

---

## 中文

### 演示

```bash
npx @webywz/context-diet --demo --preset logs --max-tokens 400
```

包内自带 `examples/noisy.txt`（随 npm 包发布）：瘦身后的正文在 **stdout**，人类可读报告在 **stderr**。无需 clone。

### 功能

| | |
| --- | --- |
| **离线启发式** | 剥 ANSI/HTML、去样板、去重、省略 base64 大块 |
| **预设** | `logs` / `email` / `chat` / `html` |
| **预算** | `--max-tokens` 优先丢掉低价值块；`--keep` 钉住标题/代码/列表 |
| **管道友好** | 正文 → stdout；报告 → stderr |
| **示例随包** | `--demo` / `examples/noisy.txt` 在发布 tarball 里 |
| **可选 deepen** | `--deepen` 仅在有 key 且你主动开启时走 LLM |
| **Step Summary** | `--github-summary`：把精简饮食报告追加到 `$GITHUB_STEP_SUMMARY` |

### 安装

```bash
npm i -g @webywz/context-diet
```

需要 Node 18+。无 tokenizer 文件、无 GPU、无账号。

### 快速开始

```bash
context-diet input.txt
npx @webywz/context-diet --demo --preset logs --max-tokens 400
cat noisy.log | context-diet --preset logs --max-tokens 1500 > slim.txt
context-diet notes.md -o slim.md --keep headings,code,lists
context-diet input.txt --dry-run --diff
context-diet input.txt --json | jq '{tokens: .output.tokens, cuts}'
context-diet examples/noisy.txt --keep headings|code|lists
```

### 预设

| 预设 | 默认保留 | 额外剥离 |
| --- | --- | --- |
| `logs` | `code` | 截断时优先保留 `ERROR` / `WARN` / `FATAL` |
| `email` | `headings`, `lists` | 引用回复（`>` / `On … wrote:` / Original Message） |
| `chat` | `code`, `lists` | 表情反应、进出房系统行、孤立时间戳 |
| `html` | `headings`, `code`, `lists` | `<script>` / `<style>` / 注释 / 标签 → 纯文本 |

显式 `--keep` 始终覆盖预设默认。

### 做了什么

除 `--deepen` 外全部离线。

| 步骤 | 行为 |
| --- | --- |
| 剥 ANSI | 终端颜色 / OSC |
| 剥 HTML | 可选 / `--preset html` |
| 省略大块 | 长 base64 / data-URI → `[omitted blob: N chars]` |
| 折叠空白 | 代码围栏内不动 |
| 去样板 | 重复日志行、签名、`DEBUG` 噪声 |
| 去引用 / 聊天 chrome | 邮件引用；反应 / 进出房 |
| 段落去重 | 精确与近似（Jaccard ≥ 0.84） |
| 截断 | `--max-tokens` + `--keep` / 预设 |

Token 估算为 **cl100k 近似**（约 4 字符/词，1 个 CJK ≈ 1 token）。够用来做预算，不是计费 tokenizer。

### 命令行要点

| 参数 | 含义 |
| --- | --- |
| `[file]` | 读取路径；省略或 `-` 读 stdin |
| `-o, --output <file>` | 把瘦身正文写到文件 |
| `--max-tokens <n>` | 估算输出 token 上限 |
| `--keep <cats>` | 截断时优先保留 `headings` / `code` / `lists` |
| `--preset <name>` | `logs` \| `email` \| `chat` \| `html` |
| `--demo` | 对包内 `examples/noisy.txt` 瘦身 |
| `--json` | stdout 输出 JSON 报告 |
| `--dry-run` | 只报告，不写正文 |
| `--diff` | stderr 显示被删行（有上限） |
| `--deepen` | 可选 LLM 二次压缩 |
| `--provider openai\|anthropic` | 强制 deepen 提供商 |
| `--github-summary [path]` | 追加饮食 Markdown 到 `$GITHUB_STEP_SUMMARY` 或指定路径 |
| `-q, --quiet` | 不打印人类报告 |

默认 I/O 适合管道：

```bash
pbpaste | context-diet --preset chat --max-tokens 800 | pbcopy
```

### 可选 LLM 二次压缩

`--deepen` **不是必须的**。有 key 时：

```bash
export OPENAI_API_KEY=sk-...          # 或 ANTHROPIC_API_KEY
context-diet chapter.md --deepen --max-tokens 1200
```

默认模型：`gpt-4o-mini` / `claude-3-5-haiku-20241022`。若模型返回更长，保留本地结果。无 key 时 `--deepen` 退出码 `2`，不会联网。

### 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 用法错误 / 缺输入 / 文件不可读 |
| `2` | `--deepen` 失败（无 key、HTTP 错误） |

### 链接

| | |
| --- | --- |
| npm | [npmjs.com/package/@webywz/context-diet](https://www.npmjs.com/package/@webywz/context-diet) |
| Issues | [github.com/webywz/context-diet/issues](https://github.com/webywz/context-diet/issues) |
| License | [MIT](./LICENSE) © webywz |
