import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseReviewCodeOutput } from "../services/output-parser.js";
import { READ_ONLY_TOOLS, REVIEW_TIMEOUT } from "../constants.js";
import type { ReviewCodeOutput, ProgressCallback } from "../types.js";

interface ReviewCodeInput {
  target: string;
  workingDirectory: string;
  focus: "bugs" | "performance" | "security" | "readability" | "all";
}

const FOCUS_INSTRUCTIONS: Record<string, string> = {
  bugs: "Focus specifically on bugs, logic errors, edge cases, null/undefined issues, and incorrect behavior.",
  performance:
    "Focus specifically on performance issues: unnecessary re-renders, N+1 queries, memory leaks, inefficient algorithms, and missing caching.",
  security:
    "Focus specifically on security vulnerabilities: injection attacks, XSS, CSRF, auth issues, exposed secrets, and insecure configurations.",
  readability:
    "Focus specifically on code readability: naming, structure, complexity, documentation, and adherence to conventions.",
  all: "Review for bugs, performance, security, and readability issues.",
};

export async function reviewCode(
  input: ReviewCodeInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ReviewCodeOutput> {
  const focusInstruction = FOCUS_INSTRUCTIONS[input.focus] || FOCUS_INSTRUCTIONS.all;

  const prompt =
    `Review the following code target: ${input.target}\n\n` +
    `${focusInstruction}\n\n` +
    `For each issue found, provide:\n` +
    `- Severity (critical, warning, or info)\n` +
    `- File path and line number\n` +
    `- Description of the issue\n` +
    `- Suggested fix\n\n` +
    `End with an overall summary and a quality score from 0-10.`;

  const result = await runClaudeCode({
    prompt,
    workingDirectory: input.workingDirectory,
    allowedTools: READ_ONLY_TOOLS,
    maxTurns: 20,
    timeout: REVIEW_TIMEOUT,
    onProgress,
    signal,
  });

  if (result.timedOut) {
    return {
      summary: "Code review timed out. Try reviewing a smaller scope.",
      issues: [],
      score: 0,
    };
  }

  return parseReviewCodeOutput(result.stdout, result.exitCode);
}
