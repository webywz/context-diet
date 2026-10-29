export type BlockType =
  | "code"
  | "heading"
  | "list"
  | "paragraph"
  | "blank"
  | "rule";

export interface Block {
  type: BlockType;
  raw: string;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_RE = /^ {0,3}#{1,6}(?:\s+\S|\s*$)/;
const RULE_RE = /^ {0,3}(?:(?:-[\t ]*){3,}|(?:_[\t ]*){3,}|(?:\*[\t ]*){3,})\s*$/;
const LIST_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])\s+\S/;
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/;

function isSetextUnderline(line: string, heading: string): boolean {
  if (!SETEXT_RE.test(line)) return false;
  const mark = line.trim();
  // Long runs of =/- are banners, not Setext underlines.
  if (mark.length > 40) return false;
  if (heading.trim().length > 80) return false;
  return true;
}

function fenceCloser(opener: string): RegExp {
  const ch = opener[0] === "~" ? "~" : "`";
  const n = opener.length;
  return new RegExp(`^ {0,3}${ch}{${n},}\\s*$`);
}

export function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const push = (type: BlockType, chunk: string[]): void => {
    if (chunk.length === 0) return;
    blocks.push({ type, raw: chunk.join("\n") });
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const fence = FENCE_RE.exec(line);

    if (fence) {
      const marker = fence[1]!;
      const chunk = [line];
      i++;
      const closer = fenceCloser(marker);
      while (i < lines.length) {
        chunk.push(lines[i]!);
        const isClose = closer.test(lines[i]!);
        i++;
        if (isClose) break;
      }
      push("code", chunk);
      continue;
    }

    if (line.trim() === "") {
      const chunk = [line];
      i++;
      while (i < lines.length && lines[i]!.trim() === "") {
        chunk.push(lines[i]!);
        i++;
      }
      push("blank", chunk);
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ type: "rule", raw: line });
      i++;
      continue;
    }

    if (ATX_RE.test(line)) {
      blocks.push({ type: "heading", raw: line });
      i++;
      continue;
    }

    if (
      i + 1 < lines.length &&
      line.trim() !== "" &&
      !LIST_RE.test(line) &&
      isSetextUnderline(lines[i + 1]!, line)
    ) {
      blocks.push({ type: "heading", raw: `${line}\n${lines[i + 1]!}` });
      i += 2;
      continue;
    }

    if (LIST_RE.test(line)) {
      const chunk = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i]!;
        if (next.trim() === "") break;
        if (FENCE_RE.test(next) || ATX_RE.test(next) || RULE_RE.test(next)) break;
        if (LIST_RE.test(next) || /^\s+\S/.test(next)) {
          chunk.push(next);
          i++;
          continue;
        }
        break;
      }
      push("list", chunk);
      continue;
    }

    const chunk = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      if (next.trim() === "") break;
      if (
        FENCE_RE.test(next) ||
        ATX_RE.test(next) ||
        RULE_RE.test(next) ||
        LIST_RE.test(next)
      ) {
        break;
      }
      if (
        i + 1 < lines.length &&
        next.trim() !== "" &&
        isSetextUnderline(lines[i + 1]!, next)
      ) {
        break;
      }
      chunk.push(next);
      i++;
    }
    push("paragraph", chunk);
  }

  return blocks;
}

export function joinBlocks(blocks: Block[]): string {
  const chunks = blocks
    .filter((b) => b.type !== "blank")
    .map((b) => b.raw.replace(/[ \t]+$/gm, "").trimEnd())
    .filter((s) => s.length > 0);
  if (chunks.length === 0) return "";
  return `${chunks.join("\n\n")}\n`;
}
