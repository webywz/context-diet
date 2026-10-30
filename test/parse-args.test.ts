import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, UsageError } from "../src/parse-args.ts";

describe("parseArgs", () => {
  it("parses a file and common flags", () => {
    const args = parseArgs([
      "input.txt",
      "--max-tokens",
      "800",
      "--keep",
      "headings|code",
      "--json",
      "-o",
      "out.txt",
    ]);
    assert.equal(args.file, "input.txt");
    assert.equal(args.maxTokens, 800);
    assert.deepEqual(args.keep, ["headings", "code"]);
    assert.equal(args.json, true);
    assert.equal(args.output, "out.txt");
  });

  it("accepts --keep=code,lists and --max-tokens=12", () => {
    const args = parseArgs(["--keep=code,lists", "--max-tokens=12", "-"]);
    assert.deepEqual(args.keep, ["code", "lists"]);
    assert.equal(args.maxTokens, 12);
    assert.equal(args.file, "-");
  });

  it("rejects unknown keep values", () => {
    assert.throws(() => parseArgs(["--keep", "tables"]), UsageError);
  });

  it("rejects extra positionals", () => {
    assert.throws(() => parseArgs(["a.txt", "b.txt"]), UsageError);
  });

  it("parses --provider", () => {
    const args = parseArgs(["--deepen", "--provider", "anthropic"]);
    assert.equal(args.deepen, true);
    assert.equal(args.provider, "anthropic");
  });
});

describe("parseArgs presets / dry-run / diff", () => {
  it("parses --preset and --dry-run --diff", () => {
    const args = parseArgs([
      "in.txt",
      "--preset",
      "email",
      "--dry-run",
      "--diff",
    ]);
    assert.equal(args.preset, "email");
    assert.equal(args.dryRun, true);
    assert.equal(args.diff, true);
  });

  it("rejects unknown presets", () => {
    assert.throws(() => parseArgs(["--preset", "slides"]), UsageError);
  });

  it("accepts --preset=html", () => {
    const args = parseArgs(["--preset=html", "-"]);
    assert.equal(args.preset, "html");
  });
});

describe("parseArgs --demo", () => {
  it("parses --demo", () => {
    const args = parseArgs(["--demo", "--preset", "logs", "--max-tokens", "400"]);
    assert.equal(args.demo, true);
    assert.equal(args.preset, "logs");
    assert.equal(args.maxTokens, 400);
    assert.equal(args.file, undefined);
  });

  it("rejects --demo with a file", () => {
    assert.throws(() => parseArgs(["--demo", "noisy.txt"]), UsageError);
  });
});
