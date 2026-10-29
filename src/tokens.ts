/**
 * Approximate a cl100k_base (GPT-4 family) token count without shipping a BPE
 * table. Tuned for English prose, source code, and CJK. Typical error vs
 * tiktoken is within ~20% on mixed technical text — enough to budget a prompt,
 * not enough to bill on.
 */
const CJK_CODE_POINT = (code: number): boolean =>
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0x3400 && code <= 0x4dbf) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0x3040 && code <= 0x30ff) ||
  (code >= 0x31f0 && code <= 0x31ff) ||
  (code >= 0xac00 && code <= 0xd7af) ||
  (code >= 0x1100 && code <= 0x11ff);

function isLetter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 0xc0 && code <= 0x24f && ch.toLowerCase() !== ch.toUpperCase())
  );
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i]!;
    const code = text.charCodeAt(i);

    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    if (ch === "\n") {
      tokens += 0.25;
      i++;
      continue;
    }

    if (CJK_CODE_POINT(code)) {
      tokens += 1;
      i++;
      continue;
    }

    if (isLetter(ch)) {
      let j = i + 1;
      while (j < len && isLetter(text[j]!)) j++;
      const wordLen = j - i;
      // Short function words / identifiers are usually 1 piece; longer words
      // split roughly every 4 characters, matching cl100k's byte-pair grain.
      tokens += wordLen <= 5 ? 1 : Math.ceil(wordLen / 4);
      i = j;
      continue;
    }

    if (isDigit(ch)) {
      let j = i + 1;
      while (j < len && isDigit(text[j]!)) j++;
      tokens += Math.max(1, Math.ceil((j - i) / 3));
      i = j;
      continue;
    }

    tokens += 1;
    i++;
  }

  return Math.max(text.length === 0 ? 0 : 1, Math.round(tokens));
}

export function snapshot(text: string): { chars: number; tokens: number } {
  return { chars: text.length, tokens: estimateTokens(text) };
}
