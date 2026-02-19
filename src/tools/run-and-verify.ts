import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseRunAndVerifyOutput } from "../services/output-parser.js";
import { DIAGNOSTIC_TOOLS, DEFAULT_TIMEOUT } from "../constants.js";
import type { RunAndVerifyOutput, ProgressCallback } from "../types.js";

interface RunAndVerifyInput {
  command: string;
  workingDirectory: string;
  successCriteria?: string;
  fixOnFailure: boolean;
}

export async function runAndVerify(
  input: RunAndVerifyInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<RunAndVerifyOutput> {
  const criteriaNote = input.successCriteria
    ? `\n\nSuccess criteria: ${input.successCriteria}`
    : "";

  const fixInstruction = input.fixOnFailure
    ? "If the command fails, diagnose the issue, apply a fix, and re-run the command."
    : "If the command fails, explain what went wrong but do NOT modify any files.";

  const prompt =
    `Run the following command and interpret the results:\n\n` +
    `\`${input.command}\`\n\n` +
    `${fixInstruction}${criteriaNote}\n\n` +
    `Provide a clear interpretation of the command output indicating whether it succeeded or failed.`;

  const allowedTools = input.fixOnFailure
    ? undefined // all tools
    : DIAGNOSTIC_TOOLS;

  const result = await runClaudeCode({
    prompt,
    workingDirectory: input.workingDirectory,
    allowedTools,
    maxTurns: input.fixOnFailure ? 40 : 10,
    timeout: DEFAULT_TIMEOUT,
    onProgress,
    signal,
  });

  if (result.timedOut) {
    return {
      commandOutput: result.stdout || result.stderr,
      success: false,
      interpretation: "Command or fix process timed out.",
      fixApplied: false,
      fixDescription: "",
    };
  }

  return parseRunAndVerifyOutput(
    result.stdout,
    result.exitCode,
    input.fixOnFailure
  );
}
