/**
 * Dependency-free secret scrubbing for context that may leave a machine.
 * Opt-in via `--redact` / `DietOptions.redact`. Patterns are shape-based
 * heuristics — not a security scanner.
 */

export const REDACTED = "[redacted]";

export interface RedactCuts {
  secretsRedacted: number;
}

const PEM_RE =
  /-----BEGIN[ A-Z0-9]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9]*PRIVATE KEY-----/g;

/** JWT-ish: three base64url segments; header usually starts with eyJ. */
const JWT_RE =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** OpenAI / Anthropic style secret keys. */
const SK_RE = /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}\b/g;

/** GitHub PATs / OAuth tokens. */
const GITHUB_RE =
  /\b(?:ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

/** Slack bot / user tokens. */
const SLACK_RE = /\bxox[bp]-[0-9A-Za-z-]{10,}\b/g;

/** AWS access key IDs. */
const AWS_AKIA_RE = /\bAKIA[0-9A-Z]{16}\b/g;

/** Authorization: Bearer <token> (or bare Bearer …). */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Authorization: Basic <base64>. */
const BASIC_RE = /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi;

const PATTERNS: RegExp[] = [
  PEM_RE,
  JWT_RE,
  SK_RE,
  GITHUB_RE,
  SLACK_RE,
  AWS_AKIA_RE,
  BEARER_RE,
  BASIC_RE,
];

/**
 * Replace common secret shapes with {@link REDACTED}.
 * Mutates `cuts.secretsRedacted` by the number of replacements.
 */
export function redactSecrets(text: string, cuts: RedactCuts): string {
  let next = text;
  for (const pattern of PATTERNS) {
    // Reset lastIndex for safety with global flags reused across calls.
    pattern.lastIndex = 0;
    next = next.replace(pattern, () => {
      cuts.secretsRedacted += 1;
      return REDACTED;
    });
  }
  return next;
}
