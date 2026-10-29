import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinBlocks, parseBlocks } from "../src/blocks.ts";

describe("parseBlocks", () => {
  it("keeps fenced code as a single block", () => {
    const text = ["# Title", "", "```js", "console.log(1)", "```", "", "done"].join(
      "\n",
    );
    const types = parseBlocks(text).map((b) => b.type);
    assert.deepEqual(
      types.filter((t) => t !== "blank"),
      ["heading", "code", "paragraph"],
    );
  });

  it("groups list items into one list block", () => {
    const text = ["- alpha", "- beta", "", "next"].join("\n");
    const blocks = parseBlocks(text).filter((b) => b.type !== "blank");
    assert.equal(blocks[0]?.type, "list");
    assert.match(blocks[0]?.raw ?? "", /alpha/);
    assert.equal(blocks[1]?.type, "paragraph");
  });

  it("round-trips headings and paragraphs through joinBlocks", () => {
    const text = "# Hello\n\nWorld.\n";
    const joined = joinBlocks(parseBlocks(text));
    assert.match(joined, /# Hello/);
    assert.match(joined, /World\./);
  });
});
