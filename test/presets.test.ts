import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diet } from "../src/diet.ts";
import { resolvePreset } from "../src/presets.ts";

describe("presets", () => {
  it("resolvePreset lets explicit keep win over preset defaults", () => {
    const r = resolvePreset("logs", ["headings", "lists"]);
    assert.deepEqual(r.keep, ["headings", "lists"]);
    assert.equal(r.preferErrors, true);
  });

  it("logs preset prefers ERROR lines under a tight budget", () => {
    const text = [
      "[2026-01-01 00:00:00] INFO starting up the service with a long banner about config",
      "[2026-01-01 00:00:01] DEBUG loading config from disk path that is quite verbose",
      "[2026-01-01 00:00:02] ERROR Cannot connect to redis://cache:6379",
      "[2026-01-01 00:00:03] INFO more filler that should be truncated away first",
    ].join("\n");
    const result = diet(text, { preset: "logs", maxTokens: 28 });
    assert.match(result.text, /ERROR Cannot connect/);
    assert.ok(result.output.tokens <= 28, result.text);
  });

  it("email preset strips quoted replies and signatures", () => {
    const text = [
      "Please ship the fix today.",
      "",
      "On Mon, Jan 1, 2026 at 9:00 AM Alice wrote:",
      "> old thread about lunch",
      "> more quote noise",
      "",
      "-----Original Message-----",
      "From: bob@example.com",
      "The entire previous thread lives here and should vanish.",
      "",
      "Sent from my iPhone",
    ].join("\n");
    const result = diet(text, { preset: "email" });
    assert.match(result.text, /Please ship the fix today/);
    assert.doesNotMatch(result.text, /old thread about lunch/);
    assert.doesNotMatch(result.text, /previous thread lives here/);
    assert.doesNotMatch(result.text, /iPhone/i);
    assert.ok(result.cuts.quotedReplies >= 1);
  });

  it("chat preset drops reactions and system chrome", () => {
    const text = [
      "alice: ship it",
      "👍 3",
      "[bob joined the channel]",
      "bob: looking now",
      "Today",
      "carol: lgtm",
    ].join("\n");
    const result = diet(text, { preset: "chat" });
    assert.match(result.text, /ship it/);
    assert.match(result.text, /looking now/);
    assert.doesNotMatch(result.text, /joined the channel/);
    assert.ok(result.cuts.chatChrome >= 1);
  });

  it("html preset strips tags and scripts", () => {
    const text = [
      "<html><head><style>.x{color:red}</style>",
      "<script>alert(1)</script></head>",
      "<body><h1>Title</h1><p>Hello&nbsp;world</p>",
      "<!-- noise --></body></html>",
    ].join("\n");
    const result = diet(text, { preset: "html" });
    assert.match(result.text, /Title/);
    assert.match(result.text, /Hello world/);
    assert.doesNotMatch(result.text, /alert/);
    assert.doesNotMatch(result.text, /color:red/);
    assert.doesNotMatch(result.text, /<h1>/);
    assert.ok(result.cuts.htmlChrome >= 1);
  });
});

  it("code preset strips long comments and keeps signatures under budget", () => {
    const text = [
      "/**",
      " * Enormous license / history dump that should vanish.",
      " * Line two of the dump.",
      " * Line three of the dump.",
      " * Line four of the dump.",
      " */",
      "export function greet(name: string): string {",
      "  // noisy note",
      "  return name;",
      "}",
      "",
      "",
      "",
      "export async function main(): Promise<void> {",
      "  greet('x');",
      "}",
    ].join("\n");
    const result = diet(text, { preset: "code", maxTokens: 40 });
    assert.match(result.text, /function greet/);
    assert.doesNotMatch(result.text, /Enormous license/);
    assert.ok(result.cuts.codeComments >= 1);
    assert.ok(result.output.tokens <= 40, result.text);
  });

  it("json preset drops null/empty fields and JSONC comments", () => {
    const text = `{
  "name": "demo",
  "description": "",
  "nested": { "keep": true, "dropMe": null },
  // trailing comment
  "list": [1, null, 2]
}`;
    const result = diet(text, { preset: "json" });
    assert.match(result.text, /"name": "demo"/);
    assert.doesNotMatch(result.text, /dropMe/);
    assert.doesNotMatch(result.text, /"description"/);
    assert.doesNotMatch(result.text, /trailing comment/);
    assert.ok(result.cuts.jsonFields >= 1);
    // still valid JSON
    JSON.parse(result.text);
  });

  it("json preset falls back to whitespace collapse for non-JSON", () => {
    const result = diet("hello   world\n\n\nbye", { preset: "json" });
    assert.match(result.text, /hello world/);
    assert.doesNotMatch(result.text, /\n{3,}/);
  });
