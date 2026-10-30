import type { DietResult } from "./types.js";

/** Minimal SARIF 2.1.0 for budget / diet gate failures (GitHub Code Scanning). */
export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri?: string;
        rules: Array<{ id: string; shortDescription: { text: string } }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: "error" | "warning" | "note";
      message: { text: string };
      locations?: Array<{
        physicalLocation?: {
          artifactLocation?: { uri: string };
          region?: { startLine?: number };
        };
      }>;
      properties?: Record<string, unknown>;
    }>;
  }>;
}

export interface SarifBudget {
  failOverTokens?: number;
  maxTokens?: number;
}

function oneLine(text: string, max = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

/**
 * SARIF for over-budget output (and optional soft max-tokens note).
 * Clean / under-budget runs still emit a valid log with zero results.
 */
export function renderSarif(
  result: DietResult,
  source: string,
  version: string,
  budget: SarifBudget = {},
): SarifLog {
  const results: SarifLog["runs"][0]["results"] = [];
  if (
    budget.failOverTokens != null &&
    result.output.tokens > budget.failOverTokens
  ) {
    results.push({
      ruleId: "over-fail-over-tokens",
      level: "error",
      message: {
        text: oneLine(
          `output tokens ~${result.output.tokens} exceed --fail-over-tokens ${budget.failOverTokens}`,
        ),
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: source },
            region: { startLine: 1 },
          },
        },
      ],
      properties: {
        outputTokens: result.output.tokens,
        failOverTokens: budget.failOverTokens,
        ...(budget.maxTokens != null ? { maxTokens: budget.maxTokens } : {}),
      },
    });
  }

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "context-diet",
            version,
            informationUri: "https://github.com/webywz/context-diet",
            rules: [
              {
                id: "over-fail-over-tokens",
                shortDescription: {
                  text: "Slimmed output still exceeds --fail-over-tokens budget",
                },
              },
            ],
          },
        },
        results,
      },
    ],
  };
}

export function formatSarif(
  result: DietResult,
  source: string,
  version: string,
  budget: SarifBudget = {},
): string {
  return `${JSON.stringify(renderSarif(result, source, version, budget), null, 2)}\n`;
}
