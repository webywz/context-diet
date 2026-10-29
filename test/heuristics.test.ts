import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diet } from "../src/diet.ts";

describe("heuristics", () => {
  it("collapses extra blank lines and trailing space", () => {
    const result = diet("hello   \n\n\n\nworld  \n");
    assert.equal(result.text, "hello\n\nworld\n");
    assert.ok(result.cuts.whitespaceRuns >= 1);
  });

  it("strips ANSI color codes", () => {
    const result = diet("\u001b[31mred\u001b[0m alert");
    assert.equal(result.text, "red alert\n");
    assert.ok(result.cuts.ansiSequences >= 2);
  });

  it("drops repeated log boilerplate while keeping the first copies", () => {
    const lines = [
      "[2026-01-01 00:00:00] DEBUG loading config",
      "[2026-01-01 00:00:01] DEBUG loading config",
      "[2026-01-01 00:00:02] DEBUG loading config",
      "[2026-01-01 00:00:03] DEBUG loading config",
      "[2026-01-01 00:00:04] ERROR boom",
    ];
    const result = diet(lines.join("\n"));
    const debugHits = result.text.match(/loading config/g) ?? [];
    assert.ok(debugHits.length <= 2, result.text);
    assert.match(result.text, /ERROR boom/);
    assert.ok(result.cuts.boilerplateLines >= 2);
  });

  it("removes email signatures and confidentiality chrome", () => {
    const result = diet(
      "Ship it tomorrow.\n\nSent from my iPhone\nThis email is confidential and intended only for the recipient.\n",
    );
    assert.match(result.text, /Ship it tomorrow/);
    assert.doesNotMatch(result.text, /iPhone/i);
    assert.ok(result.cuts.boilerplateLines >= 1);
  });

  it("dedupes near-identical paragraphs", () => {
    const result = diet(
      [
        "The deploy runbook covers staging and production rollouts.",
        "",
        "The deploy runbook covers staging and production rollouts!",
        "",
        "Keep this unique conclusion about DNS TTL.",
      ].join("\n"),
    );
    const hits = result.text.match(/deploy runbook/g) ?? [];
    assert.equal(hits.length, 1, result.text);
    assert.match(result.text, /DNS TTL/);
    assert.equal(result.cuts.duplicateParagraphs, 1);
  });

  it("does not treat code-fence contents as duplicate prose", () => {
    const result = diet(
      [
        "```",
        "repeated body",
        "```",
        "",
        "repeated body",
        "",
        "repeated body that is a longer paragraph used only in prose form here.",
      ].join("\n"),
    );
    assert.match(result.text, /```/);
    assert.ok(
      (result.text.match(/repeated body/g) ?? []).length >= 2,
      result.text,
    );
  });

  it("replaces long blobs with a placeholder", () => {
    const blob = "A".repeat(80) + "B".repeat(80);
    const result = diet(`payload ${blob} done`);
    assert.match(result.text, /omitted blob/);
    assert.doesNotMatch(result.text, /AAAA/);
    assert.equal(result.cuts.omittedHeavyBlobs, 1);
  });
});
