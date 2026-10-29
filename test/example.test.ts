import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { diet } from "../src/diet.ts";

const example = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "noisy.txt"),
  "utf8",
);

describe("examples/noisy.txt", () => {
  it("keeps signal and drops the obvious filler", () => {
    const result = diet(example, { keep: ["headings", "code", "lists"] });
    assert.ok(result.output.chars < result.input.chars);
    assert.ok(result.output.tokens < result.input.tokens);
    assert.match(result.text, /Cannot connect to redis/);
    assert.match(result.text, /healthz/);
    assert.match(result.text, /# Deploy runbook/);
    assert.match(result.text, /kubectl rollout undo/);
    assert.doesNotMatch(result.text, /Sent from my iPhone/i);
    assert.doesNotMatch(result.text, /iVBORw0KGgo/);
    const debugHits = result.text.match(/loading config/g) ?? [];
    assert.ok(debugHits.length <= 2, result.text);
  });
});
