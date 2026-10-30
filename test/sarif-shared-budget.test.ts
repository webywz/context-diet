import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { run } from "../src/cli.ts";
import { formatSarif, renderSarif } from "../src/sarif.ts";
import { diet } from "../src/diet.ts";
import { toJsonReport } from "../src/report.ts";
import { PassThrough } from "node:stream";

describe("SARIF (0.9)", () => {
  it("emits zero results under budget", () => {
    const result = diet("hello world", { maxTokens: 100 });
    const sarif = renderSarif(result, "x.txt", "0.9.0", { failOverTokens: 1000 });
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0]!.results.length, 0);
  });

  it("emits over-fail-over-tokens result", () => {
    const result = diet("hello world ".repeat(200), {});
    const sarif = renderSarif(result, "big.txt", "0.9.0", { failOverTokens: 1 });
    assert.ok(sarif.runs[0]!.results.length >= 1);
    assert.equal(sarif.runs[0]!.results[0]!.ruleId, "over-fail-over-tokens");
    const xml = formatSarif(result, "big.txt", "0.9.0", { failOverTokens: 1 });
    assert.match(xml, /"version": "2.1.0"/);
  });
});

describe("shared budget JSON (0.9)", () => {
  it("marks shared when multiple sources", () => {
    const result = diet("aaaa bbbb cccc", { maxTokens: 50 });
    const json = toJsonReport(result, "2 files", 100, {
      maxTokens: 50,
      sources: ["a.txt", "b.txt"],
    });
    assert.deepEqual(json.sources, ["a.txt", "b.txt"]);
    assert.equal(json.budget.shared, true);
    assert.equal(json.budget.maxTokens, 50);
    assert.equal(json.budget.failOverTokens, 100);
  });

  it("shared=false for single source", () => {
    const result = diet("hi", {});
    const json = toJsonReport(result, "a.txt", undefined, { sources: ["a.txt"] });
    assert.equal(json.budget.shared, false);
    assert.equal(json.budget.maxTokens, null);
  });
});

describe("CLI multi-file + --sarif", () => {
  it("diets multiple files under one max-tokens and writes sarif", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cd-multi-"));
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    const sarifPath = join(dir, "out.sarif");
    writeFileSync(a, "alpha ".repeat(40));
    writeFileSync(b, "bravo ".repeat(40));
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let out = "";
    stdout.on("data", (c) => {
      out += c;
    });
    try {
      const code = await run(
        [a, b, "--max-tokens", "80", "--json", "--sarif", sarifPath, "--fail-over-tokens", "10000"],
        {
          stdin: new PassThrough(),
          stdout,
          stderr,
          stdinIsTTY: true,
          stderrIsTTY: false,
          env: { ...process.env, NO_COLOR: "1" },
          readFile: async (path) => readFileSync(path, "utf8"),
          writeFile: async (path, contents) => {
            writeFileSync(path, contents);
          },
        },
      );
      assert.equal(code, 0);
      const report = JSON.parse(out) as {
        sources?: string[];
        budget: { shared: boolean; maxTokens: number | null; ok: boolean };
      };
      assert.equal(report.budget.shared, true);
      assert.equal(report.budget.maxTokens, 80);
      assert.ok(report.sources && report.sources.length === 2);
      const body = JSON.parse(readFileSync(sarifPath, "utf8")) as { version: string };
      assert.equal(body.version, "2.1.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("expands a directory into shared inputs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cd-dir-"));
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(join(dir, "one.txt"), "one one one");
    writeFileSync(join(dir, "two.txt"), "two two two");
    writeFileSync(join(dir, "nested", "skip-me.txt"), "nested"); // non-recursive
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (c) => {
      out += c;
    });
    try {
      const code = await run([dir, "--json", "--max-tokens", "50"], {
        stdin: new PassThrough(),
        stdout,
        stderr: new PassThrough(),
        stdinIsTTY: true,
        stderrIsTTY: false,
        env: { ...process.env, NO_COLOR: "1" },
        readFile: async (path) => readFileSync(path, "utf8"),
        writeFile: async () => {},
      });
      assert.equal(code, 0);
      const report = JSON.parse(out) as { sources?: string[]; budget: { shared: boolean } };
      assert.equal(report.budget.shared, true);
      assert.equal(report.sources?.length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
