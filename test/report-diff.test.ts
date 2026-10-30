import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatHumanReport,
  formatRemovedDiff,
  shouldUseColor,
} from "../src/report.ts";
import { emptyCuts, type DietResult } from "../src/types.ts";

function sample(): DietResult {
  return {
    text: "kept\n",
    input: { chars: 20, tokens: 5 },
    output: { chars: 5, tokens: 1 },
    cuts: emptyCuts(),
  };
}

describe("report color + diff", () => {
  it("shouldUseColor respects NO_COLOR and FORCE_COLOR", () => {
    assert.equal(shouldUseColor({ NO_COLOR: "1" }, true), false);
    assert.equal(shouldUseColor({ FORCE_COLOR: "1" }, false), true);
    assert.equal(shouldUseColor({ FORCE_COLOR: "0" }, true), false);
    assert.equal(shouldUseColor({}, true), true);
    assert.equal(shouldUseColor({}, false), false);
  });

  it("formatHumanReport adds ANSI when color is on", () => {
    const plain = formatHumanReport(sample(), "stdin", "0.2.0", { color: false });
    const colored = formatHumanReport(sample(), "stdin", "0.2.0", { color: true });
    assert.doesNotMatch(plain, /\u001b\[/);
    assert.match(colored, /\u001b\[/);
    assert.match(plain, /html chrome/);
  });

  it("formatRemovedDiff lists disappeared lines", () => {
    const diff = formatRemovedDiff(
      "keep me\ndrop me\nkeep me\n",
      "keep me\nkeep me\n",
      { color: false },
    );
    assert.match(diff, /^- drop me$/m);
    assert.doesNotMatch(diff, /^- keep me$/m);
  });
});
