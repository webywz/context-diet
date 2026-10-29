import type { LlmProvider } from "./types.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT =
  "You compress context that will be sent to another LLM. " +
  "Remove redundancy, filler, repeated logs, and hedging. " +
  "Keep facts, identifiers, file paths, error messages, code, numbers, and headings. " +
  "Do not add new facts. Do not wrap the result in markdown fences. " +
  "Output only the compressed text.";

export class DeepenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepenError";
  }
}

export function resolveProvider(
  env: NodeJS.ProcessEnv,
  requested?: LlmProvider,
): LlmProvider | null {
  if (requested) return requested;
  if (env.OPENAI_API_KEY) return "openai";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function hasAnyKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
}

interface ChatResult {
  text: string;
}

async function openaiChat(
  text: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<ChatResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new DeepenError(
      "OPENAI_API_KEY is not set. Pass a key or omit --deepen; the local diet still works.",
    );
  }
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetchFn(OPENAI_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DeepenError(
      `OpenAI request failed (${res.status}): ${body.slice(0, 240) || res.statusText}`,
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = json.choices?.[0]?.message?.content?.trim();
  if (!out) throw new DeepenError("OpenAI returned an empty completion.");
  return { text: out };
}

async function anthropicChat(
  text: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): Promise<ChatResult> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new DeepenError(
      "ANTHROPIC_API_KEY is not set. Pass a key or omit --deepen; the local diet still works.",
    );
  }
  const model = env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
  const res = await fetchFn(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DeepenError(
      `Anthropic request failed (${res.status}): ${body.slice(0, 240) || res.statusText}`,
    );
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const out = json.content
    ?.filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();
  if (!out) throw new DeepenError("Anthropic returned an empty completion.");
  return { text: out };
}

export async function deepenText(
  text: string,
  options: {
    provider?: LlmProvider;
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new DeepenError(
      "fetch is not available. Use Node 18+ or omit --deepen.",
    );
  }
  const provider = resolveProvider(env, options.provider);
  if (!provider) {
    throw new DeepenError(
      "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use --deepen.",
    );
  }
  const result =
    provider === "openai"
      ? await openaiChat(text, env, fetchFn)
      : await anthropicChat(text, env, fetchFn);
  return result.text;
}
