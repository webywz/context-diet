import { readFile, stat } from "node:fs/promises";
import { join, sep, parse } from "node:path";

export interface IgnoreMatcher {
  shouldIgnore(relativePath: string, isDirectory: boolean): boolean;
}

function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;
  
  while (i < pattern.length) {
    const char = pattern[i]!;
    
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          regexStr += "(?:.*\\/)?";
          i += 3;
          continue;
        }
        regexStr += ".*";
        i += 2;
        continue;
      }
      regexStr += "[^/]*";
      i++;
      continue;
    }
    
    if (char === "?") {
      regexStr += "[^/]";
      i++;
      continue;
    }
    
    if (".+^${}()|[]\\".includes(char)) {
      regexStr += "\\" + char;
    } else {
      regexStr += char;
    }
    i++;
  }
  
  return new RegExp(`^${regexStr}$`);
}

function matchPattern(pattern: string, path: string): boolean {
  try {
    const regex = globToRegex(pattern);
    return regex.test(path);
  } catch {
    return false;
  }
}

class GitignoreMatcher implements IgnoreMatcher {
  private patterns: Array<{ pattern: string; negated: boolean; dirOnly: boolean }> = [];
  private defaultIgnores = ["node_modules", ".git"];
  private customExcludes: string[];

  constructor(gitignoreContent: string | null, customExcludes: string[]) {
    this.customExcludes = customExcludes;
    
    if (gitignoreContent) {
      const lines = gitignoreContent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        let pattern = trimmed;
        let negated = false;
        let dirOnly = false;

        if (pattern.startsWith("!")) {
          negated = true;
          pattern = pattern.slice(1);
        }

        if (pattern.endsWith("/")) {
          dirOnly = true;
          pattern = pattern.slice(0, -1);
        }

        if (pattern.startsWith("/")) {
          pattern = pattern.slice(1);
        }

        this.patterns.push({ pattern, negated, dirOnly });
      }
    }
  }

  shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
    const normalized = relativePath.split(sep).join("/");
    const parts = normalized.split("/");

    for (const defaultIgnore of this.defaultIgnores) {
      if (parts.includes(defaultIgnore)) {
        return true;
      }
    }

    for (const exclude of this.customExcludes) {
      if (matchPattern(exclude, normalized) || parts.some(p => matchPattern(exclude, p))) {
        return true;
      }
    }

    let ignored = false;
    for (const { pattern, negated, dirOnly } of this.patterns) {
      if (dirOnly && !isDirectory) continue;

      const matches =
        matchPattern(pattern, normalized) ||
        parts.some((_, idx) => {
          const subPath = parts.slice(idx).join("/");
          return matchPattern(pattern, subPath);
        });

      if (matches) {
        ignored = !negated;
      }
    }

    return ignored;
  }
}

export async function createIgnoreMatcher(
  dirPath: string,
  customExcludes: string[],
): Promise<IgnoreMatcher> {
  let gitignoreContent: string | null = null;

  try {
    const gitRoot = await findGitRoot(dirPath);
    if (gitRoot) {
      const gitignorePath = join(gitRoot, ".gitignore");
      gitignoreContent = await readFile(gitignorePath, "utf8");
    }
  } catch {
    // .gitignore not found or unreadable; continue without it
  }

  return new GitignoreMatcher(gitignoreContent, customExcludes);
}

async function findGitRoot(startPath: string): Promise<string | null> {
  let current = startPath;
  const { root } = parse(current);

  while (current !== root) {
    try {
      const gitDir = join(current, ".git");
      const stats = await stat(gitDir);
      if (stats.isDirectory() || stats.isFile()) {
        return current;
      }
    } catch {
      // Not found, continue
    }
    
    const parent = join(current, "..");
    if (parent === current) break;
    current = parent;
  }

  return null;
}
