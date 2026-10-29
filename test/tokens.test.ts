import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens } from "../src/tokens.ts";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("counts short English words as about one token each", () => {
    const n = estimateTokens("hello world");
    assert.ok(n >= 2 && n <= 4, `got ${n}`);
  });

  it("grows roughly linearly with prose length", () => {
    const sentence = "Context windows fill up with logs, stack traces, and duplicated docs. ";
    const small = estimateTokens(sentence);
    const large = estimateTokens(sentence.repeat(10));
    assert.ok(small >= 8 && small <= 24, `small=${small}`);
    assert.ok(large > small * 8, `large=${large} small=${small}`);
    assert.ok(large < small * 12, `large=${large} small=${small}`);
  });

  it("treats CJK characters as roughly one token each", () => {
    const n = estimateTokens("中文测试");
    assert.equal(n, 4);
  });

  it("charges punctuation and code-like text more densely than prose", () => {
    const prose = "function adds two numbers together nicely";
    const code = "fn(a,b){return a+b;}";
    const proseN = estimateTokens(prose);
    const codeN = estimateTokens(code);
    assert.ok(codeN > proseN, `code=${codeN} prose=${proseN}`);
  });
});
