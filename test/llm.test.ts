import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deepenText, DeepenError, resolveProvider } from "../src/llm.ts";

describe("llm deepen", () => {
  it("resolves openai before anthropic when both keys exist", () => {
    assert.equal(
      resolveProvider({ OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b" }),
      "openai",
    );
    assert.equal(resolveProvider({ ANTHROPIC_API_KEY: "b" }), "anthropic");
    assert.equal(resolveProvider({}), null);
  });

  it("throws a helpful error without keys", async () => {
    await assert.rejects(
      () => deepenText("hi", { env: {} }),
      (err: unknown) => err instanceof DeepenError,
    );
  });

  it("calls OpenAI with a compression prompt", async () => {
    let url = "";
    let body = "";
    const fetchMock: typeof fetch = async (input, init) => {
      url = String(input);
      body = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "compressed" } }],
        }),
        { status: 200 },
      );
    };
    const out = await deepenText("verbose text ".repeat(20), {
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: fetchMock,
    });
    assert.equal(out, "compressed");
    assert.match(url, /api\.openai\.com/);
    assert.match(body, /compress context/i);
  });

  it("calls Anthropic when requested", async () => {
    let url = "";
    const fetchMock: typeof fetch = async (input) => {
      url = String(input);
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "short" }],
        }),
        { status: 200 },
      );
    };
    const out = await deepenText("hello", {
      provider: "anthropic",
      env: { ANTHROPIC_API_KEY: "ak-test" },
      fetch: fetchMock,
    });
    assert.equal(out, "short");
    assert.match(url, /api\.anthropic\.com/);
  });

  it("surfaces HTTP errors", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response("nope", { status: 401, statusText: "Unauthorized" });
    await assert.rejects(
      () =>
        deepenText("x", {
          env: { OPENAI_API_KEY: "sk-test" },
          fetch: fetchMock,
        }),
      /401/,
    );
  });
});
