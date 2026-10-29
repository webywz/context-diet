import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diet, dietAsync } from "../src/diet.ts";
import { estimateTokens } from "../src/tokens.ts";

const SAMPLE = [
  "# Overview",
  "",
  "This paragraph is filler that explains the same idea several times in a row with extra words.",
  "",
  "```ts",
  "export const TOKEN = 'keep-me';",
  "```",
  "",
  "- keep this list item about rollback",
  "- keep the second list item too",
  "",
  "More filler paragraph that exists only to consume the token budget of the diet.",
].join("\n");

describe("diet", () => {
  it("reports smaller or equal output than input", () => {
    const noisy = "hi\n\n\n\nhi\n\n\n\nhi\n";
    const result = diet(noisy);
    assert.ok(result.output.chars <= result.input.chars);
    assert.ok(result.text.length > 0);
  });

  it("honors max-tokens as an upper bound (estimated)", () => {
    const result = diet(SAMPLE, { maxTokens: 40 });
    assert.ok(
      result.output.tokens <= 40,
      `tokens=${result.output.tokens} text=${result.text}`,
    );
    assert.ok(result.cuts.truncatedBlocks >= 1);
  });

  it("prefers code fences when --keep code is set", () => {
    const result = diet(SAMPLE, { maxTokens: 28, keep: ["code"] });
    assert.match(result.text, /keep-me/);
    assert.ok(result.output.tokens <= 28, result.text);
  });

  it("prefers headings when --keep headings is set", () => {
    const result = diet(SAMPLE, { maxTokens: 24, keep: ["headings"] });
    assert.match(result.text, /# Overview/);
  });

  it("prefers lists when --keep lists is set", () => {
    const result = diet(SAMPLE, { maxTokens: 30, keep: ["lists"] });
    assert.match(result.text, /rollback/);
  });

  it("leaves already-slim text mostly alone", () => {
    const text = "Just the facts.\n";
    const result = diet(text);
    assert.equal(result.text.trim(), "Just the facts.");
    assert.equal(result.output.tokens, estimateTokens(result.text));
  });
});

describe("dietAsync", () => {
  it("matches diet when deepen is off", async () => {
    const a = diet(SAMPLE);
    const b = await dietAsync(SAMPLE);
    assert.equal(b.text, a.text);
    assert.equal(b.cuts.deepened, false);
  });

  it("uses the LLM pass when deepen is on and keeps the smaller text", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "TOKEN keep-me\nrollback\n" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const result = await dietAsync(SAMPLE, {
      deepen: true,
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: fetchMock,
    });
    assert.equal(result.cuts.deepened, true);
    assert.match(result.text, /keep-me/);
    assert.ok(result.output.tokens <= diet(SAMPLE).output.tokens);
  });
});
