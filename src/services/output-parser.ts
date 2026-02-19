import type {
  ExecuteTaskOutput,
  PlanTaskOutput,
  ReviewCodeOutput,
  ReviewIssue,
  DebugOutput,
  RunAndVerifyOutput,
} from "../types.js";

interface ClaudeJsonResult {
  type: string;
  subtype: string;
  cost_usd: number;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd?: number;
}

function tryParseJson(raw: string): ClaudeJsonResult | null {
  try {
    return JSON.parse(raw) as ClaudeJsonResult;
  } catch {
    return null;
  }
}

function extractResultText(raw: string): string {
  const parsed = tryParseJson(raw);
  if (parsed?.result) {
    return parsed.result;
  }
  return raw;
}

function extractFilesFromText(
  text: string,
  pattern: RegExp
): string[] {
  const files: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) {
      files.push(match[1].trim());
    }
  }
  return [...new Set(files)];
}

export function parseExecuteTaskOutput(
  raw: string,
  exitCode: number
): ExecuteTaskOutput {
  const resultText = extractResultText(raw);

  const filesCreated = extractFilesFromText(
    resultText,
    /(?:creat(?:ed?|ing)|wrote|new file)[:\s]+[`"']?([^\s`"',]+\.\w+)/gi
  );
  const filesModified = extractFilesFromText(
    resultText,
    /(?:modif(?:ied|ying)|edit(?:ed|ing)|updat(?:ed|ing)|chang(?:ed|ing))[:\s]+[`"']?([^\s`"',]+\.\w+)/gi
  );
  const commandsRun = extractFilesFromText(
    resultText,
    /(?:ran|running|executed?|executing|\$)\s+[`"']?([^\n`"']+)/gi
  );

  return {
    summary: resultText.slice(0, 2000),
    filesCreated,
    filesModified,
    commandsRun,
    success: exitCode === 0,
    rawOutput: raw,
  };
}

export function parsePlanTaskOutput(raw: string): PlanTaskOutput {
  const resultText = extractResultText(raw);

  // Extract numbered steps
  const stepMatches = resultText.match(/^\s*\d+[.)]\s+.+$/gm) || [];
  const steps = stepMatches.map((s) => s.replace(/^\s*\d+[.)]\s+/, "").trim());

  // Extract file references
  const filePattern = /[`"']([^\s`"']+\.\w{1,10})[`"']/g;
  const estimatedFiles: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(resultText)) !== null) {
    if (match[1] && !match[1].startsWith("http")) {
      estimatedFiles.push(match[1]);
    }
  }

  return {
    plan: resultText,
    steps: steps.length > 0 ? steps : [resultText],
    estimatedFiles: [...new Set(estimatedFiles)],
  };
}

export function parseReviewCodeOutput(
  raw: string,
  exitCode: number
): ReviewCodeOutput {
  const resultText = extractResultText(raw);

  const issues: ReviewIssue[] = [];

  // Try to extract structured issues from the output
  const issueBlocks = resultText.split(/(?=(?:critical|warning|info|issue|bug|problem))/gi);
  for (const block of issueBlocks) {
    if (block.length < 10) continue;

    let severity: ReviewIssue["severity"] = "info";
    if (/critical|severe|high/i.test(block)) severity = "critical";
    else if (/warning|medium|moderate/i.test(block)) severity = "warning";

    const fileMatch = block.match(/(?:in|at|file)\s+[`"']?([^\s`"':]+\.\w+)/i);
    const lineMatch = block.match(/(?:line|L)\s*(\d+)/i);

    if (fileMatch) {
      issues.push({
        severity,
        file: fileMatch[1] || "",
        line: lineMatch?.[1] || "",
        description: block.slice(0, 500).trim(),
        suggestion: "",
      });
    }
  }

  // Heuristic score: start at 8, deduct for issues
  let score = 8;
  for (const issue of issues) {
    if (issue.severity === "critical") score -= 2;
    else if (issue.severity === "warning") score -= 1;
    else score -= 0.5;
  }
  score = Math.max(0, Math.min(10, score));

  return {
    summary: resultText.slice(0, 2000),
    issues,
    score: Math.round(score * 10) / 10,
  };
}

export function parseDebugOutput(
  raw: string,
  exitCode: number,
  autoFix: boolean
): DebugOutput {
  const resultText = extractResultText(raw);

  const filesModified = autoFix
    ? extractFilesFromText(
        resultText,
        /(?:modif(?:ied|ying)|edit(?:ed|ing)|fix(?:ed|ing)|updat(?:ed|ing)|chang(?:ed|ing))[:\s]+[`"']?([^\s`"',]+\.\w+)/gi
      )
    : [];

  // Try to extract root cause section
  const rootCauseMatch = resultText.match(
    /(?:root\s*cause|cause|reason|because)[:\s]+(.+?)(?:\n\n|\n(?=[A-Z])|$)/is
  );

  return {
    diagnosis: resultText.slice(0, 2000),
    rootCause: rootCauseMatch?.[1]?.trim() || "See diagnosis for details",
    fix: {
      description: autoFix
        ? resultText.slice(0, 1000)
        : "Auto-fix was not enabled. Review the diagnosis above.",
      filesModified,
    },
    success: exitCode === 0,
  };
}

export function parseRunAndVerifyOutput(
  raw: string,
  exitCode: number,
  fixOnFailure: boolean
): RunAndVerifyOutput {
  const resultText = extractResultText(raw);

  const fixApplied =
    fixOnFailure && /(?:fix(?:ed|ing)|resolv(?:ed|ing)|repair(?:ed|ing))/i.test(resultText);

  return {
    commandOutput: resultText,
    success: exitCode === 0,
    interpretation: resultText.slice(0, 2000),
    fixApplied,
    fixDescription: fixApplied
      ? resultText.slice(0, 1000)
      : "",
  };
}
