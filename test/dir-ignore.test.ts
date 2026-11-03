import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createIgnoreMatcher } from "../src/ignore.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

describe("Directory ignore", () => {
  it("always ignores node_modules", async () => {
    const matcher = await createIgnoreMatcher(".", []);
    assert.equal(matcher.shouldIgnore("node_modules", true), true);
    assert.equal(matcher.shouldIgnore("node_modules/package", true), true);
    assert.equal(matcher.shouldIgnore("src/node_modules", true), true);
  });

  it("always ignores .git", async () => {
    const matcher = await createIgnoreMatcher(".", []);
    assert.equal(matcher.shouldIgnore(".git", true), true);
    assert.equal(matcher.shouldIgnore(".git/config", false), true);
    assert.equal(matcher.shouldIgnore("src/.git", true), true);
  });

  it("honors custom exclude patterns", async () => {
    const matcher = await createIgnoreMatcher(".", ["*.tmp", "test-*"]);
    assert.equal(matcher.shouldIgnore("file.tmp", false), true);
    assert.equal(matcher.shouldIgnore("test-data", true), true);
    assert.equal(matcher.shouldIgnore("file.txt", false), false);
  });

  it("does not ignore normal files", async () => {
    const matcher = await createIgnoreMatcher(".", []);
    assert.equal(matcher.shouldIgnore("src", true), false);
    assert.equal(matcher.shouldIgnore("README.md", false), false);
    assert.equal(matcher.shouldIgnore("package.json", false), false);
  });

  it("handles .gitignore patterns when file exists", async () => {
    const testDir = join(tmpdir(), `context-diet-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, ".git"), "");
    await writeFile(
      join(testDir, ".gitignore"),
      "*.log\ndist/\n# comment\n\n!important.log\n",
    );

    try {
      const matcher = await createIgnoreMatcher(testDir, []);
      assert.equal(matcher.shouldIgnore("test.log", false), true);
      assert.equal(matcher.shouldIgnore("dist", true), true);
      assert.equal(matcher.shouldIgnore("important.log", false), false);
      assert.equal(matcher.shouldIgnore("test.txt", false), false);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("continues without .gitignore when file is missing", async () => {
    const matcher = await createIgnoreMatcher("/nonexistent", []);
    assert.equal(matcher.shouldIgnore("node_modules", true), true);
    assert.equal(matcher.shouldIgnore("src/file.ts", false), false);
  });
});
